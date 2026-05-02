from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.db import Base, engine
from routers import caption, personas, profiles

import models  # noqa: F401  (registers models on Base.metadata)


app = FastAPI(title="IG Autopilot API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _create_tables() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": settings.gemini_model}


app.include_router(personas.router)
app.include_router(profiles.router)
app.include_router(caption.router)
