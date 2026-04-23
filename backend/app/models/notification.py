from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SRMSyncLog(Base):
    __tablename__ = "srm_sync_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    planned_orders_json: Mapped[str] = mapped_column(Text, default="[]")
    result_json: Mapped[str] = mapped_column(Text, default="{}")
    synced_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ShelfLifeAlert(Base):
    __tablename__ = "shelf_life_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    material_pn: Mapped[str] = mapped_column(String(64), index=True)
    expiry_date: Mapped[date] = mapped_column(Date)
    stock_qty: Mapped[float] = mapped_column(Float, default=0.0)
    alerted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    note: Mapped[str] = mapped_column(Text, default="")
