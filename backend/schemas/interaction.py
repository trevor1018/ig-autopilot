from datetime import datetime
from pydantic import BaseModel


class InteractionLogOut(BaseModel):
    id: int
    profile_id: int
    target_id: int | None
    sweep_run_id: int | None

    action_type: str
    target_username: str
    target_post_id: str
    target_post_url: str
    comment_text: str

    status: str
    dry_run: bool
    error_message: str
    skip_reason: str

    created_at: datetime

    class Config:
        from_attributes = True


class SweepRunOut(BaseModel):
    id: int
    profile_id: int
    trigger: str
    status: str
    started_at: datetime
    finished_at: datetime | None
    targets_scanned: int
    new_posts_found: int
    actions_planned: int
    actions_executed: int
    actions_skipped: int
    actions_failed: int
    error_message: str

    class Config:
        from_attributes = True


class QuotaStatus(BaseModel):
    profile_id: int
    used_today: int
    cap: int
    remaining: int
    seconds_until_reset: int
    dry_run: bool
    mode: str  # "dry_run" | "read_only" | "live"
