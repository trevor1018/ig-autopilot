from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.db import get_db
from models.account_profile import AccountProfile
from services import analyzer

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/activity/{profile_id}")
def activity(
    profile_id: int,
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
):
    if not db.get(AccountProfile, profile_id):
        raise HTTPException(404, "Profile not found")
    return analyzer.activity_summary(db, profile_id=profile_id, days=days)


@router.get("/content/{profile_id}")
def content(profile_id: int, db: Session = Depends(get_db)):
    if not db.get(AccountProfile, profile_id):
        raise HTTPException(404, "Profile not found")
    return analyzer.content_summary(db, profile_id=profile_id)
