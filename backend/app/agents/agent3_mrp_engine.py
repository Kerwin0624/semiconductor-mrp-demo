from __future__ import annotations

import time
from datetime import date

from sqlalchemy.orm import Session

from app.agents.agent2_bom_master import Agent2Output
from app.modules.metrics_collector import record_metric
from app.modules.mrp_engine import MRPInput, MRPResult, run_mrp_engine


def run_agent3_mrp_engine(
    payload: Agent2Output,
    today: date,
    db: Session | None = None,
    session_id: str | None = None,
) -> MRPResult:
    started = time.perf_counter()
    engine_input = MRPInput(
        orders=payload.orders,
        bom_tree=payload.bom_tree,
        material_master=payload.material_master,
        today=today,
        constraints=payload.constraints,
    )
    result = run_mrp_engine(engine_input)
    duration_ms = int((time.perf_counter() - started) * 1000)
    if db is not None:
        record_metric(db, session_id=session_id, name="mrp_engine_duration_ms", value=duration_ms, unit="ms")
    return result
