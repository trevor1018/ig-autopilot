"""SweepRun = one execution of a 3x/day scan-and-interact pass."""

from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SweepRun(Base):
    __tablename__ = "sweep_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    profile_id: Mapped[int] = mapped_column(ForeignKey("account_profiles.id"), index=True)

    # "scheduled" | "manual"
    trigger: Mapped[str] = mapped_column(String(20), default="scheduled")

    started_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # "running" | "completed" | "failed"
    status: Mapped[str] = mapped_column(String(20), default="running")

    # Counts populated as the sweep runs
    targets_scanned: Mapped[int] = mapped_column(Integer, default=0)
    new_posts_found: Mapped[int] = mapped_column(Integer, default=0)
    actions_planned: Mapped[int] = mapped_column(Integer, default=0)
    actions_executed: Mapped[int] = mapped_column(Integer, default=0)
    actions_skipped: Mapped[int] = mapped_column(Integer, default=0)
    actions_failed: Mapped[int] = mapped_column(Integer, default=0)

    error_message: Mapped[str] = mapped_column(Text, default="")

    profile = relationship("AccountProfile", lazy="select")
    logs = relationship("InteractionLog", back_populates="sweep_run", lazy="select")
