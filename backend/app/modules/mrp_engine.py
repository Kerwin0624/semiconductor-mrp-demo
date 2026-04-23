from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Literal

from app.modules.logging_utils import get_logger, log_structured

from app.modules.bom_expander import BOMNode
from app.modules.mps_parser import ParsedConstraints, ParsedOrder

ConflictCode = Literal[
    "SHELF_LIFE_EXPIRED",
    "LEAD_TIME_OVERDUE",
    "HIGH_PRIORITY_DELAY",
    "NO_SUBSTITUTE_FOUND",
    "STOCK_BELOW_SAFETY",
]


@dataclass(slots=True)
class MaterialMasterSnapshot:
    lead_time_days: int
    actual_delivery_date: date | None
    shelf_life_expiry: date | None
    on_hand_inventory: float
    in_transit_inventory: float
    safety_stock: float
    lot_size: float
    yield_rate: float


@dataclass(slots=True)
class MRPInput:
    orders: list[ParsedOrder]
    bom_tree: list[BOMNode]
    material_master: dict[str, MaterialMasterSnapshot]
    today: date
    constraints: ParsedConstraints | None = None


@dataclass(slots=True)
class PlannedOrder:
    material_pn: str
    fg_pn: str
    gross_req: float
    net_req: float
    gross_with_yield: float
    planned_qty: float
    planned_order_date: date
    status: Literal["ok", "auto_resolved", "conflict"]


@dataclass(slots=True)
class ConflictItem:
    material_pn: str
    fg_pn: str
    priority: Literal["high", "low"]
    conflict_code: ConflictCode
    message: str
    suggested_actions: list[str]


@dataclass(slots=True)
class AutoResolveLog:
    material_pn: str
    fg_pn: str
    used_safety_ratio: float
    message: str


@dataclass(slots=True)
class MRPResult:
    status: Literal["success", "conflict"]
    planned_orders: list[PlannedOrder]
    conflicts: list[ConflictItem] = field(default_factory=list)
    auto_resolved: list[AutoResolveLog] = field(default_factory=list)


