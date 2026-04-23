import json
import traceback

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.agents.crew import MRPCrewOrchestrator
from app.database import get_db
from app.models.mps import MPSOrder
from app.modules.logging_utils import get_logger

router = APIRouter()
_logger = get_logger("api.mps")


@router.post("/upload")
async def upload_mps(
    file: UploadFile = File(...),
    notes: str = Form(default=""),
    db: Session = Depends(get_db),
) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名为空")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="上传文件为空")

    crew = MRPCrewOrchestrator()
    try:
        result = crew.run_mps_to_plan(db=db, mps_file_bytes=content, notes=notes)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        _logger.error("MPS upload pipeline failed: %s\n%s", exc, traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"MRP 计算流程异常: {exc}") from exc


@router.get("/{session_id}")
def get_mps_result(session_id: str, db: Session = Depends(get_db)) -> dict:
    rows = db.query(MPSOrder).filter(MPSOrder.session_id == session_id).all()
    if not rows:
        raise HTTPException(status_code=404, detail="session 不存在")
    orders = [
        {
            "fg_pn": row.fg_pn,
            "qty": row.qty,
            "due_date": row.due_date.isoformat(),
            "priority": row.priority,
        }
        for row in rows
    ]
    constraints = json.loads(rows[0].constraints_json) if rows[0].constraints_json else {}
    return {"session_id": session_id, "orders": orders, "constraints": constraints}
