from datetime import datetime
from pydantic import BaseModel, Field


class ExamplePost(BaseModel):
    photo_description: str = Field(default="")
    caption_zh: str = Field(default="")
    caption_ja: str = Field(default="")
    caption_en: str = Field(default="")


class PersonaBase(BaseModel):
    name: str
    character_name: str
    pov: str = "first_person"
    tones: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=lambda: ["zh", "ja", "en"])
    required_hashtags: list[str] = Field(default_factory=list)
    hashtag_count: int = 5
    style_notes: str = ""
    example_posts: list[ExamplePost] = Field(default_factory=list)


class PersonaCreate(PersonaBase):
    pass


class PersonaUpdate(BaseModel):
    name: str | None = None
    character_name: str | None = None
    pov: str | None = None
    tones: list[str] | None = None
    languages: list[str] | None = None
    required_hashtags: list[str] | None = None
    hashtag_count: int | None = None
    style_notes: str | None = None
    example_posts: list[ExamplePost] | None = None


class PersonaOut(PersonaBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
