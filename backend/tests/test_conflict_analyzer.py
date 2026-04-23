from app.modules.conflict_analyzer import generate_conflict_report
from app.modules.mrp_engine import ConflictItem


def test_conflict_analyzer_groups_codes_and_deduplicates_actions() -> None:
    conflicts = [
        ConflictItem(
            material_pn="MAT-1",
            fg_pn="FG-1",
            priority="high",
            conflict_code="LEAD_TIME_OVERDUE",
            message="lead time overdue",
            suggested_actions=["action-a", "action-b"],
        ),
        ConflictItem(
            material_pn="MAT-2",
            fg_pn="FG-1",
            priority="high",
            conflict_code="LEAD_TIME_OVERDUE",
            message="lead time overdue again",
            suggested_actions=["action-a", "action-c"],
        ),
    ]

    report = generate_conflict_report(conflicts)
    assert "markdown_report" in report
    assert len(report["summary"]) == 1
    assert report["summary"][0]["code"] == "LEAD_TIME_OVERDUE"
    assert report["summary"][0]["count"] == 2
    assert sorted(report["suggested_actions"]) == ["action-a", "action-b", "action-c"]
