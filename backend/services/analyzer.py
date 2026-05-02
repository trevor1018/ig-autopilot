"""Phase 3 analytics service.

Two flavors of analysis are envisioned:

1. **Activity analytics** (data we already have from Phase 2)
   - actions per day / per target
   - like vs comment breakdown
   - skip-reason histogram
   - top targets by engagement attempts

2. **Content analytics** (requires PostAnalysis rows + multi-day data)
   - which post types (food / outdoor / selfie / merch) get the most likes
   - hashtag performance correlation
   - best posting hour heatmap

Phase 1 (this scaffold) implements (1) only — the activity rollups can run
the moment Phase 2 starts logging. (2) is stubbed: the endpoint returns an
empty-state response that the frontend renders gracefully.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from models.interaction_log import InteractionLog
from models.post_analysis import PostAnalysis


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def activity_summary(db: Session, profile_id: int, days: int = 7) -> dict[str, Any]:
    """Aggregate the last N days of InteractionLog for one profile."""
    since = _utcnow() - timedelta(days=days)
    logs = (
        db.query(InteractionLog)
        .filter(InteractionLog.profile_id == profile_id)
        .filter(InteractionLog.created_at >= since)
        .all()
    )

    by_action: Counter[str] = Counter()
    by_status: Counter[str] = Counter()
    by_skip_reason: Counter[str] = Counter()
    by_target: Counter[str] = Counter()
    by_day: dict[str, int] = {}

    for log in logs:
        by_action[log.action_type] += 1
        by_status[log.status] += 1
        if log.skip_reason:
            by_skip_reason[log.skip_reason] += 1
        if log.target_username:
            by_target[log.target_username] += 1

        ts = log.created_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        day_key = ts.date().isoformat()
        by_day[day_key] = by_day.get(day_key, 0) + 1

    # Build a contiguous N-day series so the chart isn't gappy
    series: list[dict[str, Any]] = []
    today = _utcnow().date()
    for d_offset in range(days - 1, -1, -1):
        day = (today - timedelta(days=d_offset)).isoformat()
        series.append({"day": day, "count": by_day.get(day, 0)})

    return {
        "profile_id": profile_id,
        "window_days": days,
        "total_actions": len(logs),
        "by_action_type": dict(by_action),
        "by_status": dict(by_status),
        "by_skip_reason": dict(by_skip_reason),
        "top_targets": by_target.most_common(10),
        "daily_series": series,
    }


def content_summary(db: Session, profile_id: int) -> dict[str, Any]:
    """Cross-target post-type analytics. Stubbed until PostAnalysis is populated."""
    rows = db.query(PostAnalysis).all()

    if not rows:
        # Empty-state — frontend renders "Need data" message
        return {
            "profile_id": profile_id,
            "status": "no_data",
            "message": (
                "No PostAnalysis rows yet. Phase 3 needs sweep history + a classification "
                "pass over scraped post metadata. This will populate once Phase 2 has been "
                "running against real targets for a few days."
            ),
            "by_scene": {},
            "by_media_type": {},
            "engagement_buckets": {},
        }

    by_scene: Counter[str] = Counter()
    by_media: Counter[str] = Counter()
    er_buckets = {"low": 0, "mid": 0, "high": 0}

    for r in rows:
        if r.scene_category:
            by_scene[r.scene_category] += 1
        if r.media_type:
            by_media[r.media_type] += 1
        if r.engagement_rate < 0.02:
            er_buckets["low"] += 1
        elif r.engagement_rate < 0.06:
            er_buckets["mid"] += 1
        else:
            er_buckets["high"] += 1

    return {
        "profile_id": profile_id,
        "status": "ready",
        "by_scene": dict(by_scene),
        "by_media_type": dict(by_media),
        "engagement_buckets": er_buckets,
        "total_posts_analyzed": len(rows),
    }
