from datetime import datetime
from pydantic import BaseModel

from schemas.persona import PersonaOut


class AccountProfileBase(BaseModel):
    ig_username: str
    display_name: str = ""
    description: str = ""
    persona_id: int | None = None


class AccountProfileCreate(AccountProfileBase):
    pass


class AccountProfileUpdate(BaseModel):
    ig_username: str | None = None
    display_name: str | None = None
    description: str | None = None
    persona_id: int | None = None


class AccountProfileOut(AccountProfileBase):
    id: int
    created_at: datetime
    updated_at: datetime
    persona: PersonaOut | None = None

    class Config:
        from_attributes = True
