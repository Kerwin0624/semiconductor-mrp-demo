from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.models.material import MaterialMaster
from app.models.notification import ShelfLifeAlert
from app.modules.notification_service import NotificationPayload, send_notification


@dataclass(slots=True)
class ShelfLifeScanResult:
    total_scanned: int
    alerted_count: int


def scan_and_alert_shelf_life(
    db: Session,
    today: date,
    horizon_days: int = 30,
    recipients: list[str] | None = None,
) -> ShelfLifeScanResult:
    recipients = recipients or ["planner@example.com", "warehouse@example.com"]
    rows = db.query(MaterialMaster).all()
    alerted_count = 0

    for row in rows:
        if row.shelf_life_expiry is None:
            continue
        days_left = (row.shelf_life_expiry - today).days
        if 0 <= days_left <= horizon_days:
            alerted_count += 1
            alert = ShelfLifeAlert(
                material_pn=row.material_pn,
                expiry_date=row.shelf_life_expiry,
                stock_qty=row.on_hand_inventory,
                note=f"days_left={days_left}",
            )
            db.add(alert)

            send_notification(
                NotificationPayload(
                    type="shelf_life",
                    subject=f"[ShelfLife] {row.material_pn} 即将到期",
                    body=(
                        f"物料 {row.material_pn} 距离到期 {days_left} 天，"
                        f"库存 {row.on_hand_inventory}，建议加急消耗或复检。"
                    ),
                    recipients=recipients,
                )
            )

    db.commit()
    return ShelfLifeScanResult(total_scanned=len(rows), alerted_count=alerted_count)
