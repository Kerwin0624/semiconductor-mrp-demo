import json
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.agent4_plan_coordinator import apply_manual_edits_before_approval
from app.agents.crew import MRPCrewOrchestrator
from app.database import get_db
from app.models.material import MaterialMaster
from app.models.mps import MPSOrder
from app.models.plan import MRPPlanSession
from app.schemas import PlanApproveRequest

router = APIRouter()


@router.get("")
def list_plan_sessions(status: str | None = None, db: Session = Depends(get_db)) -> dict:
    query = db.query(MRPPlanSession)
    if status:
        query = query.filter(MRPPlanSession.status == status)
    rows = query.order_by(MRPPlanSession.created_at.desc()).all()

    grouped: dict[str, list[MRPPlanSession]] = defaultdict(list)
    for row in rows:
        grouped[row.session_id].append(row)

    session_ids = list(grouped.keys())
    fg_map: dict[str, list[str]] = defaultdict(list)
    if session_ids:
        mps_rows = (
            db.query(MPSOrder)
            .filter(MPSOrder.session_id.in_(session_ids))
            .order_by(MPSOrder.created_at.asc(), MPSOrder.id.asc())
            .all()
        )
        for mps in mps_rows:
            if mps.fg_pn not in fg_map[mps.session_id]:
                fg_map[mps.session_id].append(mps.fg_pn)

    sessions = []
    for session_id, versions in grouped.items():
        fg_display = " / ".join(fg_map.get(session_id, [])) or versions[0].fg_pn
        sessions.append(
            {
                "session_id": session_id,
                "fg_pn": fg_display,
                "status": versions[0].status,
                "selected_version": versions[0].selected_version,
                "created_at": versions[0].created_at.isoformat(),
                "versions": sorted([item.version for item in versions]),
            }
        )
    return {"items": sessions}


@router.get("/{session_id}")
def get_plan_session(session_id: str, db: Session = Depends(get_db)) -> dict:
    rows = (
        db.query(MRPPlanSession)
        .filter(MRPPlanSession.session_id == session_id)
        .order_by(MRPPlanSession.version.asc())
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="session 不存在")

    all_orders = []
    version_orders_map: dict[str, list[dict]] = {}
    for row in rows:
        orders = json.loads(row.planned_orders_json)
        version_orders_map[row.version] = orders
        all_orders.extend(orders)

    material_pns = list({o["material_pn"] for o in all_orders})
    mat_rows = db.query(MaterialMaster).filter(MaterialMaster.material_pn.in_(material_pns)).all() if material_pns else []
    mat_map = {m.material_pn: m for m in mat_rows}

    versions = []
    for row in rows:
        enriched = []
        for o in version_orders_map[row.version]:
            mat = mat_map.get(o["material_pn"])
            enriched.append({
                **o,
                "description": mat.description if mat else "",
                "supplier_name": mat.supplier_name if mat else "",
            })
        versions.append({
            "version": row.version,
            "planned_orders": enriched,
            "conflict_report": json.loads(row.conflict_report_json),
        })

    return {
        "session_id": session_id,
        "status": rows[0].status,
        "selected_version": rows[0].selected_version,
        "versions": versions,
    }


