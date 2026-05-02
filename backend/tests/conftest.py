"""Shared pytest fixtures.

Tests use an isolated in-memory SQLite DB so they:
- never touch your real ig_autopilot.db
- never persist across runs
- run fast
"""

import sys
from pathlib import Path

# Make `backend/` the import root so `from models...` works in tests
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.db import Base


@pytest.fixture
def db():
    """Fresh in-memory DB per test."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    import models  # noqa: F401  -- ensures all models are registered before create_all
    Base.metadata.create_all(bind=engine)

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def seeded_profile(db):
    """A Persona + AccountProfile pre-inserted, with default 暖暖豬-style settings."""
    from models.persona import Persona
    from models.account_profile import AccountProfile

    persona = Persona(
        name="test_persona",
        character_name="TestChar",
        pov="first_person",
        tones=["natural"],
        languages=["zh", "ja", "en"],
        required_hashtags=["TestChar"],
        hashtag_count=5,
        style_notes="",
        example_posts=[],
    )
    db.add(persona)
    db.commit()
    db.refresh(persona)

    profile = AccountProfile(
        ig_username="test_account",
        display_name="Test",
        description="",
        persona_id=persona.id,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile
