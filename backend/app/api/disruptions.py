import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.agents.crew import MRPCrewOrchestrator
from app.database import get_db
from app.models.disruption import DisruptionEvent
from app.modules.disruption_intake import DisruptionPayload
from app.modules.intent_recognizer import recognize_intent, intent_result_to_dict, merge_confirmed_params

router = APIRouter()


class DisruptionCreateRequest(BaseModel):
    supplier_name: str
    affected_material_pns: list[str]
    disruption_days: int
    new_available_date: date | None = None
    source: str = "other"
    note: str = ""


class DisruptionChatRequest(BaseModel):
    message: str = Field(min_length=1)


class DisruptionChatConfirmRequest(BaseModel):
    intent: dict
    confirmed_params: dict = Field(default_factory=dict)


@router.post("/chat")
def disruption_chat(body: DisruptionChatRequest) -> dict:
    intent = recognize_intent(body.message)
    intent_payload = intent_result_to_dict(intent)
    return {
        "intent": intent_payload,
        "needs_confirmation": intent.intent_type != "unknown",
    }


@router.post("/chat/confirm")
def disruption_chat_confirm(body: DisruptionChatConfirmRequest, db: Session = Depends(get_db)) -> dict:
    intent_type_raw = str(body.intent.get("intent_type", "unknown"))
    if intent_type_raw != "supply_disruption":
        raise HTTPException(status_code=400, detail="此端点仅处理 supply_disruption 意图")

    recognized_params = body.intent.get("recognized_params", {}) or {}
    merged = merge_confirmed_params(
        intent_type="supply_disruption",
        recognized_params=recognized_params,
        confirmed_params=body.confirmed_params,
    )

    supplier_name = str(merged.get("supplier_name", "")).strip()
    if not supplier_name:
        raise HTTPException(status_code=400, detail="缺少 supplier_name")
    affected_pns = merged.get("affected_material_pns", [])
    if isinstance(affected_pns, str):
        affected_pns = [p.strip() for p in affected_pns.split(",") if p.strip()]
    if not affected_pns:
        raise HTTPException(status_code=400, detail="缺少 affected_material_pns")
    disruption_days = int(merged.get("disruption_days", 0))
    if disruption_days <= 0:
        raise HTTPException(status_code=400, detail="disruption_days 必须大于 0")

    new_avail_date = merged.get("new_available_date")
    if isinstance(new_avail_date, str) and new_avail_date:
        new_avail_date = date.fromisoformat(new_avail_date)
    else:
        new_avail_date = None

    crew = MRPCrewOrchestrator()
    try:
        result = crew.intake_disruption(
            db,
            DisruptionPayload(
                supplier_name=supplier_name,
                affected_material_pns=affected_pns,
                disruption_days=disruption_days,
                new_available_date=new_avail_date,
                source="chat",
                note=str(merged.get("note", "")),
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return result


@router.post("")
def create_disruption(body: DisruptionCreateRequest, db: Session = Depends(get_db)) -> dict:
    crew = MRPCrewOrchestrator()
    try:
        return crew.intake_disruption(
            db,
            DisruptionPayload(
                supplier_name=body.supplier_name,
                affected_material_pns=body.affected_material_pns,
                disruption_days=body.disruption_days,
                new_available_date=body.new_available_date,
                source=body.source,
                note=body.note,
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("")
def list_disruptions(db: Session = Depends(get_db)) -> dict:
    rows = db.query(DisruptionEvent).order_by(DisruptionEvent.created_at.desc()).all()
    return {
        "items": [
            {
                "event_id": row.event_id,
                "supplier_name": row.supplier_name,
                "affected_material_pns": json.loads(row.affected_material_pns_json or "[]"),
                "disruption_days": row.disruption_days,
                "new_available_date": row.new_available_date.isoformat() if row.new_available_date else None,
                "source": row.source,
                "note": row.note,
                "blast_radius": json.loads(row.blast_radius_json or "[]"),
                "status": row.status,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    }
