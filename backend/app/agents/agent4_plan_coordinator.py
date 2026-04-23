from __future__ import annotations

import json
from dataclasses import asdict

from sqlalchemy.orm import Session

from app.modules.conflict_analyzer import generate_conflict_report
from app.modules.plan_version_manager import PlanVersionManager
from app.modules.mrp_engine import MRPResult
from app.modules.srm_syncer import sync_to_srm_mock


def run_agent4_create_plan_versions(
    db: Session,
    session_id: str,
    fg_pn: str,
    mrp_result: MRPResult,
    baseline_orders: list[dict] | None = None,
    baseline_conflict_report: dict | None = None,
    create_ab_versions: bool = True,
) -> dict:
    manager = PlanVersionManager(db)
    planned_b = [asdict(item) for item in mrp_result.planned_orders]
    planned_a = baseline_orders if baseline_orders is not None else planned_b
    report_a = baseline_conflict_report or {"status": "success", "notes": []}
    report_b = generate_conflict_report(mrp_result.conflicts) if mrp_result.status != "success" else {"status": "success", "notes": []}
    if not create_ab_versions:
        manager.create_versions(
            session_id=session_id,
            fg_pn=fg_pn,
            version_a_orders=planned_b,
            version_b_orders=None,
            conflict_report_a=report_b,
            conflict_report_b=None,
        )
        return {"status": "pending_approval", "has_conflict": mrp_result.status != "success"}

    if mrp_result.status == "success":
        manager.create_versions(
            session_id=session_id,
            fg_pn=fg_pn,
            version_a_orders=planned_a,
            version_b_orders=planned_b,
            conflict_report_a=report_a,
            conflict_report_b={"status": "success", "notes": []},
        )
        return {"status": "pending_approval", "has_conflict": False}

    manager.create_versions(
        session_id=session_id,
        fg_pn=fg_pn,
        version_a_orders=planned_a,
        version_b_orders=planned_b,
        conflict_report_a=report_a,
        conflict_report_b=report_b,
    )
    return {"status": "pending_approval", "has_conflict": True, "report": report_b}


def run_agent4_approve_and_sync(db: Session, session_id: str, selected_version: str) -> dict:
    manager = PlanVersionManager(db)
    records = manager.approve(session_id=session_id, selected_version=selected_version)

    selected_orders = []
    for item in records:
        if item.version == selected_version:
            selected_orders = json.loads(item.planned_orders_json)
            break

    sync_result = sync_to_srm_mock(db=db, session_id=session_id, planned_orders=selected_orders)
    manager.mark_srm_synced(session_id=session_id)
    return {"status": "srm_synced", "sync_result": sync_result}


def apply_manual_edits_before_approval(db: Session, session_id: str, selected_version: str, edited_orders: list[dict]) -> None:
    if not edited_orders:
        return
    manager = PlanVersionManager(db)
    records = manager.get_session_versions(session_id)
    target = next((x for x in records if x.version == selected_version), None)
    if target is None:
        raise ValueError(f"session_id={session_id} 不存在 Version {selected_version}")

    current_orders = json.loads(target.planned_orders_json)
    index = {}
    for row in current_orders:
        key = (str(row.get("material_pn", "")), str(row.get("fg_pn", "")))
        index[key] = row

    for edit in edited_orders:
        key = (str(edit.get("material_pn", "")), str(edit.get("fg_pn", "")))
        row = index.get(key)
        if not row:
            continue
        if "planned_qty" in edit:
            row["planned_qty"] = float(edit["planned_qty"])
        if "planned_order_date" in edit:
            row["planned_order_date"] = str(edit["planned_order_date"])

    target.planned_orders_json = json.dumps(current_orders, ensure_ascii=False, default=str)
    db.commit()
