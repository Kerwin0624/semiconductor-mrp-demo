from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.models.bom import BOMMaster
from app.models.disruption import DisruptionEvent
from app.models.mps import MPSOrder


@dataclass(slots=True)
class BlastItem:
    fg_pn: str
    original_due_date: date
    estimated_delay_days: int


@dataclass(slots=True)
class DisruptionPayload:
    supplier_name: str
    affected_material_pns: list[str]
    disruption_days: int
    new_available_date: date | None
    source: str = "other"
    note: str = ""


@dataclass(slots=True)
class DisruptionResult:
    disruption_id: str
    blast_radius: list[BlastItem]


def intake_disruption_event(db: Session, payload: DisruptionPayload) -> DisruptionResult:
    impacted_fg_set = _find_impacted_fg_pns(db, payload.affected_material_pns)
    orders = db.query(MPSOrder).filter(MPSOrder.fg_pn.in_(list(impacted_fg_set))).all() if impacted_fg_set else []

    blast_radius = [
        BlastItem(
            fg_pn=order.fg_pn,
            original_due_date=order.due_date,
            estimated_delay_days=payload.disruption_days,
        )
        for order in orders
    ]

    event_id = f"DISR-{uuid.uuid4().hex[:12]}"
    event = DisruptionEvent(
        event_id=event_id,
        supplier_name=payload.supplier_name,
        affected_material_pns_json=json.dumps(payload.affected_material_pns, ensure_ascii=False),
        disruption_days=payload.disruption_days,
        new_available_date=payload.new_available_date,
        source=payload.source,
        note=payload.note,
        blast_radius_json=json.dumps([asdict(item) for item in blast_radius], default=str, ensure_ascii=False),
        status="recorded",
    )
    db.add(event)
    db.commit()
    return DisruptionResult(disruption_id=event_id, blast_radius=blast_radius)


def _find_impacted_fg_pns(db: Session, affected_material_pns: list[str]) -> set[str]:
    if not affected_material_pns:
        return set()

    parent_map: dict[str, set[str]] = {}
    rows = db.query(BOMMaster).all()
    for row in rows:
        parent_map.setdefault(row.child_pn, set()).add(row.parent_pn)

    impacted_fg: set[str] = set()
    queue = list(affected_material_pns)
    seen: set[str] = set()
    while queue:
        material = queue.pop(0)
        if material in seen:
            continue
        seen.add(material)
        parents = parent_map.get(material, set())
        for parent in parents:
            impacted_fg.add(parent)
            queue.append(parent)
    return impacted_fg
