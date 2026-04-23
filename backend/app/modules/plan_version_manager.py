from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.plan import MRPPlanSession


class PlanVersionManager:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_versions(
        self,
        session_id: str,
        fg_pn: str,
        version_a_orders: list[dict[str, Any]],
        version_b_orders: list[dict[str, Any]] | None = None,
        conflict_report_a: dict[str, Any] | None = None,
        conflict_report_b: dict[str, Any] | None = None,
    ) -> None:
        self.db.query(MRPPlanSession).filter(
            MRPPlanSession.session_id == session_id,
        ).delete(synchronize_session="fetch")

        report_a = conflict_report_a or {}
        report_b = conflict_report_b or report_a
        a = MRPPlanSession(
            session_id=session_id,
            fg_pn=fg_pn,
            version="A",
            planned_orders_json=json.dumps(version_a_orders, ensure_ascii=False, default=str),
            conflict_report_json=json.dumps(report_a, ensure_ascii=False, default=str),
            status="pending_approval",
        )
        records = [a]
        if version_b_orders is not None:
            b = MRPPlanSession(
                session_id=session_id,
                fg_pn=fg_pn,
                version="B",
                planned_orders_json=json.dumps(version_b_orders, ensure_ascii=False, default=str),
                conflict_report_json=json.dumps(report_b, ensure_ascii=False, default=str),
                status="pending_approval",
            )
            records.append(b)
        self.db.add_all(records)
        self.db.commit()

    def list_sessions(self, status: str | None = None) -> list[MRPPlanSession]:
        query = self.db.query(MRPPlanSession)
        if status:
            query = query.filter(MRPPlanSession.status == status)
        return query.order_by(MRPPlanSession.created_at.desc()).all()

    def get_session_versions(self, session_id: str) -> list[MRPPlanSession]:
        return (
            self.db.query(MRPPlanSession)
            .filter(MRPPlanSession.session_id == session_id)
            .order_by(MRPPlanSession.version.asc())
            .all()
        )

    def approve(self, session_id: str, selected_version: str, approved_by: str = "planner") -> list[MRPPlanSession]:
        if selected_version not in {"A", "B"}:
            raise ValueError("selected_version 仅支持 A 或 B")

        records = self.get_session_versions(session_id)
        if not records:
            raise ValueError(f"session_id={session_id} 不存在")
        available_versions = {item.version for item in records}
        if selected_version not in available_versions:
            raise ValueError(f"session_id={session_id} 不存在 Version {selected_version}")

        for item in records:
            if item.status != "pending_approval":
                raise ValueError("仅 pending_approval 状态可审批")

        now = datetime.utcnow()
        for item in records:
            item.status = "approved"
            item.selected_version = selected_version
            item.approved_by = approved_by
            item.approved_at = now
        self.db.commit()
        return records

    def mark_srm_synced(self, session_id: str) -> list[MRPPlanSession]:
        records = self.get_session_versions(session_id)
        if not records:
            raise ValueError(f"session_id={session_id} 不存在")

        for item in records:
            if item.status != "approved":
                raise ValueError("仅 approved 状态可同步 SRM")
            item.status = "srm_synced"
        self.db.commit()
        return records