def run_mrp_engine(payload: MRPInput) -> MRPResult:
    logger = get_logger("mrp_engine")
    start = time.perf_counter()
    planned_orders: list[PlannedOrder] = []
    conflicts: list[ConflictItem] = []
    auto_resolved: list[AutoResolveLog] = []

    deadline_override = payload.constraints.deadline_override if payload.constraints else None
    for order in payload.orders:
        order_nodes = [n for n in payload.bom_tree if n.fg_pn == order.fg_pn]
        for node in order_nodes:
            if node.no_substitute_found:
                conflicts.append(
                    ConflictItem(
                        material_pn=node.material_pn,
                        fg_pn=order.fg_pn,
                        priority=order.priority,  # type: ignore[arg-type]
                        conflict_code="NO_SUBSTITUTE_FOUND",
                        message=f"{node.material_pn} 无可用替代料",
                        suggested_actions=["人工指定可用替代料", "放宽禁用美系限制后重算"],
                    )
                )
                planned_orders.append(
                    PlannedOrder(
                        material_pn=node.material_pn,
                        fg_pn=order.fg_pn,
                        gross_req=order.qty * node.qty_per,
                        net_req=0,
                        gross_with_yield=0,
                        planned_qty=0,
                        planned_order_date=deadline_override or order.due_date,
                        status="conflict",
                    )
                )
                continue

            material = payload.material_master.get(node.material_pn)
            if material is None:
                # 缺主数据按硬冲突处理，映射到库存安全冲突。
                conflicts.append(
                    ConflictItem(
                        material_pn=node.material_pn,
                        fg_pn=order.fg_pn,
                        priority=order.priority,  # type: ignore[arg-type]
                        conflict_code="STOCK_BELOW_SAFETY",
                        message=f"{node.material_pn} 缺少主数据快照",
                        suggested_actions=["补齐物料主数据", "重新运行 MRP 计算"],
                    )
                )
                continue

            gross_req = order.qty * node.qty_per
            planned_use_date = deadline_override or order.due_date

            shelf_expiry = material.shelf_life_expiry
            if isinstance(shelf_expiry, datetime):
                shelf_expiry = shelf_expiry.date()

            if shelf_expiry and shelf_expiry < planned_use_date:
                conflicts.append(
                    ConflictItem(
                        material_pn=node.material_pn,
                        fg_pn=order.fg_pn,
                        priority=order.priority,  # type: ignore[arg-type]
                        conflict_code="SHELF_LIFE_EXPIRED",
                        message=f"{node.material_pn} 在 {planned_use_date} 使用时已过期",
                        suggested_actions=["报废过期批次", "加急采购新料"],
                    )
                )
                planned_orders.append(
                    PlannedOrder(
                        material_pn=node.material_pn,
                        fg_pn=order.fg_pn,
                        gross_req=gross_req,
                        net_req=0,
                        gross_with_yield=0,
                        planned_qty=0,
                        planned_order_date=planned_use_date,
                        status="conflict",
                    )
                )
                continue

            available = material.on_hand_inventory + material.in_transit_inventory
            net_req = max(0.0, gross_req - available)
            safety_gap = max(0.0, material.safety_stock - (available - gross_req))
            target_qty = max(net_req, safety_gap)
            yield_rate = material.yield_rate if material.yield_rate > 0 else 1.0
            gross_with_yield = target_qty / yield_rate if target_qty > 0 else 0.0

            lot_size = material.lot_size if material.lot_size > 0 else 1.0
            planned_qty = math.ceil(gross_with_yield / lot_size) * lot_size if gross_with_yield > 0 else 0.0

            planned_order_date = planned_use_date - timedelta(days=max(material.lead_time_days, 0))
            status: Literal["ok", "auto_resolved", "conflict"] = "ok"

            if planned_order_date < payload.today:
                conflicts.append(
                    ConflictItem(
                        material_pn=node.material_pn,
                        fg_pn=order.fg_pn,
                        priority=order.priority,  # type: ignore[arg-type]
                        conflict_code="LEAD_TIME_OVERDUE",
                        message=f"{node.material_pn} 需下单日 {planned_order_date} 早于 today={payload.today}",
                        suggested_actions=["调整交期", "启用替代供应", "减少排产数量"],
                    )
                )
                status = "conflict"
                if order.priority == "high":
                    conflicts.append(
                        ConflictItem(
                            material_pn=node.material_pn,
                            fg_pn=order.fg_pn,
                            priority=order.priority,  # type: ignore[arg-type]
                            conflict_code="HIGH_PRIORITY_DELAY",
                            message=f"高优先级订单 {order.fg_pn} 存在延期风险",
                            suggested_actions=["抢占低优资源", "加急采购", "升级人工审批"],
                        )
                    )

            remaining_inventory = available - gross_req
            if material.safety_stock > 0 and remaining_inventory < material.safety_stock:
                shortage = material.safety_stock - remaining_inventory
                used_ratio = shortage / material.safety_stock
                if planned_qty >= shortage and status != "conflict":
                    status = "auto_resolved"
                    auto_resolved.append(
                        AutoResolveLog(
                            material_pn=node.material_pn,
                            fg_pn=order.fg_pn,
                            used_safety_ratio=used_ratio,
                            message="采购计划可覆盖安全库存缺口，按正常采购执行",
                        )
                    )
                elif order.priority == "low" and used_ratio <= 0.2:
                    status = "auto_resolved" if status != "conflict" else status
                    auto_resolved.append(
                        AutoResolveLog(
                            material_pn=node.material_pn,
                            fg_pn=order.fg_pn,
                            used_safety_ratio=used_ratio,
                            message="低优先级订单触发安全库存自动自愈",
                        )
                    )
                else:
                    conflicts.append(
                        ConflictItem(
                            material_pn=node.material_pn,
                            fg_pn=order.fg_pn,
                            priority=order.priority,  # type: ignore[arg-type]
                            conflict_code="STOCK_BELOW_SAFETY",
                            message=f"{node.material_pn} 库存低于安全库存，缺口 {shortage:.2f}",
                            suggested_actions=["补充采购", "调整低优先级订单", "人工评估安全库存策略"],
                        )
                    )
                    status = "conflict"

            planned_orders.append(
                PlannedOrder(
                    material_pn=node.material_pn,
                    fg_pn=order.fg_pn,
                    gross_req=gross_req,
                    net_req=net_req,
                    gross_with_yield=gross_with_yield,
                    planned_qty=planned_qty,
                    planned_order_date=planned_order_date,
                    status=status,
                )
            )

    result_status: Literal["success", "conflict"] = "conflict" if conflicts else "success"
    result = MRPResult(
        status=result_status,
        planned_orders=planned_orders,
        conflicts=conflicts,
        auto_resolved=auto_resolved,
    )
    duration_ms = int((time.perf_counter() - start) * 1000)
    if duration_ms > 5000:
        log_structured(
            logger,
            level="warning",
            module="mrp_engine",
            message="mrp engine execution is slow",
            duration_ms=duration_ms,
            status=result.status,
        )
    return result
