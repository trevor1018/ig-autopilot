"""Pure-logic tests for SafetyGuard. No DB, no IG, no Gemini."""

import random
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from services import safety_guard


def _log(action_type="like", status="executed", offset_hours=0):
    return SimpleNamespace(
        action_type=action_type,
        status=status,
        created_at=datetime.now(timezone.utc) - timedelta(hours=offset_hours),
    )


class TestCountActionsToday:
    def test_counts_only_today(self):
        logs = [
            _log(offset_hours=0),
            _log(offset_hours=1),
            _log(offset_hours=48),  # two days ago — should not count
        ]
        assert safety_guard.count_actions_today(logs) == 2

    def test_counts_planned_and_executed(self):
        logs = [_log(status="executed"), _log(status="planned")]
        assert safety_guard.count_actions_today(logs) == 2

    def test_skips_skipped_and_failed(self):
        logs = [_log(status="skipped"), _log(status="failed")]
        assert safety_guard.count_actions_today(logs) == 0

    def test_only_countable_action_types(self):
        logs = [
            _log(action_type="like"),
            _log(action_type="comment"),
            _log(action_type="follow"),
            _log(action_type="view_story"),
            _log(action_type="skip"),  # not countable
        ]
        assert safety_guard.count_actions_today(logs) == 4


class TestCheckActionAllowed:
    def test_allowed_below_cap(self):
        v = safety_guard.check_action_allowed(used_today=10, cap=120)
        assert v.allowed is True
        assert v.remaining == 110

    def test_blocked_at_cap(self):
        v = safety_guard.check_action_allowed(used_today=120, cap=120)
        assert v.allowed is False
        assert v.reason == "daily_cap_reached"
        assert v.remaining == 0

    def test_blocked_when_cap_zero(self):
        v = safety_guard.check_action_allowed(used_today=0, cap=0)
        assert v.allowed is False
        assert v.reason == "cap_zero"


class TestPickAction:
    def test_pure_like(self):
        rng = random.Random(42)
        results = [safety_guard.pick_action(1.0, rng) for _ in range(100)]
        assert set(results) == {"like"}

    def test_pure_comment(self):
        rng = random.Random(42)
        results = [safety_guard.pick_action(0.0, rng) for _ in range(100)]
        assert set(results) == {"comment"}

    def test_distribution_roughly_matches_ratio(self):
        rng = random.Random(12345)
        n = 10_000
        results = [safety_guard.pick_action(0.9, rng) for _ in range(n)]
        likes = sum(1 for r in results if r == "like")
        ratio = likes / n
        assert 0.88 < ratio < 0.92, f"got like_ratio={ratio:.3f}"

    def test_invalid_ratio_raises(self):
        with pytest.raises(ValueError):
            safety_guard.pick_action(1.5)
        with pytest.raises(ValueError):
            safety_guard.pick_action(-0.1)


class TestRandomDelay:
    def test_within_bounds(self):
        rng = random.Random(0)
        for _ in range(100):
            d = safety_guard.random_delay_seconds(30, 300, rng=rng)
            assert 30.0 <= d <= 300.0

    def test_invalid_range_raises(self):
        with pytest.raises(ValueError):
            safety_guard.random_delay_seconds(100, 50)
        with pytest.raises(ValueError):
            safety_guard.random_delay_seconds(-1, 100)


class TestNextResetInSeconds:
    def test_positive_under_24h(self):
        secs = safety_guard.next_reset_in_seconds()
        assert 0 <= secs <= 24 * 3600
