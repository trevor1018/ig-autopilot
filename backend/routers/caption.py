from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from core.db import get_db
from models.persona import Persona
from schemas.caption import CaptionResponse, CaptionVersion
from services.caption_generator import generate_caption

router = APIRouter(prefix="/caption", tags=["caption"])


MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB


@router.post("/generate", response_model=CaptionResponse)
async def generate(
    persona_id: int = Form(...),
    user_hint: str = Form(""),
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    persona = db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(404, f"Persona {persona_id} not found")

    image_bytes = await photo.read()
    if not image_bytes:
        raise HTTPException(400, "Empty image upload")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(413, f"Image too large (max {MAX_IMAGE_BYTES // 1024 // 1024} MB)")

    try:
        result = generate_caption(
            persona=persona,
            image_bytes=image_bytes,
            filename=photo.filename,
            user_hint=user_hint,
        )
    except RuntimeError as e:
        raise HTTPException(500, str(e))

    return CaptionResponse(
        captions=CaptionVersion(**result["captions"]),
        hashtags=result["hashtags"],
        photo_summary=result["photo_summary"],
        cache_read_tokens=result["cache_read_tokens"],
        cache_creation_tokens=result["cache_creation_tokens"],
        input_tokens=result["input_tokens"],
        output_tokens=result["output_tokens"],
    )
