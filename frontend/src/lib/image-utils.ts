/**
 * Browser image utilities — read files as base64, compress to JPEG to fit
 * Firestore's 1MB-per-document limit.
 */

export interface CompressedImage {
  base64: string; // raw base64, no "data:..." prefix
  mimeType: string; // always "image/jpeg" after compression
  width: number;
  height: number;
}

/** Read a File / Blob as a raw base64 string (no data URI prefix). */
export async function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Detect mime by reading the first few bytes / filename. */
export function detectMimeType(file: File): string {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (file.type && file.type.startsWith("image/")) return file.type;
  return "image/jpeg";
}

/** Convert a Blob (e.g. fetched from a base64 data URL) back into a File. */
export function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type });
}

/**
 * Resize + JPEG-encode the image so it fits in a Firestore document.
 *
 * Strategy:
 *   1. Decode original via Image element.
 *   2. If long edge > maxDim, scale proportionally.
 *   3. Draw to canvas, encode JPEG at quality 0.8.
 *
 * Returns base64 + dimensions. Typical 4032x3024 phone photo → 200-400 KB.
 */
export async function compressToJpeg(
  file: File | Blob,
  maxDim = 1280,
  quality = 0.82,
): Promise<CompressedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = longEdge > maxDim ? maxDim / longEdge : 1;
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(img, 0, 0, w, h);

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const base64 = dataUrl.split(",")[1];
    return { base64, mimeType: "image/jpeg", width: w, height: h };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Convert "data:image/png;base64,..." → just the base64 portion. */
export function stripDataUrl(dataUrl: string): string {
  return dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
}

/** Build a data URL from a base64 + mime, e.g. for <img src=...>. */
export function toDataUrl(base64: string, mime: string): string {
  return `data:${mime};base64,${base64}`;
}

/** Convert a base64 string to a Blob, e.g. to download or pass to Gemini. */
export function base64ToBlob(base64: string, mime = "image/png"): Blob {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
