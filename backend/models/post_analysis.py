"""PostAnalysis = a snapshot of one IG post's metadata + LLM-derived classification.

Phase 3 will populate this from sweep data + occasional Claude/Gemini-vision
classification calls. Empty for now — the schema is ready so frontend can
render an empty-state without backend changes later.
"""

from datetime import datetime, timezone
from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PostAnalysis(Base):
    __tablename__ = "post_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Source identifiers
    target_username: Mapped[str] = mapped_column(String(150), index=True)
    post_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    post_url: Mapped[str] = mapped_column(String(400), default="")
    posted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Engagement metrics (snapshot at time of analysis)
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, default=0)
    estimated_reach: Mapped[int] = mapped_column(Integer, default=0)

    # LLM-derived classification
    media_type: Mapped[str] = mapped_column(String(30), default="")  # photo / carousel / reel
    scene_category: Mapped[str] = mapped_column(String(50), default="")  # outdoor / food / selfie / merch / ...
    caption_tone: Mapped[str] = mapped_column(String(50), default="")
    hashtag_set: Mapped[str] = mapped_column(Text, default="")  # newline-separated

    # Free-form classifier output
    classifier_notes: Mapped[str] = mapped_column(Text, default="")
    classifier_version: Mapped[str] = mapped_column(String(20), default="")

    analyzed_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    # Engagement rate at analysis time (likes + comments) / followers, when known
    engagement_rate: Mapped[float] = mapped_column(Float, default=0.0)