@router.get("/{session_id}/mrp-detail")
def get_mrp_detail(session_id: str, version: str | None = None, db: Session = Depends(get_db)) -> dict:
    """Return Version B planned orders enriched with material master data."""
    rows = (
        db.query(MRPPlanSession)
        .filter(MRPPlanSession.session_id == session_id)
        .order_by(MRPPlanSession.version.asc())
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="session 不存在")

    available_versions = {r.version for r in rows}
    if version:
        normalized = version.upper()
        if normalized not in {"A", "B"}:
            raise HTTPException(status_code=400, detail="version 仅支持 A 或 B")
        if normalized not in available_versions:
            raise HTTPException(status_code=400, detail=f"session 不包含 Version {normalized}")
        active_row = next((r for r in rows if r.version == normalized), rows[0])
    else:
        selected_version = rows[0].selected_version
        status = rows[0].status
        if status == "pending_approval" or not selected_version:
            active_row = next((r for r in rows if r.version == "A"), rows[0])
        else:
            active_row = next((r for r in rows if r.version == selected_version), rows[0])

    planned_orders = json.loads(active_row.planned_orders_json)
    conflict_report = json.loads(active_row.conflict_report_json)

    material_pns = list({o["material_pn"] for o in planned_orders})
    mat_rows = db.query(MaterialMaster).filter(MaterialMaster.material_pn.in_(material_pns)).all()
    mat_map = {m.material_pn: m for m in mat_rows}

    mps_rows = db.query(MPSOrder).filter(MPSOrder.session_id == session_id).all()
    mps_map = {m.fg_pn: {"qty": m.qty, "due_date": m.due_date.isoformat(), "priority": m.priority} for m in mps_rows}

    enriched = []
    for o in planned_orders:
        mat = mat_map.get(o["material_pn"])
        available = (mat.on_hand_inventory + mat.in_transit_inventory) if mat else 0
        remaining = available - o["gross_req"]
        mps_info = mps_map.get(o.get("fg_pn", ""), {})
        enriched.append({
            **o,
            "lead_time_days": mat.lead_time_days if mat else None,
            "on_hand_inventory": mat.on_hand_inventory if mat else None,
            "in_transit_inventory": mat.in_transit_inventory if mat else None,
            "available_inventory": available if mat else None,
            "remaining_after_use": remaining if mat else None,
            "safety_stock": mat.safety_stock if mat else None,
            "lot_size": mat.lot_size if mat else None,
            "yield_rate": mat.yield_rate if mat else None,
            "shelf_life_expiry": mat.shelf_life_expiry.isoformat() if mat and mat.shelf_life_expiry else None,
            "description": mat.description if mat else "",
            "material_type": mat.material_type if mat else "",
            "inventory_uom": mat.inventory_uom if mat else "EA",
            "supplier_name": mat.supplier_name if mat else "",
            "order_qty": mps_info.get("qty"),
            "order_due_date": mps_info.get("due_date"),
            "order_priority": mps_info.get("priority"),
        })

    has_versions = len(rows) > 1
    return {
        "session_id": session_id,
        "status": rows[0].status,
        "selected_version": rows[0].selected_version,
        "active_version": active_row.version,
        "has_ab_versions": has_versions,
        "conflict_report": conflict_report,
        "planned_orders": enriched,
        "mps_orders": [
            {"fg_pn": m.fg_pn, "qty": m.qty, "due_date": m.due_date.isoformat(), "priority": m.priority}
            for m in mps_rows
        ],
    }


@router.post("/{session_id}/approve")
def approve_plan(session_id: str, body: PlanApproveRequest, db: Session = Depends(get_db)) -> dict:
    crew = MRPCrewOrchestrator()
    try:
        apply_manual_edits_before_approval(
            db=db,
            session_id=session_id,
            selected_version=body.selected_version,
            edited_orders=body.edited_orders,
        )
        result = crew.approve_plan(db, session_id=session_id, selected_version=body.selected_version)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{session_id}/draft")
def save_plan_draft(session_id: str, body: PlanApproveRequest, db: Session = Depends(get_db)) -> dict:
    rows = (
        db.query(MRPPlanSession)
        .filter(MRPPlanSession.session_id == session_id)
        .order_by(MRPPlanSession.version.asc())
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="session 不存在")
    if rows[0].status != "pending_approval":
        raise HTTPException(status_code=400, detail="仅 pending_approval 状态可保存仿真草案")
    try:
        apply_manual_edits_before_approval(
            db=db,
            session_id=session_id,
            selected_version=body.selected_version,
            edited_orders=body.edited_orders,
        )
        return {
            "status": "pending_approval",
            "selected_version": body.selected_version,
            "saved_edits": len(body.edited_orders),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{session_id}")
def delete_plan_session(session_id: str, db: Session = Depends(get_db)) -> dict:
    plan_count = db.query(MRPPlanSession).filter(MRPPlanSession.session_id == session_id).delete()
    mps_count = db.query(MPSOrder).filter(MPSOrder.session_id == session_id).delete()
    if plan_count == 0 and mps_count == 0:
        raise HTTPException(status_code=404, detail="session 不存在")
    db.commit()
    return {"deleted_plans": plan_count, "deleted_mps_orders": mps_count}
