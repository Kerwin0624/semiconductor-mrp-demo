from fastapi import APIRouter

from app.api import alerts, chat, data, disruptions, metrics, mps, plans

api_router = APIRouter()
api_router.include_router(mps.router, prefix="/mps", tags=["mps"])
api_router.include_router(plans.router, prefix="/plans", tags=["plans"])
api_router.include_router(disruptions.router, prefix="/disruptions", tags=["disruptions"])
api_router.include_router(data.router, prefix="/data", tags=["data"])
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
api_router.include_router(metrics.router, prefix="/metrics", tags=["metrics"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
