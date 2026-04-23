from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BOMMaster(Base):
    __tablename__ = "bom_master"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    parent_pn: Mapped[str] = mapped_column(String(64), index=True)
    child_pn: Mapped[str] = mapped_column(String(64), index=True)
    supplier_name: Mapped[str] = mapped_column(String(128), default="")
    material_desc: Mapped[str] = mapped_column(String(256), default="")
    material_type: Mapped[str] = mapped_column(String(64), default="")
    qty_per: Mapped[float] = mapped_column(Float)
    usage_uom: Mapped[str] = mapped_column(String(16), default="EA")
    level: Mapped[int] = mapped_column(Integer, default=1)
    is_us_material: Mapped[bool] = mapped_column(Boolean, default=False)
    aml_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
