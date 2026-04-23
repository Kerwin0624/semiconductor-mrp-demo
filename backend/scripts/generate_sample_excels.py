from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook


ROOT = Path(__file__).resolve().parents[2]
TEMPLATE_DIR = ROOT / "data" / "templates"
SAMPLE_DIR = ROOT / "data" / "samples"

MPS_HEADERS = [
    "成品料号（fg_pn：成品唯一编码）",
    "需求数量（qty：本期计划生产数量）",
    "需求交期（due_date：计划完工日期，YYYY-MM-DD）",
    "优先级（priority：high=高，low=低）",
    "主供应商（supplier_name：优先协同供应商）",
]

BOM_HEADERS = [
    "上级料号",
    "下级料号",
    "供应商",
    "物料描述",
    "物料类型",
    "单位用量",
    "用量单位",
    "BOM 层级",
    "美系标识",
    "可替代料（AML）",
]

MATERIAL_HEADERS = [
    "物料料号",
    "供应商",
    "物料描述",
    "物料类型",
    "采购提前期",
    "实际到货日期",
    "保质期截止",
    "现有库存",
    "在途库存",
    "安全库存",
    "批量",
    "良率",
    "库存单位",
]


def _infer_material_desc_type_uom(material_pn: str) -> tuple[str, str, str]:
    if material_pn.startswith("MAT-CAP-"):
        return ("MLCC Capacitor", "Capacitor", "EA")
    if material_pn.startswith("MAT-MCU-"):
        return ("Automotive MCU", "Controller", "EA")
    if material_pn.startswith("MAT-PMU-"):
        return ("Power Management IC", "Power", "EA")
    if material_pn.startswith("MAT-SEN-"):
        return ("毫米波传感器器件", "Sensor", "EA")
    if material_pn.startswith("MAT-PCB-"):
        return ("8层车规级PCB基板", "Substrate", "EA")
    if material_pn.startswith("MAT-IC-"):
        return ("信号链处理芯片", "IC", "EA")
    if material_pn.startswith("MAT-RES-"):
        return ("车规精密电阻", "Resistor", "EA")
    if material_pn.startswith("MAT-CON-"):
        return ("高速连接器", "Connector", "EA")
    if material_pn == "US-MAT-CONFLICT":
        return ("美系受限关键芯片", "IC", "EA")
    return ("通用物料", "Other", "EA")


def _material_row(
    material_pn: str,
    supplier_name: str,
    lead_time_days: int,
    actual_delivery_date: str,
    shelf_life_expiry: str,
    on_hand_inventory: int,
    in_transit_inventory: int,
    safety_stock: int,
    lot_size: int,
    yield_rate: float,
) -> list[object]:
    desc, material_type, inventory_uom = _infer_material_desc_type_uom(material_pn)
    return [
        material_pn,
        supplier_name,
        desc,
        material_type,
        lead_time_days,
        actual_delivery_date,
        shelf_life_expiry,
        on_hand_inventory,
        in_transit_inventory,
        safety_stock,
        lot_size,
        yield_rate,
        inventory_uom,
    ]


def _write_xlsx(path: Path, rows: list[list[object]]) -> None:
    wb = Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)


def _normalize_legacy_bom_row(row: list[object]) -> list[object]:
    """
    Convert legacy 7-column BOM rows into the current 10-column layout.
    Legacy order:
    parent_pn, child_pn, supplier_name, qty_per, level, is_us_material, aml
    """
    if len(row) == 10:
        return row
    if len(row) != 7:
        raise ValueError(f"Unexpected BOM sample row length: {len(row)}")
    parent_pn, child_pn, supplier_name, qty_per, level, is_us_material, aml = row
    return [
        parent_pn,
        child_pn,
        supplier_name,
        "",
        "",
        qty_per,
        "EA",
        level,
        is_us_material,
        aml,
    ]


