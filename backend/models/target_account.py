"""Target account = an IG account we follow / monitor for new posts to interact with."""

from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TargetAccount(Base):
    """An IG account that one of our AccountProfiles monitors and interacts with.

    Many-to-one with AccountProfile: one of our profiles can follow many targets,
    each target may have its own per-target rules (like_ratio override etc.).
    """

    __tablename__ = "target_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("account_profiles.id"), index=True)

    ig_username: Mapped[str] = mapped_column(String(150), index=True)
    display_name: Mapped[str] = mapped_column(String(200), default="")
    genre_tags: Mapped[str] = mapped_column(String(300), default="")  # comma-separated, e.g. "pokemon,plush,kawaii"
    notes: Mapped[str] = mapped_column(Text, default="")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    like_ratio_override: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_actions_per_sweep: Mapped[int] = mapped_column(Integer, default=1)

    last_seen_post_id: Mapped[str] = mapped_column(String(100), default="")
    last_swept_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    profile = relationship("AccountProfile", backref="targets")
