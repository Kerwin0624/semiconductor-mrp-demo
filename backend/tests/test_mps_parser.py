from datetime import date
from io import BytesIO

import pytest
from openpyxl import Workbook

from app.modules.mps_parser import parse_mps_excel


def _build_excel(rows: list[list[object]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    bio = BytesIO()
    wb.save(bio)
    return bio.getvalue()


def test_parse_mps_excel_success() -> None:
    content = _build_excel(
        [
            ["fg_pn", "qty", "due_date", "priority"],
            ["FG-001", 100, "2026-05-01", "high"],
            ["FG-002", 50, date(2026, 5, 2), "low"],
            [None, None, None, None],
        ]
    )

    parsed = parse_mps_excel(content, "车规级，禁用美系物料")
    assert len(parsed.orders) == 2
    assert parsed.constraints.auto_grade is True
    assert parsed.constraints.no_us_material is True


def test_parse_mps_excel_missing_required_columns() -> None:
    content = _build_excel([["fg_pn", "qty"], ["FG-001", 100]])
    with pytest.raises(ValueError, match="缺少必填列"):
        parse_mps_excel(content)


def test_parse_mps_excel_invalid_priority() -> None:
    content = _build_excel([["fg_pn", "qty", "due_date", "priority"], ["FG-001", 100, "2026-05-01", "mid"]])
    with pytest.raises(ValueError, match="priority 非法"):
        parse_mps_excel(content)


def test_parse_mps_excel_chinese_priority() -> None:
    content = _build_excel(
        [
            ["成品料号", "数量", "交期", "优先级"],
            ["FG-001", 10, "2026-05-01", "高"],
            ["FG-002", 20, "2026-05-02", "低"],
        ]
    )
    parsed = parse_mps_excel(content, "")
    assert [o.priority for o in parsed.orders] == ["high", "low"]
