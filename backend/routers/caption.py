from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from core.db import get_db
from models.persona import Persona
from schemas.caption import CaptionResponse, CaptionVersion
from services.caption_generator import generate_caption

router = APIRouter(prefix="/caption", tags=["caption"])


MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB per photo
MAX_TOTAL_BYTES = 30 * 1024 * 1024  # 30 MB total upload
MAX_PHOTOS = 10  # IG carousel hard limit


@router.post("/generate", response_model=CaptionResponse)
async def generate(
    persona_id: int = Form(...),
    user_hint: str = Form(""),
    photos: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    persona = db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(404, f"Persona {persona_id} not found")

    if not photos:
        raise HTTPException(400, "至少要上傳一張照片")
    if len(photos) > MAX_PHOTOS:
        raise HTTPException(400, f"最多 {MAX_PHOTOS} 張照片(IG carousel 上限)")

    photos_data: list[tuple[bytes, str | None]] = []
    total_bytes = 0
    for photo in photos:
        image_bytes = await photo.read()
        if not image_bytes:
            raise HTTPException(400, f"Empty image: {photo.filename or '?'}")
        if len(image_bytes) > MAX_IMAGE_BYTES:
            raise HTTPException(
                413,
                f"Image '{photo.filename}' too large (max {MAX_IMAGE_BYTES // 1024 // 1024} MB per photo)",
            )
        total_bytes += len(image_bytes)
        if total_bytes > MAX_TOTAL_BYTES:
            raise HTTPException(
                413,
                f"Total upload too large (max {MAX_TOTAL_BYTES // 1024 // 1024} MB)",
            )
        photos_data.append((image_bytes, photo.filename))

    try:
        result = generate_caption(
            persona=persona,
            photos=photos_data,
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
