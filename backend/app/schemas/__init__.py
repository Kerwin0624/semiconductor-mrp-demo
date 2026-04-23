from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class ParsedConstraint(BaseModel):
    no_us_material: bool = False
    auto_grade: bool = False
    custom_notes: str = ""


class MPSOrderCreate(BaseModel):
    fg_pn: str
    qty: int = Field(gt=0)
    due_date: date
    priority: Literal["high", "low"]


class MPSOrderRead(MPSOrderCreate):
    id: int
    session_id: str
    constraints: ParsedConstraint
    created_at: datetime


class PlanApproveRequest(BaseModel):
    selected_version: Literal["A", "B"]
    edited_orders: list[dict] = Field(default_factory=list)


class HealthzResponse(BaseModel):
    status: str
    app_name: str
