import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.agents.crew import MRPCrewOrchestrator
from app.database import get_db
from app.models.chat import ChatMessage
from app.models.mps import MPSOrder
from app.modules.intent_recognizer import IntentType, intent_result_to_dict, merge_confirmed_params, recognize_intent

router = APIRouter()


class ChatMessageRequest(BaseModel):
    session_id: str
    message: str = Field(min_length=1)


class ChatConfirmRequest(BaseModel):
    session_id: str
    intent: dict
    confirmed_params: dict = Field(default_factory=dict)


@router.post("/message")
def post_chat_message(body: ChatMessageRequest, db: Session = Depends(get_db)) -> dict:
    session_exists = db.query(MPSOrder.id).filter(MPSOrder.session_id == body.session_id).first()
    if not session_exists:
        raise HTTPException(status_code=404, detail="session 不存在")

    intent = recognize_intent(body.message)
    intent_payload = intent_result_to_dict(intent)
    db.add(
        ChatMessage(
            session_id=body.session_id,
            role="user",
            content=body.message,
            intent_json=json.dumps(intent_payload, ensure_ascii=False),
        )
    )
    db.add(
        ChatMessage(
            session_id=body.session_id,
            role="assistant",
            content=intent.confirmation_prompt,
            intent_json=json.dumps(intent_payload, ensure_ascii=False),
        )
    )
    db.commit()
    return {
        "session_id": body.session_id,
        "intent": intent_payload,
        "needs_confirmation": len(intent.missing_params) > 0 or intent.intent_type != "unknown",
    }


@router.post("/confirm")
def confirm_chat_intent(body: ChatConfirmRequest, db: Session = Depends(get_db)) -> dict:
    session_exists = db.query(MPSOrder.id).filter(MPSOrder.session_id == body.session_id).first()
    if not session_exists:
        raise HTTPException(status_code=404, detail="session 不存在")

    intent_type_raw = str(body.intent.get("intent_type", "unknown"))
    if intent_type_raw == "supply_disruption":
        raise HTTPException(status_code=400, detail="supply_disruption 意图请使用 /disruptions/chat/confirm 端点")
    intent_type: IntentType = (
        intent_type_raw if intent_type_raw in {"modify_deadline", "substitute_material", "unknown"} else "unknown"
    )
    recognized_params = body.intent.get("recognized_params", {}) or {}
    merged = merge_confirmed_params(intent_type=intent_type, recognized_params=recognized_params, confirmed_params=body.confirmed_params)
    if intent_type == "modify_deadline" and not merged.get("new_due_date"):
        raise HTTPException(status_code=400, detail="modify_deadline 需要 new_due_date（YYYY-MM-DD）")
    if intent_type == "substitute_material" and "no_us_material" not in merged:
        raise HTTPException(status_code=400, detail="substitute_material 需要 no_us_material（true/false）")
    if intent_type == "unknown":
        raise HTTPException(status_code=400, detail="未识别意图，无法执行重排程")

    crew = MRPCrewOrchestrator()
    try:
        result = crew.reschedule_session(db=db, session_id=body.session_id, param_overrides=merged)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.add(
        ChatMessage(
            session_id=body.session_id,
            role="assistant",
            content="已接收结构化参数并完成重排程，已生成新版方案对比。",
            intent_json=json.dumps(
                {
                    "intent_type": intent_type,
                    "recognized_params": recognized_params,
                    "confirmed_params": body.confirmed_params,
                    "merged_params": merged,
                },
                ensure_ascii=False,
            ),
        )
    )
    db.commit()
    return result


@router.get("/{session_id}/history")
def get_chat_history(session_id: str, db: Session = Depends(get_db)) -> dict:
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        .all()
    )
    return {
        "session_id": session_id,
        "items": [
            {
                "id": row.id,
                "role": row.role,
                "content": row.content,
                "intent": json.loads(row.intent_json) if row.intent_json else {},
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ],
    }
