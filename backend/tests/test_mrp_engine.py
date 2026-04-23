from datetime import date

from app.modules.bom_expander import BOMNode
from app.modules.mps_parser import ParsedOrder
from app.modules.mrp_engine import MRPInput, MaterialMasterSnapshot, run_mrp_engine


def _base_order(priority: str = "low") -> ParsedOrder:
    return ParsedOrder(fg_pn="FG-100", qty=100, due_date=date(2026, 4, 20), priority=priority)


def _base_node(**kwargs) -> BOMNode:
    return BOMNode(
        material_pn=kwargs.get("material_pn", "MAT-1"),
        parent_pn="FG-100",
        level=1,
        qty_per=kwargs.get("qty_per", 1.0),
        is_us_material=False,
        aml=[],
        fg_pn=kwargs.get("fg_pn", "FG-100"),
        no_substitute_found=kwargs.get("no_substitute_found", False),
    )


def _material(**kwargs) -> MaterialMasterSnapshot:
    return MaterialMasterSnapshot(
        lead_time_days=kwargs.get("lead_time_days", 5),
        actual_delivery_date=None,
        shelf_life_expiry=kwargs.get("shelf_life_expiry"),
        on_hand_inventory=kwargs.get("on_hand_inventory", 10.0),
        in_transit_inventory=kwargs.get("in_transit_inventory", 10.0),
        safety_stock=kwargs.get("safety_stock", 0.0),
        lot_size=kwargs.get("lot_size", 10.0),
        yield_rate=kwargs.get("yield_rate", 0.95),
    )


def test_mrp_engine_shelf_life_expired() -> None:
    payload = MRPInput(
        orders=[_base_order()],
        bom_tree=[_base_node()],
        material_master={"MAT-1": _material(shelf_life_expiry=date(2026, 4, 1))},
        today=date(2026, 4, 5),
    )
    result = run_mrp_engine(payload)
    assert result.status == "conflict"
    assert any(c.conflict_code == "SHELF_LIFE_EXPIRED" for c in result.conflicts)


def test_mrp_engine_lead_time_and_high_priority_delay() -> None:
    payload = MRPInput(
        orders=[_base_order(priority="high")],
        bom_tree=[_base_node()],
        material_master={"MAT-1": _material(lead_time_days=30)},
        today=date(2026, 4, 10),
    )
    result = run_mrp_engine(payload)
    codes = {c.conflict_code for c in result.conflicts}
    assert "LEAD_TIME_OVERDUE" in codes
    assert "HIGH_PRIORITY_DELAY" in codes


def test_mrp_engine_no_substitute_found() -> None:
    payload = MRPInput(
        orders=[_base_order()],
        bom_tree=[_base_node(no_substitute_found=True)],
        material_master={},
        today=date(2026, 4, 10),
    )
    result = run_mrp_engine(payload)
    assert any(c.conflict_code == "NO_SUBSTITUTE_FOUND" for c in result.conflicts)


def test_mrp_engine_stock_below_safety() -> None:
    payload = MRPInput(
        orders=[_base_order(priority="high")],
        bom_tree=[_base_node()],
        material_master={"MAT-1": _material(on_hand_inventory=5, in_transit_inventory=0, safety_stock=30)},
        today=date(2026, 4, 10),
    )
    result = run_mrp_engine(payload)
    assert result.status == "success"
    assert not any(c.conflict_code == "STOCK_BELOW_SAFETY" for c in result.conflicts)
    assert len(result.auto_resolved) >= 1


def test_mrp_engine_auto_resolve_for_low_priority() -> None:
    payload = MRPInput(
        orders=[ParsedOrder(fg_pn="FG-100", qty=20, due_date=date(2026, 4, 20), priority="low")],
        bom_tree=[_base_node()],
        material_master={"MAT-1": _material(on_hand_inventory=80, in_transit_inventory=0, safety_stock=70)},
        today=date(2026, 4, 10),
    )
    result = run_mrp_engine(payload)
    assert result.status == "success"
    assert len(result.auto_resolved) == 1


