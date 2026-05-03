"""Sweep orchestrator — the heart of Phase 2.

For one AccountProfile:
  1. Open a SweepRun row.
  2. For each active TargetAccount:
     - fetch_recent_posts (real or dry-run)
     - if there's a new post (post_id > last_seen_post_id):
       - SafetyGuard.check_action_allowed
       - if allowed: weighted-random pick like vs comment
       - if comment: generate via Gemini (with fallback)
       - call IG client (or skip if dry_run)
       - write InteractionLog row
       - update target.last_seen_post_id
  3. Close SweepRun with summary counts.

This module does NOT sleep between actions in dry-run; the SafetyGuard random
delay is emitted only when actually executing real IG calls. Tests rely on
this — sleeping mid-test would make them slow.
"""

from __future__ import annotations

import random
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from sqlalchemy.orm import Session

from core.config import BASE_DIR, settings
from models.account_profile import AccountProfile
from models.interaction_log import InteractionLog
from models.sweep_run import SweepRun
from models.target_account import TargetAccount
from services import safety_guard
from services.instagram_client import InstagramClient, build_client


# Session files persist instagrapi cookies / device fingerprint between sweeps
# so the same logical IG identity is reused (critical for ban avoidance).
SESSION_DIR = BASE_DIR / "data" / "sessions"


