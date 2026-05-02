import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.db import Base, engine
from routers import analytics, caption, interactions, personas, profiles, sweeps, targets

import models  # noqa: F401  (registers models on Base.metadata)
from services import scheduler as scheduler_service


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    scheduler_service.start_scheduler()
    try:
        yield
    finally:
        scheduler_service.stop_scheduler()


app = FastAPI(title="IG Autopilot API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model": settings.gemini_model,
        "ig_dry_run": settings.ig_dry_run,
        "sweep_hours_utc": settings.sweep_hour_list,
    }


app.include_router(personas.router)
app.include_router(profiles.router)
app.include_router(caption.router)
app.include_router(targets.router)
app.include_router(interactions.router)
app.include_router(sweeps.router)
app.include_router(analytics.router)
