from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.notification import SRMSyncLog


def sync_to_srm_mock(db: Session, session_id: str, planned_orders: list[dict[str, Any]]) -> dict[str, Any]:
    result = {
        "status": "ok",
        "synced_count": len(planned_orders),
        "message": "Mock SRM sync succeeded",
        "synced_at": datetime.utcnow().isoformat(),
    }

    log = SRMSyncLog(
        session_id=session_id,
        planned_orders_json=json.dumps(planned_orders, ensure_ascii=False),
        result_json=json.dumps(result, ensure_ascii=False),
    )
    db.add(log)
    db.commit()
    return result
