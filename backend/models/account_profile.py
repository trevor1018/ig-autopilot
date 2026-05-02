from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AccountProfile(Base):
    __tablename__ = "account_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ig_username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(150), default="")
    description: Mapped[str] = mapped_column(Text, default="")

    persona_id: Mapped[int | None] = mapped_column(ForeignKey("personas.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    persona: Mapped["Persona | None"] = relationship(back_populates="profiles")  # type: ignore[name-defined]
