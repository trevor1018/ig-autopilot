/**
 * Browser-side Gemini API wrapper.
 *
 * Uses the public REST endpoint (generativelanguage.googleapis.com) with the
 * user's own API key, which lives in their Firestore settings doc. Each user
 * burns their own free-tier quota — no shared backend, no billing surprises.
 */

import { Persona } from "./firestore";
import { buildPersonaSystemPrompt } from "./persona-prompt";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export const TEXT_MODEL = "gemini-2.5-flash";
// Image generation moved out of Gemini (paid only — got billing surprises).
// See lib/pollinations.ts for the free image gen + this file's
// describePhotoForRegeneration() for the Vision describe step that helps
// "edit" mode regenerate something similar to the source photo.

interface InlinePart {
  inlineData: { mimeType: string; data: string };
}
interface TextPart {
  text: string;
}
type Part = InlinePart | TextPart;

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Part[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

async function callGemini(
  model: string,
  body: object,
  apiKey: string,
): Promise<GeminiResponse> {
  if (!apiKey) {
    throw new Error("Gemini API key is not set. Open 設定 page to add it.");
  }
  const res = await fetch(`${API_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

// ===== Caption generation =====

export interface CaptionApiPhoto {
  base64: string;
  mimeType: string;
}

export interface CaptionResult {
  photo_summary: string;
  captions: { zh: string; ja: string; en: string };
  hashtags: string[];
  input_tokens: number;
  output_tokens: number;
}

const CAPTION_SCHEMA = {
  type: "object",
  properties: {
    photo_summary: { type: "string" },
    captions: {
      type: "object",
      properties: {
        zh: { type: "string" },
        ja: { type: "string" },
        en: { type: "string" },
      },
      required: ["zh", "ja", "en"],
    },
    hashtags: { type: "array", items: { type: "string" } },
  },
  required: ["photo_summary", "captions", "hashtags"],
};

const TRANSLATE_SCHEMA = {
  type: "object",
  properties: {
    ja: { type: "string" },
    en: { type: "string" },
  },
  required: ["ja", "en"],
};

const HASHTAGS_SCHEMA = {
  type: "object",
  properties: {
    hashtags: { type: "array", items: { type: "string" } },
  },
  required: ["hashtags"],
};

export async function generateCaption(
  persona: Persona,
  photos: CaptionApiPhoto[],
  userHint: string,
  apiKey: string,
): Promise<CaptionResult> {
  if (photos.length === 0) throw new Error("At least one photo is required.");

  const systemPrompt = buildPersonaSystemPrompt(persona);
  const userText =
    photos.length === 1
      ? `Generate the caption set for this photo.\nUser hint (may be empty): ${userHint || "(none)"}`
      : `Generate the caption set for this ${photos.length}-photo Instagram CAROUSEL post. ` +
        `All ${photos.length} images belong to the same post and share ONE caption set — write captions ` +
        `that work as a single voice across the whole set, not photo-by-photo. ` +
        `The photo_summary should briefly describe the set as a whole.\n` +
        `User hint (may be empty): ${userHint || "(none)"}`;

  const parts: Part[] = [
    ...photos.map((p) => ({
      inlineData: { mimeType: p.mimeType, data: p.base64 },
    })),
    { text: userText },
  ];

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: CAPTION_SCHEMA,
    },
  };

  const r = await callGemini(TEXT_MODEL, body, apiKey);
  const textPart = r.candidates?.[0]?.content?.parts?.find(
    (p): p is TextPart => "text" in p,
  );
  if (!textPart) {
    const block = r.promptFeedback?.blockReason || "no candidates";
    throw new Error(`Gemini returned no text. (${block})`);
  }
  const parsed = JSON.parse(textPart.text);
  return {
    photo_summary: parsed.photo_summary,
    captions: parsed.captions,
    hashtags: parsed.hashtags,
    input_tokens: r.usageMetadata?.promptTokenCount ?? 0,
    output_tokens: r.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

export async function translateCaption(
  persona: Persona,
  zhText: string,
  apiKey: string,
): Promise<{ ja: string; en: string }> {
  const systemPrompt = buildPersonaSystemPrompt(persona);
  const userText =
    `The user has edited the zh-TW caption below. Produce ja and en versions in the ` +
    `same ${persona.character_name} voice — same tone, similar length, in-character first-person. ` +
    `Each language should be the most natural phrasing for that language, NOT a literal ` +
    `word-for-word translation. Output JSON only.\n\nZH (edited):\n${zhText}`;

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: userText }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: TRANSLATE_SCHEMA,
    },
  };
  const r = await callGemini(TEXT_MODEL, body, apiKey);
  const textPart = r.candidates?.[0]?.content?.parts?.find(
    (p): p is TextPart => "text" in p,
  );
  if (!textPart) throw new Error("Gemini returned no translation.");
  return JSON.parse(textPart.text);
}

export async function regenerateHashtags(
  persona: Persona,
  zhText: string,
  apiKey: string,
): Promise<string[]> {
  const systemPrompt = buildPersonaSystemPrompt(persona);
  const userText =
    `Based on this zh-TW caption, produce a fresh set of hashtags following the ` +
    `hashtag rules from the system prompt above (exact count, required tags, ` +
    `language distribution). Output JSON only.\n\nZH:\n${zhText}`;

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: userText }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: HASHTAGS_SCHEMA,
    },
  };
  const r = await callGemini(TEXT_MODEL, body, apiKey);
  const textPart = r.candidates?.[0]?.content?.parts?.find(
    (p): p is TextPart => "text" in p,
  );
  if (!textPart) throw new Error("Gemini returned no hashtags.");
  return JSON.parse(textPart.text).hashtags;
}

// ===== Image-related text helpers =====
// Note: ACTUAL image generation moved to Pollinations.ai (see pollinations.ts).
// Gemini still helps by describing source photos so Pollinations can
// regenerate something similar with the user's edit instruction applied.

/**
 * Use Gemini Vision (text model — not the paid image one) to produce a short
 * English description of an uploaded photo. This description is fed into
 * Pollinations as part of the image-generation prompt for "edit" mode.
 */
export async function describePhotoForRegeneration(
  imageBase64: string,
  imageMime: string,
  apiKey: string,
): Promise<string> {
  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType: imageMime, data: imageBase64 } },
          {
            text:
              "Describe this image in detail in English so another AI could regenerate something similar. " +
              "Cover: subjects, composition, colors, lighting, art style, atmosphere. " +
              "2-4 sentences, no preamble, just the description.",
          },
        ],
      },
    ],
  };
  const r = await callGemini(TEXT_MODEL, body, apiKey);
  const textPart = r.candidates?.[0]?.content?.parts?.find(
    (p): p is TextPart => "text" in p,
  );
  if (!textPart) throw new Error("Gemini Vision returned no description.");
  return textPart.text.trim();
}