def test_mrp_engine_numeric_flow_gross_net_yield_lot_and_lead_time() -> None:
    payload = MRPInput(
        orders=[ParsedOrder(fg_pn="FG-200", qty=100, due_date=date(2026, 5, 20), priority="low")],
        bom_tree=[
            BOMNode(
                material_pn="MAT-NUM",
                parent_pn="FG-200",
                level=1,
                qty_per=1.5,  # gross_req = 150
                is_us_material=False,
                aml=[],
                fg_pn="FG-200",
            )
        ],
        material_master={
            "MAT-NUM": MaterialMasterSnapshot(
                lead_time_days=12,
                actual_delivery_date=None,
                shelf_life_expiry=date(2026, 12, 31),
                on_hand_inventory=20,  # available = 30
                in_transit_inventory=10,
                safety_stock=0,
                lot_size=8,
                yield_rate=0.8,  # net_req=120 => gross_with_yield=150 => planned_qty=152
            )
        },
        today=date(2026, 4, 1),
    )
    result = run_mrp_engine(payload)
    assert result.status == "success"
    assert len(result.planned_orders) == 1
    row = result.planned_orders[0]
    assert row.gross_req == 150
    assert row.net_req == 120
    assert row.gross_with_yield == 150
    assert row.planned_qty == 152
    assert row.planned_order_date == date(2026, 5, 8)


def test_mrp_engine_planned_qty_covers_safety_stock_gap() -> None:
    payload = MRPInput(
        orders=[ParsedOrder(fg_pn="FG-SAFE", qty=100, due_date=date(2026, 5, 20), priority="high")],
        bom_tree=[
            BOMNode(
                material_pn="MAT-SAFE",
                parent_pn="FG-SAFE",
                level=1,
                qty_per=1.0,
                is_us_material=False,
                aml=[],
                fg_pn="FG-SAFE",
            )
        ],
        material_master={
            "MAT-SAFE": MaterialMasterSnapshot(
                lead_time_days=10,
                actual_delivery_date=None,
                shelf_life_expiry=date(2026, 12, 31),
                on_hand_inventory=4200,
                in_transit_inventory=1800,
                safety_stock=1200,
                lot_size=100,
                yield_rate=1.0,
            )
        },
        today=date(2026, 4, 1),
    )
    result = run_mrp_engine(payload)
    assert len(result.planned_orders) == 1
    row = result.planned_orders[0]
    assert row.gross_req == 100
    # 可用库存 6000，消费 100 后剩余 5900，大于安全库存 1200，无需额外采购。
    assert row.planned_qty == 0

    payload2 = MRPInput(
        orders=[ParsedOrder(fg_pn="FG-SAFE2", qty=6000, due_date=date(2026, 5, 20), priority="high")],
        bom_tree=[
            BOMNode(
                material_pn="MAT-SAFE2",
                parent_pn="FG-SAFE2",
                level=1,
                qty_per=1.0,
                is_us_material=False,
                aml=[],
                fg_pn="FG-SAFE2",
            )
        ],
        material_master={
            "MAT-SAFE2": MaterialMasterSnapshot(
                lead_time_days=10,
                actual_delivery_date=None,
                shelf_life_expiry=date(2026, 12, 31),
                on_hand_inventory=4200,
                in_transit_inventory=1800,
                safety_stock=1200,
                lot_size=100,
                yield_rate=1.0,
            )
        },
        today=date(2026, 4, 1),
    )
    result2 = run_mrp_engine(payload2)
    assert len(result2.planned_orders) == 1
    row2 = result2.planned_orders[0]
    # 消费后剩余 0，需补到安全库存 1200，按 lot_size=100 正好采购 1200。
    assert row2.planned_qty == 1200
