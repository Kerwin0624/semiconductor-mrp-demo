from datetime import datetime, timedelta

from app.models.disruption import DisruptionEvent
from app.models.metrics import AgentRunLog, SystemMetric
from app.models.plan import MRPPlanSession


def test_metrics_summary_aggregation_is_correct(db_session) -> None:
    now = datetime.utcnow()
    old_day = now - timedelta(days=2)

    db_session.add_all(
        [
            SystemMetric(metric_name="mrp_session_total", value_float=3, unit="count", recorded_at=now),
            SystemMetric(metric_name="mrp_session_success", value_float=2, unit="count", recorded_at=now),
            SystemMetric(metric_name="mrp_session_total", value_float=9, unit="count", recorded_at=old_day),
            SystemMetric(metric_name="mrp_engine_duration_ms", value_float=100, unit="ms", recorded_at=now),
            SystemMetric(metric_name="mrp_engine_duration_ms", value_float=300, unit="ms", recorded_at=now),
            MRPPlanSession(
                session_id="S-MET-1",
                fg_pn="FG-1",
                version="A",
                planned_orders_json="[]",
                conflict_report_json="{}",
                status="pending_approval",
            ),
            MRPPlanSession(
                session_id="S-MET-1",
                fg_pn="FG-1",
                version="B",
                planned_orders_json="[]",
                conflict_report_json="{}",
                status="pending_approval",
            ),
            DisruptionEvent(
                event_id="D-MET-1",
                supplier_name="SUP-1",
                affected_material_pns_json='["M1"]',
                disruption_days=5,
                source="earthquake",
                note="demo",
                blast_radius_json="[]",
                status="recorded",
            ),
            DisruptionEvent(
                event_id="D-MET-2",
                supplier_name="SUP-2",
                affected_material_pns_json='["M2"]',
                disruption_days=3,
                source="delay",
                note="demo2",
                blast_radius_json="[]",
                status="resolved",
            ),
        ]
    )
    db_session.commit()

    from app.api.metrics import get_metrics_summary

    result = get_metrics_summary(db_session)
    assert result["today_mrp_generated"] == 3
    assert result["today_mrp_success_rate"] == round(2 / 3 * 100, 2)
    # pending_approval 按记录计数，A/B 两条版本都算。
    assert result["pending_approval_sessions"] == 2
    assert result["avg_mrp_engine_duration_ms"] == 200.0
    assert result["active_disruptions"] == 1


def test_metrics_agent_logs_filtering(db_session) -> None:
    now = datetime.utcnow()
    db_session.add_all(
        [
            AgentRunLog(
                session_id="S-LOG-1",
                agent_name="Agent1",
                task_name="parse",
                start_at=now - timedelta(seconds=2),
                end_at=now - timedelta(seconds=1),
                duration_ms=1000,
                status="success",
                error_message="",
            ),
            AgentRunLog(
                session_id="S-LOG-2",
                agent_name="Agent2",
                task_name="expand",
                start_at=now - timedelta(seconds=1),
                end_at=now,
                duration_ms=900,
                status="success",
                error_message="",
            ),
        ]
    )
    db_session.commit()

    from app.api.metrics import get_agent_logs

    all_items = get_agent_logs(session_id=None, db=db_session)["items"]
    only_s1 = get_agent_logs(session_id="S-LOG-1", db=db_session)["items"]

    assert len(all_items) == 2
    assert len(only_s1) == 1
    assert only_s1[0]["session_id"] == "S-LOG-1"
