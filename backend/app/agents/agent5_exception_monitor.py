from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.modules.disruption_intake import DisruptionPayload, DisruptionResult, intake_disruption_event
from app.modules.shelf_life_monitor import ShelfLifeScanResult, scan_and_alert_shelf_life


def run_agent5_disruption_intake(db: Session, payload: DisruptionPayload) -> DisruptionResult:
    return intake_disruption_event(db, payload)


def run_agent5_shelf_life_daily_scan(db: Session, today: date) -> ShelfLifeScanResult:
    return scan_and_alert_shelf_life(db=db, today=today, horizon_days=30)
