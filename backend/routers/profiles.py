from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.db import get_db
from models.account_profile import AccountProfile
from models.persona import Persona
from schemas.profile import AccountProfileCreate, AccountProfileOut, AccountProfileUpdate

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("", response_model=list[AccountProfileOut])
def list_profiles(db: Session = Depends(get_db)):
    return db.query(AccountProfile).order_by(AccountProfile.id).all()


@router.post("", response_model=AccountProfileOut, status_code=201)
def create_profile(payload: AccountProfileCreate, db: Session = Depends(get_db)):
    if db.query(AccountProfile).filter(AccountProfile.ig_username == payload.ig_username).first():
        raise HTTPException(409, f"Profile '{payload.ig_username}' already exists")
    if payload.persona_id is not None and not db.get(Persona, payload.persona_id):
        raise HTTPException(400, f"Persona {payload.persona_id} does not exist")
    profile = AccountProfile(**payload.model_dump())
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/{profile_id}", response_model=AccountProfileOut)
def get_profile(profile_id: int, db: Session = Depends(get_db)):
    profile = db.get(AccountProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    return profile


@router.patch("/{profile_id}", response_model=AccountProfileOut)
def update_profile(profile_id: int, payload: AccountProfileUpdate, db: Session = Depends(get_db)):
    profile = db.get(AccountProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    data = payload.model_dump(exclude_unset=True)
    if "persona_id" in data and data["persona_id"] is not None:
        if not db.get(Persona, data["persona_id"]):
            raise HTTPException(400, f"Persona {data['persona_id']} does not exist")
    for k, v in data.items():
        setattr(profile, k, v)
    db.commit()
    db.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=204)
def delete_profile(profile_id: int, db: Session = Depends(get_db)):
    profile = db.get(AccountProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    db.delete(profile)
    db.commit()
