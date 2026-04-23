from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any


def get_logger(module_name: str) -> logging.Logger:
    logger = logging.getLogger(module_name)
    if logger.handlers:
        return logger

    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger


def log_structured(
    logger: logging.Logger,
    level: str,
    module: str,
    message: str,
    session_id: str | None = None,
    duration_ms: int | None = None,
    status: str | None = None,
    **extra: Any,
) -> None:
    payload: dict[str, Any] = {
        "timestamp": datetime.utcnow().isoformat(),
        "level": level.upper(),
        "module": module,
        "session_id": session_id,
        "duration_ms": duration_ms,
        "status": status,
        "message": message,
    }
    payload.update(extra)
    text = json.dumps(payload, ensure_ascii=False, default=str)
    if level.lower() == "warning":
        logger.warning(text)
    elif level.lower() == "error":
        logger.error(text)
    else:
        logger.info(text)
