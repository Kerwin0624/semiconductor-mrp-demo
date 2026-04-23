from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.disruption import DisruptionEvent
from app.models.metrics import AgentRunLog, SystemMetric
from app.models.plan import MRPPlanSession

router = APIRouter()


@router.get("/summary")
def get_metrics_summary(db: Session = Depends(get_db)) -> dict:
    today = datetime.utcnow().date()
    today_start = datetime(today.year, today.month, today.day)

    today_total = (
        db.query(func.coalesce(func.sum(SystemMetric.value_float), 0.0))
        .filter(SystemMetric.metric_name == "mrp_session_total", SystemMetric.recorded_at >= today_start)
        .scalar()
        or 0.0
    )
    today_success = (
        db.query(func.coalesce(func.sum(SystemMetric.value_float), 0.0))
        .filter(SystemMetric.metric_name == "mrp_session_success", SystemMetric.recorded_at >= today_start)
        .scalar()
        or 0.0
    )
    success_rate = (today_success / today_total * 100.0) if today_total > 0 else 0.0

    avg_mrp_ms = (
        db.query(func.coalesce(func.avg(SystemMetric.value_float), 0.0))
        .filter(SystemMetric.metric_name == "mrp_engine_duration_ms")
        .scalar()
        or 0.0
    )
    pending_approval_count = (
        db.query(func.count(MRPPlanSession.id))
        .filter(MRPPlanSession.status == "pending_approval")
        .scalar()
        or 0
    )
    active_disruption_count = (
        db.query(func.count(DisruptionEvent.id))
        .filter(DisruptionEvent.status.in_(["pending", "recorded"]))
        .scalar()
        or 0
    )

    return {
        "today_mrp_generated": int(today_total),
        "today_mrp_success_rate": round(success_rate, 2),
        "pending_approval_sessions": int(pending_approval_count),
        "avg_mrp_engine_duration_ms": round(float(avg_mrp_ms), 2),
        "active_disruptions": int(active_disruption_count),
    }


@router.get("/agent-logs")
def get_agent_logs(session_id: str | None = None, db: Session = Depends(get_db)) -> dict:
    query = db.query(AgentRunLog)
    if session_id:
        query = query.filter(AgentRunLog.session_id == session_id)
    rows = query.order_by(AgentRunLog.start_at.desc()).all()
    return {
        "items": [
            {
                "session_id": row.session_id,
                "agent_name": row.agent_name,
                "task_name": row.task_name,
                "start_at": row.start_at.isoformat(),
                "end_at": row.end_at.isoformat(),
                "duration_ms": row.duration_ms,
                "status": row.status,
                "error_message": row.error_message,
            }
            for row in rows
        ]
    }
