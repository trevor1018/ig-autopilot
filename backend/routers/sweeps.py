from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.db import get_db
from models.account_profile import AccountProfile
from models.sweep_run import SweepRun
from schemas.interaction import SweepRunOut
from services.sweep import run_sweep

router = APIRouter(prefix="/sweeps", tags=["sweeps"])


@router.get("", response_model=list[SweepRunOut])
def list_sweeps(
    profile_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(SweepRun).order_by(SweepRun.started_at.desc())
    if profile_id is not None:
        q = q.filter(SweepRun.profile_id == profile_id)
    return q.limit(limit).all()


@router.get("/{sweep_id}", response_model=SweepRunOut)
def get_sweep(sweep_id: int, db: Session = Depends(get_db)):
    sweep = db.get(SweepRun, sweep_id)
    if not sweep:
        raise HTTPException(404, "Sweep run not found")
    return sweep


@router.post("/run/{profile_id}", response_model=SweepRunOut, status_code=201)
def trigger_sweep(profile_id: int, db: Session = Depends(get_db)):
    """Manually fire a sweep for one profile.

    Use this for testing — scheduler triggers automatically per SWEEP_HOURS.
    """
    profile = db.get(AccountProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    sweep = run_sweep(db, profile, trigger="manual")
    return sweep
