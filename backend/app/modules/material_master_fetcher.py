from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.material import MaterialMaster


@dataclass(slots=True)
class MaterialSnapshot:
    material_pn: str
    lead_time_days: int
    actual_delivery_date: date | None
    shelf_life_expiry: date | None
    on_hand_inventory: float
    in_transit_inventory: float
    safety_stock: float
    lot_size: float
    yield_rate: float


def _to_date(value: object) -> date | None:
    """SQLite may return datetime instead of date; normalise to date."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def fetch_material_snapshots(db: Session, material_pns: list[str]) -> dict[str, MaterialSnapshot]:
    if not material_pns:
        return {}

    rows = (
        db.query(MaterialMaster)
        .filter(MaterialMaster.material_pn.in_(material_pns))
        .all()
    )
    return {
        row.material_pn: MaterialSnapshot(
            material_pn=row.material_pn,
            lead_time_days=row.lead_time_days,
            actual_delivery_date=_to_date(row.actual_delivery_date),
            shelf_life_expiry=_to_date(row.shelf_life_expiry),
            on_hand_inventory=row.on_hand_inventory,
            in_transit_inventory=row.in_transit_inventory,
            safety_stock=row.safety_stock,
            lot_size=row.lot_size,
            yield_rate=row.yield_rate,
        )
        for row in rows
    }
