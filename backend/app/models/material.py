from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MaterialMaster(Base):
    __tablename__ = "material_master"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    material_pn: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    supplier_name: Mapped[str] = mapped_column(String(128), default="")
    description: Mapped[str] = mapped_column(String(256), default="")
    material_type: Mapped[str] = mapped_column(String(64), default="")
    lead_time_days: Mapped[int] = mapped_column(Integer, default=0)
    actual_delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    shelf_life_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    on_hand_inventory: Mapped[float] = mapped_column(Float, default=0.0)
    in_transit_inventory: Mapped[float] = mapped_column(Float, default=0.0)
    safety_stock: Mapped[float] = mapped_column(Float, default=0.0)
    lot_size: Mapped[float] = mapped_column(Float, default=1.0)
    yield_rate: Mapped[float] = mapped_column(Float, default=1.0)
    inventory_uom: Mapped[str] = mapped_column(String(16), default="EA")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
