"""Generate short in-character comments for auto-interactions.

Given a Persona + a target post (caption + maybe summary), ask Gemini for
ONE short comment in the persona's voice. Keep it short (≤30 chars) and
varied (high temperature) so it doesn't look templated.

Different from caption_generator: no image input, no structured JSON, plain text.
"""

from __future__ import annotations

import random

from google import genai
from google.genai import types

from core.config import settings
from models.persona import Persona


_FALLBACK_COMMENTS_ZH = [
    "好喜歡這張～",
    "可愛！",
    "看了心情變好🥰",
    "這氣氛剛剛好",
    "好療癒～",
]


def _build_comment_prompt(persona: Persona) -> str:
    tones = "、".join(persona.tones) if persona.tones else "natural"
    return (
        f"You are {persona.character_name}, a plush-toy character speaking in first person. "
        f"Tone: {tones}. "
        f"Write a SINGLE short Instagram comment (≤25 characters, may include 1 emoji) "
        f"reacting to a post by another account. Stay in character. "
        f"Pick the language that fits best for the post (zh / ja / en). "
        f"Output the comment text ONLY, no quotes, no explanation."
    )


def generate_comment(persona: Persona, target_caption: str) -> str:
    """Call Gemini to generate one short comment. Falls back to a static line on error.

    Fallback exists because:
    - Free tier quota can run out
    - Network blips shouldn't block the whole sweep
    """
    if not settings.gemini_api_key:
        return random.choice(_FALLBACK_COMMENTS_ZH)

    try:
        client = genai.Client(api_key=settings.gemini_api_key)
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=[
                f"Target post caption: {target_caption[:300] if target_caption else '(empty)'}\n\n"
                f"Write the comment now."
            ],
            config=types.GenerateContentConfig(
                system_instruction=_build_comment_prompt(persona),
                temperature=1.1,
                max_output_tokens=60,
            ),
        )
        text = (response.text or "").strip().strip('"').strip("'")
        if not text or len(text) > 80:
            return random.choice(_FALLBACK_COMMENTS_ZH)
        return text
    except Exception:
        return random.choice(_FALLBACK_COMMENTS_ZH)
