"""SafetyGuard — rate-limit Phase 2 auto-interactions to avoid IG bans.

Three layers of protection:
1. Per-account daily action cap (e.g. 120/day).
2. Per-action randomized delay (30-300s).
3. Action-mix tracking (so the cap is shared across like/comment/follow).

Pure logic — no DB writes, no IG calls. The caller (sweep service) decides
what to do with the verdict.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from typing import Iterable


COUNTABLE_ACTIONS = ("like", "comment", "follow", "view_story")


@dataclass(frozen=True)
class SafetyVerdict:
    allowed: bool
    reason: str = ""
    used_today: int = 0
    cap: int = 0

    @property
    def remaining(self) -> int:
        return max(0, self.cap - self.used_today)


def utc_today_start() -> datetime:
    """Start of today in UTC. Daily caps reset at 00:00 UTC by convention."""
    now = datetime.now(timezone.utc)
    return datetime.combine(now.date(), time.min, tzinfo=timezone.utc)


def count_actions_today(action_log_iter: Iterable, action_types: tuple[str, ...] = COUNTABLE_ACTIONS) -> int:
    """Count InteractionLog rows from today that should count toward the cap.

    Counts both `executed` and `planned` (dry-run) so dry-run sessions also
    feel realistic — if you tested 200 actions in dry-run today, you've
    already simulated hitting the cap.
    """
    today_start = utc_today_start()
    n = 0
    for log in action_log_iter:
        if log.action_type not in action_types:
            continue
        if log.status not in ("executed", "planned"):
            continue
        ts = log.created_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts >= today_start:
            n += 1
    return n


def check_action_allowed(
    used_today: int,
    cap: int,
) -> SafetyVerdict:
    """Decide whether ONE more counting action can fire."""
    if cap <= 0:
        return SafetyVerdict(allowed=False, reason="cap_zero", used_today=used_today, cap=cap)
    if used_today >= cap:
        return SafetyVerdict(allowed=False, reason="daily_cap_reached", used_today=used_today, cap=cap)
    return SafetyVerdict(allowed=True, used_today=used_today, cap=cap)


def pick_action(
    like_ratio: float,
    rng: random.Random | None = None,
) -> str:
    """Weighted random pick between 'like' and 'comment'.

    like_ratio is the probability of 'like' (0.0-1.0). 0.9 means 90% like, 10% comment.
    """
    r = rng or random
    if not 0.0 <= like_ratio <= 1.0:
        raise ValueError(f"like_ratio must be in [0,1], got {like_ratio}")
    return "like" if r.random() < like_ratio else "comment"


def random_delay_seconds(
    min_sec: int,
    max_sec: int,
    rng: random.Random | None = None,
) -> float:
    """Return a uniformly random delay between min_sec and max_sec.

    Float so callers can sleep with millisecond precision if they want.
    """
    if min_sec < 0 or max_sec < min_sec:
        raise ValueError(f"invalid delay range [{min_sec}, {max_sec}]")
    r = rng or random
    return r.uniform(float(min_sec), float(max_sec))


def next_reset_in_seconds(now: datetime | None = None) -> int:
    """How many seconds until the daily cap resets (next UTC midnight)."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    tomorrow_start = utc_today_start() + timedelta(days=1)
    return int((tomorrow_start - now).total_seconds())
