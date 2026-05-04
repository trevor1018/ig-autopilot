/**
 * Firestore CRUD — all data lives under users/{uid}/...
 *
 * Collections:
 *   users/{uid}/personas/{personaId}      — character configs
 *   users/{uid}/captions/{captionId}      — caption history
 *   users/{uid}/images/{imageId}          — image edit/gen history
 *   users/{uid}/private/settings          — single doc with the user's Gemini key
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

// ===== Persona =====

export interface ExamplePost {
  photo_description: string;
  caption_zh: string;
  caption_ja: string;
  caption_en: string;
}

export interface Persona {
  id: string;
  name: string;
  character_name: string;
  pov: string;
  tones: string[];
  languages: string[];
  required_hashtags: string[];
  hashtag_count: number;
  style_notes: string;
  example_posts: ExamplePost[];
  created_at: number;
}

const NUAN_NUAN_ZHU_DEFAULT: Omit<Persona, "id" | "created_at"> = {
  name: "暖暖豬",
  character_name: "暖暖豬",
  pov: "first_person",
  tones: ["無俚頭", "詼諧", "溫馨", "自然"],
  languages: ["zh", "ja", "en"],
  required_hashtags: ["暖暖豬"],
  hashtag_count: 5,
  style_notes:
    "暖暖豬是一隻擬人化的小豬玩偶,以第一人稱記錄自己的生活(食衣住行育樂)。\n" +
    "風格要點:\n" +
    "  - 短句為主、語感輕快,偶爾自言自語或耍冷。\n" +
    "  - 帶點呆萌和溫度,不刻意賣萌、不裝可愛。\n" +
    "  - 內容圍繞玩偶的視角:今天去哪、看到什麼、心情如何。\n" +
    "  - 三種語言互相對應(不是直譯,而是各自最自然的口吻)。\n" +
    "  - 中文使用繁體;日文用親切的口語;英文用 casual、不要太正經。",
  example_posts: [
    {
      photo_description: "暖暖豬坐在咖啡廳的吧檯前,面前一杯拿鐵",
      caption_zh: "據說人類管這個叫拿鐵。我管它叫:今天的逃跑藉口。",
      caption_ja: "人間はこれを「ラテ」と呼ぶらしい。僕的には“今日のサボり口実”。",
      caption_en: "Humans call this a latte. I call it: today's official excuse to do nothing.",
    },
    {
      photo_description: "暖暖豬在公園草地上,旁邊有顆球",
      caption_zh: "球說它要去外野。我說我先躺一下。",
      caption_ja: "ボールが「外野行く」って。僕は先にちょっと寝とくね。",
      caption_en: "Ball said it's heading to the outfield. I said I'm taking a nap first.",
    },
  ],
};

export async function listPersonas(uid: string): Promise<Persona[]> {
  const col = collection(db, "users", uid, "personas");
  const snap = await getDocs(query(col, orderBy("created_at", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Persona, "id">) }));
}

export async function ensureDefaultPersona(uid: string): Promise<Persona[]> {
  const personas = await listPersonas(uid);
  if (personas.length > 0) return personas;
  // First login — seed the 暖暖豬 default so the user has something to work with.
  const col = collection(db, "users", uid, "personas");
  const ref = await addDoc(col, { ...NUAN_NUAN_ZHU_DEFAULT, created_at: Date.now() });
  return [{ id: ref.id, ...NUAN_NUAN_ZHU_DEFAULT, created_at: Date.now() }];
}

export async function deletePersona(uid: string, personaId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "personas", personaId));
}

export async function savePersona(
  uid: string,
  data: Omit<Persona, "id" | "created_at">,
): Promise<Persona> {
  const col = collection(db, "users", uid, "personas");
  const created_at = Date.now();
  const ref = await addDoc(col, { ...data, created_at });
  return { id: ref.id, ...data, created_at };
}

// ===== Caption history =====

export interface CaptionHistory {
  id: string;
  persona_id: string;
  persona_name: string;
  user_hint: string;
  photo_count: number;
  photo_thumbnail: string; // base64 of the first photo, scaled down
  captions: { zh: string; ja: string; en: string };
  hashtags: string[];
  photo_summary: string;
  created_at: number; // ms timestamp
}

export async function saveCaptionHistory(
  uid: string,
  data: Omit<CaptionHistory, "id">,
): Promise<string> {
  const col = collection(db, "users", uid, "captions");
  const ref = await addDoc(col, data);
  return ref.id;
}

export async function listCaptionHistory(uid: string): Promise<CaptionHistory[]> {
  const col = collection(db, "users", uid, "captions");
  const snap = await getDocs(query(col, orderBy("created_at", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CaptionHistory, "id">) }));
}

export async function deleteCaptionHistory(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "captions", id));
}

// ===== Image history =====

export interface ImageHistory {
  id: string;
  mode: "edit" | "generate";
  prompt: string; // edit instruction OR generation prompt
  persona_id: string | null;
  persona_name: string;
  source_thumbnail: string | null; // base64, only for edit mode
  result_image: string; // base64 (compressed)
  result_mime: string;
  narrative: string;
  created_at: number;
}

export async function saveImageHistory(
  uid: string,
  data: Omit<ImageHistory, "id">,
): Promise<string> {
  const col = collection(db, "users", uid, "images");
  const ref = await addDoc(col, data);
  return ref.id;
}

export async function listImageHistory(uid: string): Promise<ImageHistory[]> {
  const col = collection(db, "users", uid, "images");
  const snap = await getDocs(query(col, orderBy("created_at", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ImageHistory, "id">) }));
}

export async function deleteImageHistory(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "images", id));
}

/** Count images currently in history for the current month.
 *  Used only as a one-time backfill when the persistent counter is empty. */
