"""APScheduler configuration — runs sweep.run_sweep() at SWEEP_HOURS each day.

Scheduler is started during FastAPI lifespan. In dev with --reload, the scheduler
is started in the worker process (not the reloader) — the reloader spawns the
worker and the worker calls our startup hook.

We deliberately use a `BackgroundScheduler` (sync) rather than AsyncIOScheduler
because run_sweep does blocking SQLAlchemy + (eventually) instagrapi calls,
and running blocking code on the asyncio loop would stall HTTP requests.
"""

from __future__ import annotations

import logging
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from core.config import settings
from core.db import SessionLocal
from models.account_profile import AccountProfile
from services.sweep import run_sweep


_logger = logging.getLogger("ig_autopilot.scheduler")
_scheduler: Optional[BackgroundScheduler] = None


def _scheduled_sweep_all_profiles() -> None:
    """Run a sweep for every AccountProfile that has at least one target."""
    db = SessionLocal()
    try:
        profiles = db.query(AccountProfile).all()
        for profile in profiles:
            try:
                _logger.info("scheduled sweep starting for profile %s", profile.ig_username)
                run_sweep(db, profile, trigger="scheduled")
            except Exception as exc:  # noqa: BLE001
                _logger.exception("sweep failed for profile %s: %s", profile.ig_username, exc)
    finally:
        db.close()


def start_scheduler() -> BackgroundScheduler:
    """Start the global scheduler. Idempotent — safe to call twice."""
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler

    sched = BackgroundScheduler(timezone="UTC")
    hours = ",".join(str(h) for h in settings.sweep_hour_list)
    sched.add_job(
        _scheduled_sweep_all_profiles,
        trigger=CronTrigger(hour=hours, minute=0, timezone="UTC"),
        id="sweep_all_profiles",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    sched.start()
    _scheduler = sched
    _logger.info("scheduler started; sweep hours UTC=%s", hours)
    return sched


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
    _scheduler = None
