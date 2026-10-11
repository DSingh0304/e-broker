"""E-Broker API entrypoint. Mounted at / in Docker; Cloudflare adds /api in prod."""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.core.config import settings
from api.routers import admin, agent, auth, market, public, training

logging.basicConfig(level=settings.LOG_LEVEL)
log = logging.getLogger("ebroker")

app = FastAPI(title="E-Broker API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if hasattr(settings, "CORS_ORIGINS") else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(public.router, tags=["public"])
app.include_router(auth.router, tags=["auth"])
app.include_router(admin.router, tags=["admin"])
app.include_router(agent.router, tags=["agent"])
app.include_router(training.router, tags=["training"])
app.include_router(market.router, tags=["market"])


@app.get("/health")
def health_check():
    return {"status": "ok"}


# Lambda adapter - optional, created AFTER the app exists. Docker/Uvicorn
# never touches this; it is only used by the api/Dockerfile.api image.
try:
    from mangum import Mangum

    handler = Mangum(app, lifespan="off")
except Exception:  # noqa: BLE001 - mangum not installed in Docker
    handler = None
