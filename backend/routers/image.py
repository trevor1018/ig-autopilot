"""Image Studio router — AI image editing + generation."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from core.db import get_db
from models.persona import Persona
from services.image_editor import edit_image, generate_image

router = APIRouter(prefix="/image", tags=["image"])


MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB upload limit


def _persona_context(db: Session, persona_id: int | None) -> str:
    """Build a short context string about the persona for the image model."""
    if not persona_id:
        return ""
    persona = db.get(Persona, persona_id)
    if not persona:
        return ""
    parts = [
        f"The featured character in this image is named {persona.character_name}."
    ]
    if persona.style_notes:
        # Keep it short — long notes would dilute the user instruction.
        parts.append(persona.style_notes.split("\n", 1)[0])
    return " ".join(parts)


def _image_response(image_bytes: bytes, mime: str, text: str) -> Response:
    return Response(
        content=image_bytes,
        media_type=mime,
        headers={
            # Surface the model's narrative back to the client so the UI can
            # show "I closed the eyes by ..." style explanations if it wants.
            "X-Model-Narrative": text.replace("\n", " ")[:500] if text else "",
        },
    )


@router.post("/edit")
async def edit(
    instruction: str = Form(...),
    persona_id: int | None = Form(None),
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Instruction-based edit on an uploaded image.

    Returns the edited image as raw bytes (image/png by default).
    """
    if not instruction.strip():
        raise HTTPException(400, "instruction is required")

    image_bytes = await photo.read()
    if not image_bytes:
        raise HTTPException(400, "Empty image upload")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(413, f"Image too large (max {MAX_IMAGE_BYTES // 1024 // 1024} MB)")

    mime = (photo.content_type or "image/png") if photo.content_type and photo.content_type.startswith("image/") else "image/png"

    try:
        result = edit_image(
            image_bytes=image_bytes,
            instruction=instruction,
            image_mime=mime,
            persona_context=_persona_context(db, persona_id),
        )
    except RuntimeError as e:
        raise HTTPException(500, str(e))

    return _image_response(result.image_bytes, result.mime_type, result.text_response)


@router.post("/generate")
async def generate(
    prompt: str = Form(...),
    persona_id: int | None = Form(None),
    db: Session = Depends(get_db),
):
    """Text-to-image generation. Returns the generated image as raw bytes."""
    if not prompt.strip():
        raise HTTPException(400, "prompt is required")

    try:
        result = generate_image(
            prompt=prompt,
            persona_context=_persona_context(db, persona_id),
        )
    except RuntimeError as e:
        raise HTTPException(500, str(e))

    return _image_response(result.image_bytes, result.mime_type, result.text_response)
