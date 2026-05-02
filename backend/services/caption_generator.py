"""
Caption generator powered by Claude Sonnet 4.6.

Why this design:
- The persona prompt (character, tones, style rules, few-shot examples) is large
  and reused across every photo. Putting it in `system` with cache_control means
  the second call onwards reads it from cache at ~0.1x cost.
- The persona prompt is FROZEN at request time. The only volatile content goes
  into the user message (the photo + optional hint). Stable -> volatile order is
  what makes prompt caching actually work.
- Output is constrained via output_config.format json_schema so the frontend
  always gets {captions: {zh, ja, en}, hashtags: [...], photo_summary: "..."}.
"""

from __future__ import annotations

import base64
import json
from typing import Any

import anthropic

from core.config import settings
from models.persona import Persona


CAPTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "photo_summary": {
            "type": "string",
            "description": "One short sentence describing what is in the photo.",
        },
        "captions": {
            "type": "object",
            "properties": {
                "zh": {"type": "string", "description": "Traditional Chinese (zh-TW) caption."},
                "ja": {"type": "string", "description": "Japanese caption."},
                "en": {"type": "string", "description": "English caption."},
            },
            "required": ["zh", "ja", "en"],
            "additionalProperties": False,
        },
        "hashtags": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Exactly N hashtags including the #-prefix.",
        },
    },
    "required": ["photo_summary", "captions", "hashtags"],
    "additionalProperties": False,
}


def build_persona_system_prompt(persona: Persona) -> str:
    """Render the full persona spec as a single text block.

    This is the cacheable portion. Keep it deterministic — no timestamps, no
    randomness, no per-request fields. If you change wording, the cache resets
    once and then re-stabilizes.
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
        f"  - The remaining hashtags should fit the photo content and audience.\n"
        f"  - Each hashtag is a single token starting with #."
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
        "\nWhen given a new photo, respond with JSON only: a short photo_summary, "
        "captions in each language, and the hashtag list."
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
    image_bytes: bytes,
    filename: str | None = None,
    user_hint: str = "",
) -> dict[str, Any]:
    if not settings.anthropic_api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in."
        )

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    system_prompt = build_persona_system_prompt(persona)
    media_type = _detect_media_type(filename, image_bytes)
    image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    user_content: list[dict[str, Any]] = [
        {
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": image_b64},
        },
        {
            "type": "text",
            "text": (
                f"Generate the caption set for this photo.\n"
                f"User hint (may be empty): {user_hint or '(none)'}"
            ),
        },
    ]

    response = client.messages.create(
        model=settings.claude_model,
        max_tokens=2048,
        system=[
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_content}],
        output_config={
            "format": {"type": "json_schema", "schema": CAPTION_SCHEMA},
        },
    )

    text = next((b.text for b in response.content if b.type == "text"), "")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Model returned non-JSON output: {text[:200]}") from e

    return {
        "captions": parsed.get("captions", {}),
        "hashtags": parsed.get("hashtags", []),
        "photo_summary": parsed.get("photo_summary", ""),
        "cache_read_tokens": getattr(response.usage, "cache_read_input_tokens", 0) or 0,
        "cache_creation_tokens": getattr(response.usage, "cache_creation_input_tokens", 0) or 0,
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
    }
