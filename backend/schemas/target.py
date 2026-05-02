from datetime import datetime
from pydantic import BaseModel


class TargetAccountBase(BaseModel):
    profile_id: int
    ig_username: str
    display_name: str = ""
    genre_tags: str = ""
    notes: str = ""
    is_active: bool = True
    like_ratio_override: float | None = None
    max_actions_per_sweep: int = 1


class TargetAccountCreate(TargetAccountBase):
    pass


class TargetAccountUpdate(BaseModel):
    ig_username: str | None = None
    display_name: str | None = None
    genre_tags: str | None = None
    notes: str | None = None
    is_active: bool | None = None
    like_ratio_override: float | None = None
    max_actions_per_sweep: int | None = None


class TargetAccountOut(TargetAccountBase):
    id: int
    last_seen_post_id: str
    last_swept_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
