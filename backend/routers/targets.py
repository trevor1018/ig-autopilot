from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.db import get_db
from models.account_profile import AccountProfile
from models.target_account import TargetAccount
from schemas.target import TargetAccountCreate, TargetAccountOut, TargetAccountUpdate

router = APIRouter(prefix="/targets", tags=["targets"])


@router.get("", response_model=list[TargetAccountOut])
def list_targets(
    profile_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(TargetAccount)
    if profile_id is not None:
        q = q.filter(TargetAccount.profile_id == profile_id)
    return q.order_by(TargetAccount.id).all()


@router.post("", response_model=TargetAccountOut, status_code=201)
def create_target(payload: TargetAccountCreate, db: Session = Depends(get_db)):
    if not db.get(AccountProfile, payload.profile_id):
        raise HTTPException(400, f"Profile {payload.profile_id} does not exist")
    existing = (
        db.query(TargetAccount)
        .filter(
            TargetAccount.profile_id == payload.profile_id,
            TargetAccount.ig_username == payload.ig_username,
        )
        .first()
    )
    if existing:
        raise HTTPException(409, f"Target @{payload.ig_username} already exists for this profile")
    target = TargetAccount(**payload.model_dump())
    db.add(target)
    db.commit()
    db.refresh(target)
    return target


@router.get("/{target_id}", response_model=TargetAccountOut)
def get_target(target_id: int, db: Session = Depends(get_db)):
    target = db.get(TargetAccount, target_id)
    if not target:
        raise HTTPException(404, "Target not found")
    return target


@router.patch("/{target_id}", response_model=TargetAccountOut)
def update_target(target_id: int, payload: TargetAccountUpdate, db: Session = Depends(get_db)):
    target = db.get(TargetAccount, target_id)
    if not target:
        raise HTTPException(404, "Target not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(target, k, v)
    db.commit()
    db.refresh(target)
    return target


@router.delete("/{target_id}", status_code=204)
def delete_target(target_id: int, db: Session = Depends(get_db)):
    target = db.get(TargetAccount, target_id)
    if not target:
        raise HTTPException(404, "Target not found")
    db.delete(target)
    db.commit()
