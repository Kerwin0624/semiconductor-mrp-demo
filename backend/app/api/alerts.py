from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.disruption import DisruptionEvent
from app.models.notification import ShelfLifeAlert

router = APIRouter()


@router.get("")
def list_alerts(db: Session = Depends(get_db)) -> dict:
    shelf_alerts = db.query(ShelfLifeAlert).order_by(ShelfLifeAlert.alerted_at.desc()).all()
    disruptions = db.query(DisruptionEvent).order_by(DisruptionEvent.created_at.desc()).all()

    items = []
    for alert in shelf_alerts:
        items.append(
            {
                "type": "shelf_life",
                "material_pn": alert.material_pn,
                "message": f"{alert.material_pn} 即将过期",
                "created_at": alert.alerted_at.isoformat(),
            }
        )
    for event in disruptions:
        items.append(
            {
                "type": "disruption",
                "event_id": event.event_id,
                "message": f"{event.supplier_name} 供应中断 {event.disruption_days} 天",
                "created_at": event.created_at.isoformat(),
            }
        )

    items.sort(key=lambda x: x["created_at"], reverse=True)
    return {"items": items}