async function countImagesInHistoryThisMonth(uid: string): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const col = collection(db, "users", uid, "images");
  const q = query(col, where("created_at", ">=", startOfMonth));
  const snap = await getDocs(q);
  return snap.size;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Atomically increment the monthly image API usage counter.
 *  Called after every successful image generation/edit. The counter is
 *  intentionally separate from the images history collection so that
 *  deleting history rows DOES NOT reduce the usage count — the count
 *  reflects "API calls made", which is what GCP actually charges for. */
export async function incrementMonthlyImageUsage(uid: string): Promise<void> {
  const ref = doc(db, "users", uid, "usage", currentMonthKey());
  await setDoc(
    ref,
    { count: increment(1), last_updated: Date.now() },
    { merge: true },
  );
}

/** Read the monthly image API usage counter.
 *  On first read of a month, if the counter doesn't exist, backfill from
 *  the current history count (so users who upgraded in mid-month don't see 0). */
export async function getMonthlyImageUsage(uid: string): Promise<number> {
  const ref = doc(db, "users", uid, "usage", currentMonthKey());
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return (snap.data().count as number) ?? 0;
  }
  // First read this month — backfill from existing history rows once.
  const initial = await countImagesInHistoryThisMonth(uid);
  if (initial > 0) {
    await setDoc(ref, {
      count: initial,
      last_updated: Date.now(),
      backfilled: true,
    });
  }
  return initial;
}

// Kept for backward compat (was used by Image Studio); now an alias.
export async function countImagesThisMonth(uid: string): Promise<number> {
  return getMonthlyImageUsage(uid);
}

// ===== Settings (Gemini API key) =====

export async function getApiKey(uid: string): Promise<string> {
  const ref = doc(db, "users", uid, "private", "settings");
  const snap = await getDoc(ref);
  if (!snap.exists()) return "";
  return (snap.data().gemini_api_key as string) ?? "";
}

export async function saveApiKey(uid: string, apiKey: string): Promise<void> {
  const ref = doc(db, "users", uid, "private", "settings");
  await setDoc(ref, { gemini_api_key: apiKey, updated_at: Date.now() }, { merge: true });
}

// silence unused-import linter for setDoc/updateDoc when only one is used
void updateDoc;
