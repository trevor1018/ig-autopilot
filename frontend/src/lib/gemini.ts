/**
 * Browser-side Gemini API wrapper.
 *
 * Uses the public REST endpoint (generativelanguage.googleapis.com) with the
 * user's own API key, which lives in their Firestore settings doc. Each user
 * burns their own free-tier quota — no shared backend, no billing surprises.
 */

import { Persona } from "./firestore";
import { buildPersonaSystemPrompt, buildShortPersonaContext } from "./persona-prompt";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export const TEXT_MODEL = "gemini-2.5-flash";
// "Nano Banana" — Google's instruction-based image edit + gen model.
// Was originally `gemini-2.5-flash-image-preview`, rebranded to GA name
// `gemini-2.5-flash-image` in late 2025. If you get a 404 NOT_FOUND on this,
// try the alternates below — model IDs Google offers do shift over time.
//
// Known IDs to try (newest → oldest):
//   gemini-2.5-flash-image                  ← current GA, default
//   gemini-2.5-flash-image-preview          ← previous preview name
//   gemini-2.0-flash-exp-image-generation   ← older 2.0 experimental
export const IMAGE_MODEL = "gemini-2.5-flash-image";

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

// ===== Image edit + generate =====

export interface ImageGenResult {
  image_base64: string;
  image_mime: string;
  narrative: string;
}

function extractImage(r: GeminiResponse): ImageGenResult {
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  let imagePart: InlinePart | undefined;
  const textChunks: string[] = [];
  for (const p of parts) {
    if ("inlineData" in p && !imagePart) {
      imagePart = p;
    } else if ("text" in p) {
      textChunks.push(p.text);
    }
  }
  if (!imagePart) {
    const block = r.promptFeedback?.blockReason || "(none)";
    const text = textChunks.join(" ").slice(0, 300);
    throw new Error(`Image API returned no image. Block: ${block}. Model said: ${text || "(no text)"}`);
  }
  return {
    image_base64: imagePart.inlineData.data,
    image_mime: imagePart.inlineData.mimeType || "image/png",
    narrative: textChunks.join(" ").trim(),
  };
}

export async function editImage(
  imageBase64: string,
  imageMime: string,
  instruction: string,
  persona: Persona | null,
  apiKey: string,
): Promise<ImageGenResult> {
  if (!instruction.trim()) throw new Error("Instruction is required.");
  const fullPrompt = persona
    ? `${buildShortPersonaContext(persona)}\n${instruction.trim()}`
    : instruction.trim();
  const body = {
    contents: [
      {
        parts: [
          { text: fullPrompt },
          { inlineData: { mimeType: imageMime, data: imageBase64 } },
        ],
      },
    ],
  };
  return extractImage(await callGemini(IMAGE_MODEL, body, apiKey));
}

export async function generateImage(
  prompt: string,
  persona: Persona | null,
  apiKey: string,
): Promise<ImageGenResult> {
  if (!prompt.trim()) throw new Error("Prompt is required.");
  const fullPrompt = persona
    ? `${buildShortPersonaContext(persona)}\n${prompt.trim()}`
    : prompt.trim();
  const body = {
    contents: [{ parts: [{ text: fullPrompt }] }],
  };
  return extractImage(await callGemini(IMAGE_MODEL, body, apiKey));
}
