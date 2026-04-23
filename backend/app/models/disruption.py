from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DisruptionEvent(Base):
    __tablename__ = "disruption_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    supplier_name: Mapped[str] = mapped_column(String(128))
    affected_material_pns_json: Mapped[str] = mapped_column(Text, default="[]")
    disruption_days: Mapped[int] = mapped_column(Integer)
    new_available_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="other")
    note: Mapped[str] = mapped_column(Text, default="")
    blast_radius_json: Mapped[str] = mapped_column(Text, default="[]")
    status: Mapped[str] = mapped_column(String(32), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
