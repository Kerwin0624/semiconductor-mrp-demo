from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.metrics import AgentRunLog, SystemMetric


def record_metric(
    db: Session,
    session_id: str | None,
    name: str,
    value: float,
    unit: str = "count",
    commit: bool = True,
) -> None:
    metric = SystemMetric(
        session_id=session_id,
        metric_name=name,
        value_float=float(value),
        unit=unit,
    )
    db.add(metric)
    if commit:
        db.commit()


def record_agent_run(
    db: Session,
    session_id: str | None,
    agent_name: str,
    task_name: str,
    start_at: datetime,
    end_at: datetime,
    duration_ms: int,
    status: str,
    error_message: str = "",
    commit: bool = True,
) -> None:
    log = AgentRunLog(
        session_id=session_id,
        agent_name=agent_name,
        task_name=task_name,
        start_at=start_at,
        end_at=end_at,
        duration_ms=duration_ms,
        status=status,
        error_message=error_message,
    )
    db.add(log)
    if commit:
        db.commit()
