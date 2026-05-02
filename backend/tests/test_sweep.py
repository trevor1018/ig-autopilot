"""End-to-end sweep tests with mocked IG client + comment generator.

Verifies:
- Empty state: a sweep with zero targets completes cleanly.
- New post → action recorded with correct status / counts.
- Same post twice → second sweep records "no_new_post" skip.
- Daily cap respected: actions beyond cap log as skipped(daily_cap_reached).
- Weighted random respects like_ratio.
- Comment generator failure doesn't crash sweep — falls back gracefully.
"""

import random
from datetime import datetime, timezone
from typing import List

import pytest

from core.config import settings
from models.interaction_log import InteractionLog
from models.target_account import TargetAccount
from services.instagram_client import IGPost
from services.sweep import run_sweep


class FakeIGClient:
    def __init__(self, posts_per_call: List[List[IGPost]]):
        self.calls: List[str] = []
        self._posts_per_call = posts_per_call
        self.like_calls: List[str] = []
        self.comment_calls: List[tuple[str, str]] = []

    def fetch_recent_posts(self, username: str, limit: int = 3) -> List[IGPost]:
        self.calls.append(username)
        if not self._posts_per_call:
            return []
        return self._posts_per_call.pop(0)

    def like_post(self, post_id: str) -> bool:
        self.like_calls.append(post_id)
        return True

    def comment_post(self, post_id: str, text: str) -> bool:
        self.comment_calls.append((post_id, text))
        return True


def _make_post(post_id: str = "p1", caption: str = "hi") -> IGPost:
    return IGPost(
        post_id=post_id,
        code=post_id,
        caption=caption,
        like_count=0,
        comment_count=0,
        posted_at=datetime.now(timezone.utc),
        is_video=False,
    )


@pytest.fixture
def add_target(db, seeded_profile):
    def _factory(username="alice", **overrides):
        t = TargetAccount(
            profile_id=seeded_profile.id,
            ig_username=username,
            is_active=True,
            max_actions_per_sweep=overrides.pop("max_actions_per_sweep", 1),
            **overrides,
        )
        db.add(t)
        db.commit()
        db.refresh(t)
        return t

    return _factory


def test_sweep_no_targets(db, seeded_profile):
    sweep = run_sweep(db, seeded_profile, ig_client=FakeIGClient([]))
    assert sweep.status == "completed"
    assert sweep.targets_scanned == 0
    assert sweep.actions_planned == 0


def test_sweep_records_action_for_new_post(db, seeded_profile, add_target, monkeypatch):
    target = add_target("alice")
    fake = FakeIGClient([[_make_post("post_a")]])
    monkeypatch.setattr(settings, "like_ratio", 1.0, raising=False)  # force like

    sweep = run_sweep(db, seeded_profile, ig_client=fake, comment_generator=lambda p, c: "hi")
    assert sweep.status == "completed"
    assert sweep.targets_scanned == 1
    assert sweep.new_posts_found == 1
    assert sweep.actions_planned == 1

    logs = db.query(InteractionLog).all()
    assert len(logs) == 1
    assert logs[0].action_type == "like"
    assert logs[0].target_post_id == "post_a"

    db.refresh(target)
    assert target.last_seen_post_id == "post_a"


def test_sweep_skips_when_post_unchanged(db, seeded_profile, add_target):
    add_target("alice")
    same_post = _make_post("post_a")
    fake = FakeIGClient([[same_post], [same_post]])

    run_sweep(db, seeded_profile, ig_client=fake, comment_generator=lambda p, c: "hi")
    sweep2 = run_sweep(db, seeded_profile, ig_client=fake, comment_generator=lambda p, c: "hi")

    assert sweep2.actions_skipped == 1
    skips = (
        db.query(InteractionLog)
        .filter(InteractionLog.skip_reason == "no_new_post")
        .all()
    )
    assert len(skips) == 1


def test_daily_cap_respected(db, seeded_profile, add_target, monkeypatch):
    """Pre-populate the log with cap-many already-used actions; sweep should skip."""
    monkeypatch.setattr(settings, "daily_action_cap", 1, raising=False)
    monkeypatch.setattr(settings, "like_ratio", 1.0, raising=False)

    add_target("alice")
    add_target("bob")
    fake = FakeIGClient([[_make_post("a1")], [_make_post("b1")]])

    sweep = run_sweep(db, seeded_profile, ig_client=fake, comment_generator=lambda p, c: "hi")
    # 1 action allowed, the second target's post should be capped
    assert sweep.actions_planned == 1
    assert sweep.actions_skipped >= 1

    cap_skips = (
        db.query(InteractionLog)
        .filter(InteractionLog.skip_reason == "daily_cap_reached")
        .all()
    )
    assert len(cap_skips) >= 1


def test_comment_generator_failure_does_not_crash(db, seeded_profile, add_target, monkeypatch):
    monkeypatch.setattr(settings, "like_ratio", 0.0, raising=False)  # force comment
    add_target("alice")
    fake = FakeIGClient([[_make_post("post_a")]])

    def boom(persona, caption):
        raise RuntimeError("gemini exploded")

    sweep = run_sweep(db, seeded_profile, ig_client=fake, comment_generator=boom)
    assert sweep.status == "completed"
    logs = db.query(InteractionLog).filter(InteractionLog.action_type == "comment").all()
    assert len(logs) == 1
    assert logs[0].comment_text  # fallback was used (non-empty)


def test_per_target_like_ratio_override(db, seeded_profile, add_target, monkeypatch):
    """Target-level override should beat global setting."""
    monkeypatch.setattr(settings, "like_ratio", 1.0, raising=False)  # global = always like
    add_target("alice", like_ratio_override=0.0)  # but this target = always comment

    fake = FakeIGClient([[_make_post("post_a")]])
    rng = random.Random(0)
    run_sweep(db, seeded_profile, ig_client=fake, comment_generator=lambda p, c: "hi", rng=rng)

    log = db.query(InteractionLog).filter(InteractionLog.action_type.in_(["like", "comment"])).first()
    assert log.action_type == "comment"


def test_fetch_failure_records_failed_log(db, seeded_profile, add_target):
    add_target("alice")

    class BoomClient(FakeIGClient):
        def fetch_recent_posts(self, username, limit=3):
            raise RuntimeError("ig 429")

    sweep = run_sweep(db, seeded_profile, ig_client=BoomClient([]), comment_generator=lambda p, c: "hi")
    assert sweep.actions_failed == 1
    fail_log = (
        db.query(InteractionLog)
        .filter(InteractionLog.skip_reason == "fetch_failed")
        .first()
    )
    assert fail_log is not None
    assert "ig 429" in fail_log.error_message
