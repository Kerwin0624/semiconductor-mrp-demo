from __future__ import annotations

import logging
from dataclasses import dataclass, field


logger = logging.getLogger("notification_service")


@dataclass(slots=True)
class NotificationPayload:
    type: str
    subject: str
    body: str
    recipients: list[str]
    cc: list[str] = field(default_factory=list)


def send_notification(payload: NotificationPayload) -> dict:
    """
    Demo 阶段统一通知出口。
    当前以结构化日志为主，后续可切换 SMTP。
    """
    logger.info(
        "notify type=%s recipients=%s cc=%s subject=%s body=%s",
        payload.type,
        ",".join(payload.recipients),
        ",".join(payload.cc),
        payload.subject,
        payload.body,
    )
    return {"status": "ok", "type": payload.type}
