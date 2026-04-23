from datetime import datetime, timedelta

from app.models.metrics import AgentRunLog, SystemMetric
from app.modules.metrics_collector import record_agent_run, record_metric


def test_record_metric_persists_row(db_session) -> None:
    record_metric(
        db_session,
        session_id="S-METRIC-1",
        name="mrp_engine_duration_ms",
        value=123.4,
        unit="ms",
    )
    row = (
        db_session.query(SystemMetric)
        .filter(SystemMetric.session_id == "S-METRIC-1", SystemMetric.metric_name == "mrp_engine_duration_ms")
        .one()
    )
    assert row.value_float == 123.4
    assert row.unit == "ms"


def test_record_agent_run_persists_row(db_session) -> None:
    start = datetime.utcnow()
    end = start + timedelta(milliseconds=87)
    record_agent_run(
        db_session,
        session_id="S-METRIC-2",
        agent_name="Agent3",
        task_name="run_mrp_engine",
        start_at=start,
        end_at=end,
        duration_ms=87,
        status="success",
        error_message="",
    )
    row = (
        db_session.query(AgentRunLog)
        .filter(AgentRunLog.session_id == "S-METRIC-2", AgentRunLog.task_name == "run_mrp_engine")
        .one()
    )
    assert row.agent_name == "Agent3"
    assert row.duration_ms == 87
    assert row.status == "success"
