from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MRPPlanSession(Base):
    __tablename__ = "mrp_plan_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    fg_pn: Mapped[str] = mapped_column(String(64), default="")
    version: Mapped[str] = mapped_column(String(1))
    planned_orders_json: Mapped[str] = mapped_column(Text, default="[]")
    conflict_report_json: Mapped[str] = mapped_column(Text, default="{}")
    status: Mapped[str] = mapped_column(String(32), default="pending_approval")
    selected_version: Mapped[str | None] = mapped_column(String(1), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