# Hook so tests / callers can swap in a mock comment generator
CommentGenerator = Callable[[object, str], str]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def run_sweep(
    db: Session,
    profile: AccountProfile,
    *,
    trigger: str = "scheduled",
    ig_client: InstagramClient | None = None,
    comment_generator: CommentGenerator | None = None,
    rng: random.Random | None = None,
    sleep_fn: Callable[[float], None] | None = None,
) -> SweepRun:
    """Run a single sweep cycle for one profile and return the SweepRun row.

    Dependencies are injectable so tests can mock IG / Gemini / sleeping.
    """
    rng = rng or random
    sleep_fn = sleep_fn  # leave as None in dry-run; only call if real

    sweep = SweepRun(profile_id=profile.id, trigger=trigger, status="running", started_at=_utcnow())
    db.add(sweep)
    db.commit()
    db.refresh(sweep)

    if comment_generator is None:
        from services.comment_generator import generate_comment as _real_comment
        comment_generator = _real_comment

    # Build IG client AFTER the sweep row exists so login failures get
    # recorded as a failed sweep rather than a 500 to the caller.
    if ig_client is None:
        try:
            ig_client = build_client(
                dry_run=settings.ig_dry_run,
                username=settings.ig_username,
                password=settings.ig_password,
                session_dir=SESSION_DIR,
            )
        except Exception as exc:
            sweep.status = "failed"
            sweep.error_message = f"IG login failed: {str(exc)[:400]}"
            sweep.finished_at = _utcnow()
            db.commit()
            db.refresh(sweep)
            return sweep

    # Determine mode flags up-front so logic below stays readable.
    skip_real_writes = settings.ig_dry_run or settings.ig_read_only
    log_dry_run_flag = skip_real_writes  # True in DRY_RUN and READ_ONLY modes

    targets = (
        db.query(TargetAccount)
        .filter(TargetAccount.profile_id == profile.id, TargetAccount.is_active.is_(True))
        .all()
    )

    # How many actions has this profile already used today? Used by SafetyGuard.
    todays_logs = (
        db.query(InteractionLog)
        .filter(InteractionLog.profile_id == profile.id)
        .all()
    )
    used_today = safety_guard.count_actions_today(todays_logs)
    cap = settings.daily_action_cap

    try:
        for target in targets:
            sweep.targets_scanned += 1
            try:
                posts = ig_client.fetch_recent_posts(target.ig_username, limit=3)
            except Exception as exc:
                _record_log(
                    db,
                    sweep=sweep,
                    profile=profile,
                    target=target,
                    action_type="skip",
                    status="failed",
                    skip_reason="fetch_failed",
                    error_message=str(exc)[:500],
                )
                sweep.actions_failed += 1
                target.last_swept_at = _utcnow()
                continue

            new_posts = [p for p in posts if p.post_id and p.post_id != target.last_seen_post_id]
            if not new_posts:
                _record_log(
                    db,
                    sweep=sweep,
                    profile=profile,
                    target=target,
                    action_type="skip",
                    status="skipped",
                    skip_reason="no_new_post",
                )
                sweep.actions_skipped += 1
                target.last_swept_at = _utcnow()
                continue

            # newest first; cap to per-target max
            posts_to_act = new_posts[: max(1, target.max_actions_per_sweep)]
            sweep.new_posts_found += len(posts_to_act)

            for post in posts_to_act:
                # SafetyGuard verdict
                verdict = safety_guard.check_action_allowed(used_today=used_today, cap=cap)
                if not verdict.allowed:
                    _record_log(
                        db,
                        sweep=sweep,
                        profile=profile,
                        target=target,
                        action_type="skip",
                        status="skipped",
                        skip_reason=verdict.reason,
                        target_post_id=post.post_id,
                        target_post_url=post.url,
                    )
                    sweep.actions_skipped += 1
                    continue

                # Weighted random: like vs comment
                like_ratio = (
                    target.like_ratio_override
                    if target.like_ratio_override is not None
                    else settings.like_ratio
                )
                action = safety_guard.pick_action(like_ratio, rng=rng)

                comment_text = ""
                if action == "comment":
                    try:
                        comment_text = comment_generator(profile.persona, post.caption)[:300]
                    except Exception:
                        comment_text = "🐷"  # never block sweep on comment-gen failure

                # Execute the IG side (or skip in dry_run / read_only)
                executed = False
                err = ""
                if not skip_real_writes:
                    try:
                        if action == "like":
                            executed = ig_client.like_post(post.post_id)
                        else:
                            executed = ig_client.comment_post(post.post_id, comment_text)
                    except Exception as exc:
                        err = str(exc)[:500]

                    if sleep_fn is not None and executed:
                        delay = safety_guard.random_delay_seconds(
                            settings.action_delay_min_sec,
                            settings.action_delay_max_sec,
                            rng=rng,
                        )
                        sleep_fn(delay)

                action_completed = skip_real_writes or executed
                _record_log(
                    db,
                    sweep=sweep,
                    profile=profile,
                    target=target,
                    action_type=action,
                    status=("executed" if action_completed else "failed"),
                    target_post_id=post.post_id,
                    target_post_url=post.url,
                    target_username=target.ig_username,
                    comment_text=comment_text,
                    error_message=err,
                    dry_run=log_dry_run_flag,
                )

                if action_completed:
                    sweep.actions_planned += 1
                    if not skip_real_writes:
                        sweep.actions_executed += 1
                    used_today += 1
                else:
                    sweep.actions_failed += 1

            target.last_seen_post_id = posts_to_act[0].post_id  # newest of the batch
            target.last_swept_at = _utcnow()

        sweep.status = "completed"
    except Exception as exc:
        sweep.status = "failed"
        sweep.error_message = str(exc)[:500]
    finally:
        sweep.finished_at = _utcnow()
        db.commit()
        db.refresh(sweep)

    return sweep


def _record_log(
    db: Session,
    *,
    sweep: SweepRun,
    profile: AccountProfile,
    target: TargetAccount | None,
    action_type: str,
    status: str,
    skip_reason: str = "",
    error_message: str = "",
    target_post_id: str = "",
    target_post_url: str = "",
    target_username: str = "",
    comment_text: str = "",
    dry_run: bool = True,
) -> InteractionLog:
    log = InteractionLog(
        profile_id=profile.id,
        target_id=target.id if target else None,
        sweep_run_id=sweep.id,
        action_type=action_type,
        status=status,
        skip_reason=skip_reason,
        error_message=error_message,
        target_post_id=target_post_id,
        target_post_url=target_post_url,
        target_username=target_username or (target.ig_username if target else ""),
        comment_text=comment_text,
        dry_run=dry_run,
    )
    db.add(log)
    db.flush()
    return log
