from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass
from datetime import date, datetime
from typing import Callable, TypeVar

from sqlalchemy.orm import Session

from app.agents.agent1_intent_parser import run_agent1_intent_parser
from app.agents.agent2_bom_master import Agent2Output, run_agent2_bom_master
from app.agents.agent3_mrp_engine import run_agent3_mrp_engine
from app.agents.agent4_plan_coordinator import run_agent4_approve_and_sync, run_agent4_create_plan_versions
from app.agents.agent5_exception_monitor import run_agent5_disruption_intake, run_agent5_shelf_life_daily_scan
from app.config import settings
from app.modules.logging_utils import get_logger, log_structured
from app.modules.metrics_collector import record_agent_run, record_metric
from app.modules.disruption_intake import DisruptionPayload
from app.models.mps import MPSOrder
from app.models.plan import MRPPlanSession
from app.modules.mps_parser import ParsedConstraints, ParsedMPS, ParsedOrder


T = TypeVar("T")


@dataclass(slots=True)
class TaskRunLog:
    agent_name: str
    task_name: str
    duration_ms: int
    status: str
    error_message: str = ""


class MRPCrewOrchestrator:
    """
    Phase 3 Crew 编排入口。
    保持 provider-agnostic：LLM 信息来自 config，但 Phase 3 不强依赖外部调用。
    """

    def __init__(self) -> None:
        self.llm_provider = settings.llm_provider
        self.llm_model = settings.llm_model
        self.task_logs: list[TaskRunLog] = []
        self._db: Session | None = None
        self._session_id: str | None = None
        self._logger = get_logger("crew")

    def run_mps_to_plan(
        self,
        db: Session,
        mps_file_bytes: bytes,
        notes: str,
        today: date | None = None,
    ) -> dict:
        crew_start = time.perf_counter()
        today = today or date.today()
        session_id = self._generate_session_id(db, today)
        self.task_logs = []
        self._db = db
        self._session_id = session_id

        parsed = self._run_task("Agent1", "parse_mps", lambda: run_agent1_intent_parser(mps_file_bytes, notes))
        for order in parsed.orders:
            db.add(
                MPSOrder(
                    session_id=session_id,
                    fg_pn=order.fg_pn,
                    qty=order.qty,
                    due_date=order.due_date,
                    priority=order.priority,
                    constraints_json=json.dumps(
                        {
                            "no_us_material": parsed.constraints.no_us_material,
                            "auto_grade": parsed.constraints.auto_grade,
                            "custom_notes": parsed.constraints.custom_notes,
                        },
                        ensure_ascii=False,
                    ),
                )
            )
        db.commit()

        agent2_payload: Agent2Output = self._run_task("Agent2", "expand_bom", lambda: run_agent2_bom_master(db, parsed))
        mrp_result = self._run_task(
            "Agent3",
            "run_mrp_engine",
            lambda: run_agent3_mrp_engine(agent2_payload, today, db=db, session_id=session_id),
        )
        plan_result = self._run_task(
            "Agent4",
            "create_versions",
            lambda: run_agent4_create_plan_versions(
                db,
                session_id,
                parsed.orders[0].fg_pn,
                mrp_result,
                create_ab_versions=False,
            ),
        )
        record_metric(db, session_id=session_id, name="mrp_session_total", value=1, unit="count")
        record_metric(db, session_id=session_id, name="mrp_session_success", value=1 if mrp_result.status == "success" else 0, unit="count")

        crew_duration_ms = int((time.perf_counter() - crew_start) * 1000)
        if crew_duration_ms > 60000:
            log_structured(
                self._logger,
                level="warning",
                module="crew",
                message="crew execution is slow",
                session_id=session_id,
                duration_ms=crew_duration_ms,
                status="slow",
            )
        return {
            "session_id": session_id,
            "warnings": agent2_payload.warnings,
            "mrp_status": mrp_result.status,
            "plan_status": plan_result["status"],
            "task_logs": [asdict(log) for log in self.task_logs],
        }

    def approve_plan(self, db: Session, session_id: str, selected_version: str) -> dict:
        self._db = db
        self._session_id = session_id
        return self._run_task(
            "Agent4",
            "approve_and_sync",
            lambda: run_agent4_approve_and_sync(db=db, session_id=session_id, selected_version=selected_version),
        )

    def intake_disruption(self, db: Session, payload: DisruptionPayload) -> dict:
        self._db = db
        result = self._run_task("Agent5", "intake_disruption", lambda: run_agent5_disruption_intake(db, payload))
        return {"disruption_id": result.disruption_id, "blast_radius": [asdict(item) for item in result.blast_radius]}

    def run_daily_shelf_life_scan(self, db: Session, today: date | None = None) -> dict:
        self._db = db
        today = today or date.today()
        result = self._run_task("Agent5", "shelf_life_scan", lambda: run_agent5_shelf_life_daily_scan(db, today))
        return {"total_scanned": result.total_scanned, "alerted_count": result.alerted_count}

    def reschedule_session(
        self,
        db: Session,
        session_id: str,
        param_overrides: dict,
        today: date | None = None,
    ) -> dict:
        """
        Re-run scheduling pipeline for an existing session with user-confirmed structured overrides.
        LLM only provides intent parsing; this method keeps all math deterministic.
        """
        today = today or date.today()
        rows = db.query(MPSOrder).filter(MPSOrder.session_id == session_id).all()
        if not rows:
            raise ValueError(f"session_id={session_id} 不存在")

        constraints = json.loads(rows[0].constraints_json) if rows[0].constraints_json else {}
        no_us_material = bool(param_overrides.get("no_us_material", constraints.get("no_us_material", False)))
        auto_grade = bool(constraints.get("auto_grade", False))
        custom_notes = str(constraints.get("custom_notes", ""))
        due_override = param_overrides.get("new_due_date")
        target_fg_pn = param_overrides.get("target_fg_pn")
        if due_override is not None and not isinstance(due_override, date):
            due_override = date.fromisoformat(str(due_override))

        parsed_orders: list[ParsedOrder] = []
        for row in rows:
            order_due = row.due_date
            if due_override is not None and (not target_fg_pn or target_fg_pn == row.fg_pn):
                order_due = due_override
                row.due_date = order_due
            row.constraints_json = json.dumps(
                {
                    "no_us_material": no_us_material,
                    "auto_grade": auto_grade,
                    "custom_notes": custom_notes,
                    "deadline_override": due_override.isoformat() if isinstance(due_override, date) else None,
                },
                ensure_ascii=False,
            )
            parsed_orders.append(
                ParsedOrder(
                    fg_pn=row.fg_pn,
                    qty=row.qty,
                    due_date=order_due,
                    priority=row.priority,
                )
            )
        db.commit()

        applies_to_all = due_override is not None and not target_fg_pn
        parsed = ParsedMPS(
            orders=parsed_orders,
            constraints=ParsedConstraints(
                no_us_material=no_us_material,
                auto_grade=auto_grade,
                custom_notes=custom_notes,
                deadline_override=due_override if applies_to_all else None,
            ),
        )

        self._db = db
        self._session_id = session_id
        self.task_logs = []
        agent2_payload: Agent2Output = self._run_task("Agent2", "expand_bom_reschedule", lambda: run_agent2_bom_master(db, parsed))

        baseline_versions = (
            db.query(MRPPlanSession)
            .filter(MRPPlanSession.session_id == session_id)
            .order_by(MRPPlanSession.version.asc())
            .all()
        )
        baseline_b = next((v for v in baseline_versions if v.version == "B"), baseline_versions[0] if baseline_versions else None)
        baseline_orders = json.loads(baseline_b.planned_orders_json) if baseline_b else None
        baseline_report = json.loads(baseline_b.conflict_report_json) if baseline_b else None

        mrp_result = self._run_task(
            "Agent3",
            "run_mrp_engine_reschedule",
            lambda: run_agent3_mrp_engine(agent2_payload, today, db=db, session_id=session_id),
        )
        plan_result = self._run_task(
            "Agent4",
            "create_versions_reschedule",
            lambda: run_agent4_create_plan_versions(
                db,
                session_id,
                parsed.orders[0].fg_pn,
                mrp_result,
                baseline_orders=baseline_orders,
                baseline_conflict_report=baseline_report,
            ),
        )
        return {
            "session_id": session_id,
            "mrp_status": mrp_result.status,
            "plan_status": plan_result["status"],
            "task_logs": [asdict(log) for log in self.task_logs],
        }

    def _run_task(self, agent_name: str, task_name: str, fn: Callable[[], T]) -> T:
        start = time.perf_counter()
        started_at = datetime.utcnow()
        try:
            result = fn()
            duration_ms = int((time.perf_counter() - start) * 1000)
            self.task_logs.append(TaskRunLog(agent_name, task_name, duration_ms, "success"))
            if self._db is not None:
                record_agent_run(
                    self._db,
                    session_id=self._session_id,
                    agent_name=agent_name,
                    task_name=task_name,
                    start_at=started_at,
                    end_at=datetime.utcnow(),
                    duration_ms=duration_ms,
                    status="success",
                )
            return result
        except Exception as exc:
            duration_ms = int((time.perf_counter() - start) * 1000)
            self.task_logs.append(TaskRunLog(agent_name, task_name, duration_ms, "failed", str(exc)))
            if self._db is not None:
                record_agent_run(
                    self._db,
                    session_id=self._session_id,
                    agent_name=agent_name,
                    task_name=task_name,
                    start_at=started_at,
                    end_at=datetime.utcnow(),
                    duration_ms=duration_ms,
                    status="failed",
                    error_message=str(exc),
                )
            raise

    def _generate_session_id(self, db: Session, day: date) -> str:
        prefix = f"MRP-{day.strftime('%Y%m%d')}-"
        existing_rows = (
            db.query(MPSOrder.session_id)
            .filter(MPSOrder.session_id.like(f"{prefix}%"))
            .distinct()
            .all()
        )

        max_seq = 0
        for (sid,) in existing_rows:
            if not sid or not sid.startswith(prefix):
                continue
            suffix = sid[len(prefix) :]
            if suffix.isdigit():
                max_seq = max(max_seq, int(suffix))

        return f"{prefix}{max_seq + 1:02d}"
