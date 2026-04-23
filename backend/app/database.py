from collections.abc import Generator
import time

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings
from app.modules.logging_utils import get_logger, log_structured


class Base(DeclarativeBase):
    pass


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, future=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
db_logger = get_logger("database")


@event.listens_for(engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
    conn.info.setdefault("query_start_time", []).append(time.perf_counter())


@event.listens_for(engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
    start = conn.info.get("query_start_time", [time.perf_counter()]).pop(-1)
    duration_ms = int((time.perf_counter() - start) * 1000)
    if duration_ms > 1000:
        log_structured(
            db_logger,
            level="warning",
            module="database",
            message="slow sql detected",
            duration_ms=duration_ms,
            status="slow_query",
            sql_preview=str(statement)[:120],
        )


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
