/**
 * Pollinations.ai — completely free public image generation API.
 * No API key required (works direct from browser, has CORS enabled).
 *
 * Endpoint:
 *   GET https://image.pollinations.ai/prompt/{encoded prompt}
 *       ?width=1024&height=1024&model=flux&seed=N&nologo=true&private=true
 *
 * Returns: a single PNG/JPEG in the response body (binary).
 *
 * Caveats:
 *   - Text-to-image only. There is NO instruction-based editing endpoint.
 *     Edit-mode in our app uses Gemini Vision to first describe the source
 *     photo, then sends "{description}. {edit instruction}" here for fresh
 *     generation. Result is INSPIRED BY the original, not a localized edit.
 *   - Community service — occasionally rate-limited or slow. Retry usually
 *     fixes transient failures.
 */

const BASE = "https://image.pollinations.ai/prompt";

export interface PollinationsResult {
  base64: string;
  mime: string;
}

export interface PollinationsOptions {
  width?: number;
  height?: number;
  /** "flux" (default, best quality) | "turbo" (faster, lower quality) | "flux-realism" | "flux-anime" */
  model?: string;
  /** Random seed — different seed = different image for same prompt */
  seed?: number;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      resolve(r.includes(",") ? r.split(",")[1] : r);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function generateImagePollinations(
  prompt: string,
  options: PollinationsOptions = {},
): Promise<PollinationsResult> {
  if (!prompt.trim()) throw new Error("Prompt is required.");

  const {
    width = 1024,
    height = 1024,
    model = "flux",
    seed = Math.floor(Math.random() * 1_000_000),
  } = options;

  // Pollinations encodes the prompt in the URL PATH, not query string. URL
  // length cap is ~2KB on most servers, so trim very long prompts.
  const safePrompt = prompt.slice(0, 1500);

  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    model,
    seed: String(seed),
    nologo: "true",
    private: "true", // skip public feed listing
  });

  const url = `${BASE}/${encodeURIComponent(safePrompt)}?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pollinations ${res.status}: ${text.slice(0, 300)}`);
  }
  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error(`Pollinations returned non-image content (${blob.type})`);
  }
  const base64 = await blobToBase64(blob);
  return { base64, mime: blob.type };
}
