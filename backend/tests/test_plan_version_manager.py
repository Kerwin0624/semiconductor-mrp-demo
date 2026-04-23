import pytest

from app.modules.plan_version_manager import PlanVersionManager


def test_plan_version_state_machine(db_session) -> None:
    manager = PlanVersionManager(db_session)
    manager.create_versions(
        session_id="S-001",
        fg_pn="FG-1",
        version_a_orders=[{"material_pn": "M1", "planned_qty": 10}],
        version_b_orders=[{"material_pn": "M1", "planned_qty": 12}],
    )

    pending = manager.list_sessions(status="pending_approval")
    assert len(pending) == 2

    approved = manager.approve("S-001", selected_version="B", approved_by="tester")
    assert all(item.status == "approved" for item in approved)
    assert all(item.selected_version == "B" for item in approved)

    synced = manager.mark_srm_synced("S-001")
    assert all(item.status == "srm_synced" for item in synced)


def test_plan_version_cannot_skip_to_synced(db_session) -> None:
    manager = PlanVersionManager(db_session)
    manager.create_versions(
        session_id="S-002",
        fg_pn="FG-2",
        version_a_orders=[],
        version_b_orders=[],
    )
    with pytest.raises(ValueError, match="仅 approved 状态可同步 SRM"):
        manager.mark_srm_synced("S-002")
