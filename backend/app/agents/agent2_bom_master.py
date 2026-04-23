from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.modules.bom_expander import BOMExpandResult, BOMNode, expand_bom_tree
from app.modules.material_master_fetcher import fetch_material_snapshots
from app.modules.mps_parser import ParsedConstraints, ParsedMPS, ParsedOrder
from app.modules.mrp_engine import MaterialMasterSnapshot


@dataclass(slots=True)
class Agent2Output:
    orders: list[ParsedOrder]
    bom_tree: list[BOMNode]
    warnings: list[str]
    material_master: dict[str, MaterialMasterSnapshot]
    constraints: ParsedConstraints


def run_agent2_bom_master(db: Session, parsed_mps: ParsedMPS) -> Agent2Output:
    all_nodes: list[BOMNode] = []
    all_warnings: list[str] = []

    for order in parsed_mps.orders:
        expanded: BOMExpandResult = expand_bom_tree(
            db=db,
            fg_pn=order.fg_pn,
            no_us_material=parsed_mps.constraints.no_us_material,
        )
        all_nodes.extend(expanded.nodes)
        all_warnings.extend(expanded.warnings)

    unique_materials = sorted({node.material_pn for node in all_nodes})
    snapshots = fetch_material_snapshots(db, unique_materials)
    material_master = {
        key: MaterialMasterSnapshot(
            lead_time_days=value.lead_time_days,
            actual_delivery_date=value.actual_delivery_date,
            shelf_life_expiry=value.shelf_life_expiry,
            on_hand_inventory=value.on_hand_inventory,
            in_transit_inventory=value.in_transit_inventory,
            safety_stock=value.safety_stock,
            lot_size=value.lot_size,
            yield_rate=value.yield_rate,
        )
        for key, value in snapshots.items()
    }

    return Agent2Output(
        orders=parsed_mps.orders,
        bom_tree=all_nodes,
        warnings=all_warnings,
        material_master=material_master,
        constraints=parsed_mps.constraints,
    )
