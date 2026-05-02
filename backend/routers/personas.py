from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.db import get_db
from models.persona import Persona
from schemas.persona import PersonaCreate, PersonaOut, PersonaUpdate

router = APIRouter(prefix="/personas", tags=["personas"])


@router.get("", response_model=list[PersonaOut])
def list_personas(db: Session = Depends(get_db)):
    return db.query(Persona).order_by(Persona.id).all()


@router.post("", response_model=PersonaOut, status_code=201)
def create_persona(payload: PersonaCreate, db: Session = Depends(get_db)):
    if db.query(Persona).filter(Persona.name == payload.name).first():
        raise HTTPException(409, f"Persona '{payload.name}' already exists")
    persona = Persona(
        **payload.model_dump(exclude={"example_posts"}),
        example_posts=[ep.model_dump() for ep in payload.example_posts],
    )
    db.add(persona)
    db.commit()
    db.refresh(persona)
    return persona


@router.get("/{persona_id}", response_model=PersonaOut)
def get_persona(persona_id: int, db: Session = Depends(get_db)):
    persona = db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(404, "Persona not found")
    return persona


@router.patch("/{persona_id}", response_model=PersonaOut)
def update_persona(persona_id: int, payload: PersonaUpdate, db: Session = Depends(get_db)):
    persona = db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(404, "Persona not found")
    data = payload.model_dump(exclude_unset=True)
    if "example_posts" in data and data["example_posts"] is not None:
        data["example_posts"] = [ep if isinstance(ep, dict) else ep.model_dump() for ep in data["example_posts"]]
    for k, v in data.items():
        setattr(persona, k, v)
    db.commit()
    db.refresh(persona)
    return persona


@router.delete("/{persona_id}", status_code=204)
def delete_persona(persona_id: int, db: Session = Depends(get_db)):
    persona = db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(404, "Persona not found")
    db.delete(persona)
    db.commit()
