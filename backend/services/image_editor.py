"""AI image editing + generation via Gemini 2.5 Flash Image (Nano Banana).

Two operations:
  1. edit_image  — instruction-based edit on an existing image.
                   The hallmark use case: "close the doll's eyes; keep
                   everything else completely unchanged." The model
                   identifies the subject + region from text and applies
                   a localized change while preserving the rest.
  2. generate_image — text-to-image generation from a prompt.

Both share the Gemini SDK we already use for caption_generator. No extra
deps. Output is PNG bytes (Gemini's default for image responses).

Model defaults to gemini-2.5-flash-image-preview but is configurable via
IMAGE_MODEL env var in case Google renames it.
"""

from __future__ import annotations

from dataclasses import dataclass

from google import genai
from google.genai import types

from core.config import settings


@dataclass
class ImageResult:
    image_bytes: bytes
    mime_type: str
    text_response: str = ""  # the model often narrates what it did; useful for UI / debug


def _extract_image(response) -> ImageResult:
    """Pull the first image part out of a Gemini image-mode response.

    The response from gemini-2.5-flash-image-preview is a list of parts;
    image parts have inline_data.{data, mime_type}; text parts have .text.
    """
    if not response.candidates:
        raise RuntimeError("Image API returned no candidates (likely safety-filtered).")
    parts = response.candidates[0].content.parts or []

    image_bytes: bytes | None = None
    mime: str = "image/png"
    text_chunks: list[str] = []

    for part in parts:
        inline = getattr(part, "inline_data", None)
        if inline is not None and getattr(inline, "data", None):
            if image_bytes is None:  # take first image
                image_bytes = inline.data
                mime = inline.mime_type or "image/png"
        elif getattr(part, "text", None):
            text_chunks.append(part.text)

    if image_bytes is None:
        narrative = " ".join(text_chunks)[:500]
        raise RuntimeError(
            f"Image API returned no image. Model said: {narrative or '(no text)'}"
        )

    return ImageResult(
        image_bytes=image_bytes,
        mime_type=mime,
        text_response=" ".join(text_chunks).strip(),
    )


def _client() -> genai.Client:
    if not settings.gemini_api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Copy .env.example to .env and fill it in. "
            "Get a free key at https://aistudio.google.com/apikey"
        )
    return genai.Client(api_key=settings.gemini_api_key)


def edit_image(
    image_bytes: bytes,
    instruction: str,
    *,
    image_mime: str = "image/png",
    persona_context: str = "",
) -> ImageResult:
    """Apply an instruction-based edit to an image.

    `persona_context` (optional) gets prepended to the instruction so the
    model knows who to preserve. Example:
        persona_context = "The plush pig in this photo is named 暖暖豬."
        instruction      = "Close his eyes; keep everything else identical."
    """
    if not instruction.strip():
        raise RuntimeError("Edit instruction is required.")

    full_prompt = (
        f"{persona_context.strip()}\n{instruction.strip()}".strip()
        if persona_context
        else instruction.strip()
    )

    response = _client().models.generate_content(
        model=settings.image_model,
        contents=[
            full_prompt,
            types.Part.from_bytes(data=image_bytes, mime_type=image_mime),
        ],
    )
    return _extract_image(response)


def generate_image(
    prompt: str,
    *,
    persona_context: str = "",
) -> ImageResult:
    """Generate a new image from a text prompt."""
    if not prompt.strip():
        raise RuntimeError("Prompt is required.")

    full_prompt = (
        f"{persona_context.strip()}\n{prompt.strip()}".strip()
        if persona_context
        else prompt.strip()
    )

    response = _client().models.generate_content(
        model=settings.image_model,
        contents=[full_prompt],
    )
    return _extract_image(response)
