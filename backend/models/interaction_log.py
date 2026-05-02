"""InteractionLog = every auto-action ever taken (or planned, in dry-run)."""

from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class InteractionLog(Base):
    """One row per attempted auto-interaction.

    Stored regardless of dry-run vs real execution so the user can review what
    the system *would have* done before flipping the dry-run switch off.
    """

    __tablename__ = "interaction_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    profile_id: Mapped[int] = mapped_column(ForeignKey("account_profiles.id"), index=True)
    target_id: Mapped[int | None] = mapped_column(ForeignKey("target_accounts.id"), nullable=True, index=True)
    sweep_run_id: Mapped[int | None] = mapped_column(ForeignKey("sweep_runs.id"), nullable=True, index=True)

    # "like" | "comment" | "follow" | "view_story" | "skip"
    action_type: Mapped[str] = mapped_column(String(30), index=True)

    target_username: Mapped[str] = mapped_column(String(150), default="")
    target_post_id: Mapped[str] = mapped_column(String(100), default="")
    target_post_url: Mapped[str] = mapped_column(String(400), default="")

    # filled for action_type == "comment"
    comment_text: Mapped[str] = mapped_column(Text, default="")

    # "planned" | "executed" | "skipped" | "failed"
    status: Mapped[str] = mapped_column(String(20), index=True, default="planned")
    dry_run: Mapped[bool] = mapped_column(Boolean, default=True)
    error_message: Mapped[str] = mapped_column(Text, default="")

    # Reason if status=="skipped" — e.g. "daily_cap_reached", "no_new_post"
    skip_reason: Mapped[str] = mapped_column(String(50), default="")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True)

    profile = relationship("AccountProfile", lazy="select")
    target = relationship("TargetAccount", lazy="select")
    sweep_run = relationship("SweepRun", lazy="select", back_populates="logs")