def generate_templates() -> None:
    _write_xlsx(
        TEMPLATE_DIR / "mps_template.xlsx",
        [
            MPS_HEADERS,
            ["FG-EXAMPLE", 100, "2026-05-01", "high", "MURATA"],
        ],
    )
    _write_xlsx(
        TEMPLATE_DIR / "bom_template.xlsx",
        [
            BOM_HEADERS,
            _normalize_legacy_bom_row(["FG-EXAMPLE", "MAT-EXAMPLE", "NITTO", 1, 1, "N", ""]),
        ],
    )
    _write_xlsx(
        TEMPLATE_DIR / "materials_template.xlsx",
        [
            MATERIAL_HEADERS,
            ["MAT-EXAMPLE", "MURATA", "示例物料描述", "Wafer", 7, "", "2026-12-31", 100, 20, 30, 10, 0.95, "EA"],
        ],
    )


def generate_samples() -> None:
    _write_xlsx(
        SAMPLE_DIR / "sample_mps.xlsx",
        [
            MPS_HEADERS,
            ["FG-ADAS-001", 180, "2026-05-10", "high", "MURATA"],
            ["FG-ADAS-002", 220, "2026-05-12", "high", "NITTO"],
            ["FG-ADAS-003", 160, "2026-05-15", "low", "TDK"],
            ["FG-ADAS-004", 140, "2026-05-18", "low", "RENESAS"],
            ["FG-ADAS-005", 260, "2026-05-20", "high", "INFINEON"],
            ["FG-ADAS-006", 120, "2026-05-22", "low", "MURATA"],
            ["FG-ADAS-007", 300, "2026-05-25", "high", "ONSEMI"],
            ["FG-ADAS-008", 200, "2026-05-26", "high", "NXP"],
            ["FG-ADAS-009", 170, "2026-05-28", "low", "ROHM"],
            ["FG-ADAS-010", 210, "2026-05-30", "high", "ST"],
            ["FG-ADAS-011", 190, "2026-06-01", "low", "MURATA"],
            ["FG-ADAS-012", 240, "2026-06-03", "high", "NITTO"],
            ["FG-ADAS-013", 155, "2026-06-05", "low", "RENESAS"],
            ["FG-ADAS-014", 280, "2026-06-08", "high", "TDK"],
            ["FG-ADAS-015", 230, "2026-06-10", "high", "INFINEON"],
            ["FG-ADAS-016", 145, "2026-06-12", "low", "NXP"],
            ["FG-ADAS-017", 205, "2026-06-15", "high", "ONSEMI"],
            ["FG-ADAS-018", 175, "2026-06-17", "low", "ST"],
        ],
    )
    _write_xlsx(
        SAMPLE_DIR / "sample_bom.xlsx",
        [
            BOM_HEADERS,
            _normalize_legacy_bom_row(["FG-ADAS-001", "MAT-CAP-001", "MURATA", 4, 1, "N", "MAT-CAP-101,MAT-CAP-102"]),
            _normalize_legacy_bom_row(["FG-ADAS-001", "MAT-MCU-001", "RENESAS", 1, 1, "N", "MAT-MCU-101"]),
            _normalize_legacy_bom_row(["FG-ADAS-001", "MAT-PCB-001", "TRIPOD", 1, 1, "N", ""]),
            _normalize_legacy_bom_row(["FG-ADAS-002", "MAT-CAP-001", "MURATA", 5, 1, "N", "MAT-CAP-101"]),
            _normalize_legacy_bom_row(["FG-ADAS-002", "MAT-SEN-001", "NXP", 2, 1, "Y", "MAT-SEN-101,MAT-SEN-102"]),
            _normalize_legacy_bom_row(["FG-ADAS-002", "MAT-IC-001", "INFINEON", 1, 1, "Y", "MAT-IC-101"]),
            _normalize_legacy_bom_row(["FG-ADAS-003", "MAT-RES-001", "ROHM", 12, 1, "N", "MAT-RES-101"]),
            _normalize_legacy_bom_row(["FG-ADAS-003", "MAT-MCU-002", "ST", 1, 1, "N", "MAT-MCU-102"]),
            _normalize_legacy_bom_row(["FG-ADAS-003", "MAT-PCB-002", "AT&S", 1, 1, "N", ""]),
            _normalize_legacy_bom_row(["FG-ADAS-004", "MAT-PMU-001", "ONSEMI", 1, 1, "Y", "MAT-PMU-101"]),
            _normalize_legacy_bom_row(["FG-ADAS-004", "MAT-SEN-002", "TDK", 3, 1, "N", "MAT-SEN-103"]),
            _normalize_legacy_bom_row(["FG-ADAS-004", "MAT-CAP-002", "NITTO", 6, 1, "N", ""]),
            _normalize_legacy_bom_row(["FG-ADAS-005", "MAT-MCU-003", "RENESAS", 1, 1, "N", "MAT-MCU-103"]),
            _normalize_legacy_bom_row(["FG-ADAS-005", "MAT-CON-001", "TE", 2, 1, "N", "MAT-CON-101"]),
            _normalize_legacy_bom_row(["FG-ADAS-005", "US-MAT-CONFLICT", "NITTO", 1, 1, "Y", "US-ALT-A,US-ALT-B"]),
            _normalize_legacy_bom_row(["FG-ADAS-006", "MAT-RES-002", "ROHM", 10, 1, "N", ""]),
            _normalize_legacy_bom_row(["FG-ADAS-006", "MAT-CAP-003", "MURATA", 8, 1, "N", "MAT-CAP-103"]),
            _normalize_legacy_bom_row(["FG-ADAS-007", "MAT-PMU-002", "INFINEON", 1, 1, "Y", "MAT-PMU-102"]),
            _normalize_legacy_bom_row(["FG-ADAS-007", "MAT-SEN-003", "NXP", 2, 1, "Y", "MAT-SEN-104"]),
            _normalize_legacy_bom_row(["FG-ADAS-008", "MAT-MCU-004", "ST", 1, 1, "N", "MAT-MCU-104"]),
            _normalize_legacy_bom_row(["FG-ADAS-008", "MAT-CAP-004", "MURATA", 6, 1, "N", ""]),
            _normalize_legacy_bom_row(["FG-ADAS-009", "MAT-PCB-003", "TRIPOD", 1, 1, "N", ""]),
            _normalize_legacy_bom_row(["FG-ADAS-009", "MAT-CON-002", "TE", 2, 1, "N", "MAT-CON-102"]),
            _normalize_legacy_bom_row(["FG-ADAS-010", "MAT-SEN-004", "TDK", 3, 1, "N", "MAT-SEN-105"]),
            _normalize_legacy_bom_row(["FG-ADAS-010", "MAT-CAP-005", "NITTO", 7, 1, "N", "MAT-CAP-104"]),
            _normalize_legacy_bom_row(["FG-ADAS-011", "MAT-MCU-005", "RENESAS", 1, 1, "N", ""]),
            _normalize_legacy_bom_row(["FG-ADAS-012", "MAT-IC-002", "ONSEMI", 1, 1, "Y", "MAT-IC-102"]),
            _normalize_legacy_bom_row(["FG-ADAS-013", "MAT-RES-003", "ROHM", 9, 1, "N", ""]),
            _normalize_legacy_bom_row(["FG-ADAS-014", "MAT-CAP-006", "MURATA", 5, 1, "N", "MAT-CAP-105"]),
            _normalize_legacy_bom_row(["FG-ADAS-015", "MAT-MCU-006", "NXP", 1, 1, "Y", "MAT-MCU-105"]),
            _normalize_legacy_bom_row(["FG-ADAS-016", "MAT-PMU-003", "INFINEON", 1, 1, "Y", ""]),
            _normalize_legacy_bom_row(["FG-ADAS-017", "MAT-SEN-005", "TDK", 2, 1, "N", "MAT-SEN-106"]),
            _normalize_legacy_bom_row(["FG-ADAS-018", "MAT-CON-003", "TE", 1, 1, "N", "MAT-CON-103"]),
        ],
    )
    _write_xlsx(
        SAMPLE_DIR / "sample_materials.xlsx",
        [
            MATERIAL_HEADERS,
            _material_row("MAT-CAP-001", "MURATA", 7, "", "2027-03-31", 2800, 600, 900, 200, 0.98),
            _material_row("MAT-CAP-002", "NITTO", 9, "", "2027-04-30", 2200, 400, 700, 200, 0.97),
            _material_row("MAT-CAP-003", "MURATA", 8, "", "2027-05-31", 1800, 350, 600, 200, 0.98),
            _material_row("MAT-CAP-004", "MURATA", 7, "", "2027-06-30", 2100, 500, 650, 200, 0.98),
            _material_row("MAT-CAP-005", "NITTO", 10, "", "2027-06-30", 1600, 450, 600, 200, 0.97),
            _material_row("MAT-CAP-006", "MURATA", 8, "", "2027-07-31", 1700, 500, 650, 200, 0.98),
            _material_row("MAT-MCU-001", "RENESAS", 28, "", "2028-12-31", 420, 120, 180, 50, 0.95),
            _material_row("MAT-MCU-002", "ST", 24, "", "2028-12-31", 380, 100, 160, 50, 0.95),
            _material_row("MAT-MCU-003", "RENESAS", 30, "", "2028-12-31", 350, 140, 170, 50, 0.94),
            _material_row("MAT-MCU-004", "ST", 26, "", "2028-12-31", 360, 110, 160, 50, 0.95),
            _material_row("MAT-MCU-005", "RENESAS", 28, "", "2028-12-31", 300, 90, 150, 50, 0.95),
            _material_row("MAT-MCU-006", "NXP", 32, "", "2028-12-31", 290, 120, 150, 50, 0.94),
            _material_row("MAT-PMU-001", "ONSEMI", 21, "", "2028-06-30", 500, 180, 220, 40, 0.96),
            _material_row("MAT-PMU-002", "INFINEON", 25, "", "2028-06-30", 460, 150, 210, 40, 0.96),
            _material_row("MAT-PMU-003", "INFINEON", 24, "", "2028-06-30", 430, 160, 200, 40, 0.96),
            _material_row("MAT-SEN-001", "NXP", 18, "", "2028-03-31", 760, 240, 300, 80, 0.97),
            _material_row("MAT-SEN-002", "TDK", 15, "", "2028-03-31", 800, 200, 280, 80, 0.97),
            _material_row("MAT-SEN-003", "NXP", 17, "", "2028-03-31", 730, 210, 270, 80, 0.97),
            _material_row("MAT-SEN-004", "TDK", 16, "", "2028-03-31", 710, 190, 260, 80, 0.97),
            _material_row("MAT-SEN-005", "TDK", 15, "", "2028-03-31", 690, 180, 250, 80, 0.97),
            _material_row("MAT-PCB-001", "TRIPOD", 12, "", "2027-12-31", 900, 250, 320, 100, 0.99),
            _material_row("MAT-PCB-002", "AT&S", 14, "", "2027-12-31", 860, 220, 300, 100, 0.99),
            _material_row("MAT-PCB-003", "TRIPOD", 13, "", "2027-12-31", 820, 210, 290, 100, 0.99),
            _material_row("MAT-IC-001", "INFINEON", 27, "", "2028-09-30", 540, 170, 240, 60, 0.95),
            _material_row("MAT-IC-002", "ONSEMI", 23, "", "2028-09-30", 520, 160, 230, 60, 0.96),
            _material_row("MAT-RES-001", "ROHM", 6, "", "2029-12-31", 9800, 2400, 3200, 1000, 0.99),
            _material_row("MAT-RES-002", "ROHM", 6, "", "2029-12-31", 9100, 2200, 3000, 1000, 0.99),
            _material_row("MAT-RES-003", "ROHM", 6, "", "2029-12-31", 8700, 2100, 2900, 1000, 0.99),
            _material_row("MAT-CON-001", "TE", 11, "", "2029-06-30", 1500, 420, 550, 150, 0.98),
            _material_row("MAT-CON-002", "TE", 10, "", "2029-06-30", 1480, 400, 540, 150, 0.98),
            _material_row("MAT-CON-003", "TE", 10, "", "2029-06-30", 1440, 390, 530, 150, 0.98),
            _material_row("US-MAT-CONFLICT", "NITTO", 20, "", "2026-04-01", 0, 0, 30, 10, 0.9),
        ],
    )


if __name__ == "__main__":
    generate_templates()
    generate_samples()
    print("Sample Excel files generated under data/templates and data/samples.")
