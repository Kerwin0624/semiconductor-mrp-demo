from datetime import date
import time

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware

from app.agents.crew import MRPCrewOrchestrator
from app.api import api_router
from app.config import settings
from app.database import Base, SessionLocal, engine
from app.modules.metrics_collector import record_metric

# Ensure all ORM models are imported before table creation.
from app import models  # noqa: F401


app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_metrics_middleware(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = int((time.perf_counter() - started) * 1000)
    path_key = request.url.path.replace("/", "_").strip("_") or "root"

    db = SessionLocal()
    try:
        record_metric(db, session_id=None, name="api_request_duration_ms", value=duration_ms, unit="ms")
        record_metric(db, session_id=None, name=f"api_request_duration_ms_{path_key}", value=duration_ms, unit="ms")
        record_metric(db, session_id=None, name=f"api_status_code_{response.status_code}", value=1, unit="count")
    finally:
        db.close()
    return response

scheduler = BackgroundScheduler()


def _daily_shelf_life_job() -> None:
    db = SessionLocal()
    try:
        crew = MRPCrewOrchestrator()
        crew.run_daily_shelf_life_scan(db=db, today=date.today())
    finally:
        db.close()


def _migrate_add_columns() -> None:
    """Add new columns to existing SQLite tables (no-op if already present)."""
    from sqlalchemy import text
    migrations = [
        ("material_master", "description", "TEXT DEFAULT ''"),
        ("material_master", "material_type", "TEXT DEFAULT ''"),
        ("material_master", "supplier_name", "TEXT DEFAULT ''"),
        ("material_master", "inventory_uom", "TEXT DEFAULT 'EA'"),
        ("bom_master", "supplier_name", "TEXT DEFAULT ''"),
        ("bom_master", "material_desc", "TEXT DEFAULT ''"),
        ("bom_master", "material_type", "TEXT DEFAULT ''"),
        ("bom_master", "usage_uom", "TEXT DEFAULT 'EA'"),
    ]
    with engine.connect() as conn:
        for table, col, col_type in migrations:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
                conn.commit()
            except Exception:
                conn.rollback()


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    _migrate_add_columns()
    scheduler.add_job(_daily_shelf_life_job, trigger=CronTrigger(hour=8, minute=0), id="shelf_life_daily", replace_existing=True)
    scheduler.start()


@app.on_event("shutdown")
def on_shutdown() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok", "app_name": settings.app_name}


app.include_router(api_router, prefix=settings.api_prefix)
