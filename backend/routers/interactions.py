from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.config import settings
from core.db import get_db
from models.account_profile import AccountProfile
from models.interaction_log import InteractionLog
from schemas.interaction import InteractionLogOut, QuotaStatus
from services import safety_guard

router = APIRouter(prefix="/interactions", tags=["interactions"])


@router.get("", response_model=list[InteractionLogOut])
def list_interactions(
    profile_id: int | None = Query(None),
    target_id: int | None = Query(None),
    sweep_run_id: int | None = Query(None),
    action_type: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(InteractionLog).order_by(InteractionLog.created_at.desc())
    if profile_id is not None:
        q = q.filter(InteractionLog.profile_id == profile_id)
    if target_id is not None:
        q = q.filter(InteractionLog.target_id == target_id)
    if sweep_run_id is not None:
        q = q.filter(InteractionLog.sweep_run_id == sweep_run_id)
    if action_type:
        q = q.filter(InteractionLog.action_type == action_type)
    if status:
        q = q.filter(InteractionLog.status == status)
    return q.offset(offset).limit(limit).all()


@router.get("/quota/{profile_id}", response_model=QuotaStatus)
def get_quota(profile_id: int, db: Session = Depends(get_db)):
    profile = db.get(AccountProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    logs = db.query(InteractionLog).filter(InteractionLog.profile_id == profile_id).all()
    used = safety_guard.count_actions_today(logs)
    cap = settings.daily_action_cap
    return QuotaStatus(
        profile_id=profile_id,
        used_today=used,
        cap=cap,
        remaining=max(0, cap - used),
        seconds_until_reset=safety_guard.next_reset_in_seconds(),
        dry_run=settings.ig_dry_run,
    )
