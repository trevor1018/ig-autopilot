from datetime import datetime, timezone
from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Persona(Base):
    __tablename__ = "personas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    character_name: Mapped[str] = mapped_column(String(100))
    pov: Mapped[str] = mapped_column(String(50), default="first_person")
    tones: Mapped[list[str]] = mapped_column(JSON, default=list)
    languages: Mapped[list[str]] = mapped_column(JSON, default=list)
    required_hashtags: Mapped[list[str]] = mapped_column(JSON, default=list)
    hashtag_count: Mapped[int] = mapped_column(Integer, default=5)
    style_notes: Mapped[str] = mapped_column(Text, default="")
    example_posts: Mapped[list[dict]] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)
