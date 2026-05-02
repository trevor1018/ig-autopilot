from pydantic import BaseModel, Field


class CaptionRequest(BaseModel):
    persona_id: int
    user_hint: str = Field(default="", description="Optional extra context about the photo / scene")


class CaptionVersion(BaseModel):
    zh: str
    ja: str
    en: str


class CaptionResponse(BaseModel):
    captions: CaptionVersion
    hashtags: list[str]
    photo_summary: str = ""
    cache_read_tokens: int = 0
    cache_creation_tokens: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
