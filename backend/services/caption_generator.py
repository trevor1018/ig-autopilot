"""
Caption generator powered by Gemini 2.5 Pro (free tier).

Why this design:
- The persona spec (character, tones, style rules, few-shot examples) is sent
  as `system_instruction` on every request. Each call gets the full setup —
  Gemini cannot "forget" between requests the way a chat session does.
- Photos are passed as Parts with raw bytes + mime_type — no extra deps.
  Single-photo posts and multi-photo IG carousels go through the same path;
  the user_text just tells Gemini whether to write for one shot or a set.
- `response_schema` constrains output to {photo_summary, captions, hashtags}
  so the frontend always receives well-formed JSON.
- Free tier doesn't expose explicit cache stats, so cache_* fields stay zero.
"""

from __future__ import annotations

from typing import Any

from google import genai
from google.genai import types
from pydantic import BaseModel

from core.config import settings
from models.persona import Persona


class _Captions(BaseModel):
    zh: str
    ja: str
    en: str


class _CaptionOutput(BaseModel):
    photo_summary: str
    captions: _Captions
    hashtags: list[str]


def build_persona_system_prompt(persona: Persona) -> str:
    """Render the full persona spec as a single system instruction.

    Keep it deterministic — no timestamps, no randomness, no per-request
    fields. The same persona always yields the same instruction string.
    """
    tones = "、".join(persona.tones) if persona.tones else "natural"
    langs = ", ".join(persona.languages) if persona.languages else "zh, ja, en"
    required_tags = ", ".join(f"#{t.lstrip('#')}" for t in persona.required_hashtags)

    parts: list[str] = []
    parts.append(
        f"You are a social-media copywriter generating Instagram captions in the persona of "
        f"\"{persona.character_name}\"."
    )
    parts.append(
        f"\nPOV: {persona.pov}. Write as if {persona.character_name} themselves is speaking, "
        f"first-person, in-character at all times."
    )
    parts.append(f"\nTone: {tones}.")
    parts.append(f"\nLanguages to produce (in this order): {langs}.")
    parts.append(
        f"\nHashtag rules:\n"
        f"  - Always produce exactly {persona.hashtag_count} hashtags.\n"
        f"  - These MUST be included: {required_tags or '(none)'}.\n"
        f"  - Distribute languages: among the {persona.hashtag_count} hashtags, include "
        f"AT LEAST ONE hashtag in each of these languages: {langs}. "
        f"Required hashtags count toward this rule (e.g. #暖暖豬 counts as zh). "
        f"For the remaining slots, fill in tags that fit the photo content and audience, "
        f"making sure every listed language has at least one tag.\n"
        f"  - Each hashtag is a single token starting with #, no spaces inside the tag."
    )

    if persona.style_notes:
        parts.append(f"\nAdditional style notes:\n{persona.style_notes}")

    if persona.example_posts:
        parts.append("\nReference posts (style examples — match the voice, do not copy verbatim):")
        for i, ex in enumerate(persona.example_posts, start=1):
            parts.append(f"\nExample {i}:")
            if ex.get("photo_description"):
                parts.append(f"  Photo: {ex['photo_description']}")
            if ex.get("caption_zh"):
                parts.append(f"  ZH: {ex['caption_zh']}")
            if ex.get("caption_ja"):
                parts.append(f"  JA: {ex['caption_ja']}")
            if ex.get("caption_en"):
                parts.append(f"  EN: {ex['caption_en']}")

    parts.append(
        "\nWhen given a new photo (or a set of photos for an IG carousel post), respond "
        "with JSON only: a short photo_summary, captions in each language, and the hashtag "
        "list. For multi-photo posts, write the captions for the SET as a whole — they should "
        "tie the photos together as one mini story, not describe any single shot."
    )
    return "".join(parts)


def _detect_media_type(filename: str | None, content: bytes) -> str:
    if filename:
        lower = filename.lower()
        if lower.endswith((".jpg", ".jpeg")):
            return "image/jpeg"
        if lower.endswith(".png"):
            return "image/png"
        if lower.endswith(".gif"):
            return "image/gif"
        if lower.endswith(".webp"):
            return "image/webp"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG"):
        return "image/png"
    if content.startswith(b"GIF8"):
        return "image/gif"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


def generate_caption(
    persona: Persona,
    photos: list[tuple[bytes, str | None]],
    user_hint: str = "",
) -> dict[str, Any]:
    """Generate captions for one photo or a multi-photo carousel.

    `photos` is a list of (image_bytes, filename) tuples. Length 1 = single
    post, 2-10 = IG carousel. Filename is used only to sniff mime type.
    """
    if not settings.gemini_api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Copy .env.example to .env and fill it in. "
            "Get a free key at https://aistudio.google.com/apikey"
        )
    if not photos:
        raise RuntimeError("At least one photo is required.")

    client = genai.Client(api_key=settings.gemini_api_key)

    system_prompt = build_persona_system_prompt(persona)

    image_parts = []
    for img_bytes, filename in photos:
        media_type = _detect_media_type(filename, img_bytes)
        image_parts.append(types.Part.from_bytes(data=img_bytes, mime_type=media_type))

    n = len(photos)
    if n == 1:
        user_text = (
            f"Generate the caption set for this photo.\n"
            f"User hint (may be empty): {user_hint or '(none)'}"
        )
    else:
        user_text = (
            f"Generate the caption set for this {n}-photo Instagram CAROUSEL post. "
            f"All {n} images belong to the same post and share ONE caption set — write captions "
            f"that work as a single voice across the whole set, not photo-by-photo. "
            f"The photo_summary should briefly describe the set as a whole.\n"
            f"User hint (may be empty): {user_hint or '(none)'}"
        )

    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=[*image_parts, user_text],
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=_CaptionOutput,
        ),
    )

    parsed = response.parsed
    if parsed is None:
        raise RuntimeError(f"Gemini returned no parseable output. Raw text: {response.text[:200]}")

    usage = response.usage_metadata
    return {
        "captions": parsed.captions.model_dump(),
        "hashtags": parsed.hashtags,
        "photo_summary": parsed.photo_summary,
        "input_tokens": getattr(usage, "prompt_token_count", 0) or 0,
        "output_tokens": getattr(usage, "candidates_token_count", 0) or 0,
        "cache_read_tokens": getattr(usage, "cached_content_token_count", 0) or 0,
        "cache_creation_tokens": 0,
    }
