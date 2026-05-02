const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? "http://localhost:8000";

export interface ExamplePost {
  photo_description: string;
  caption_zh: string;
  caption_ja: string;
  caption_en: string;
}

export interface Persona {
  id: number;
  name: string;
  character_name: string;
  pov: string;
  tones: string[];
  languages: string[];
  required_hashtags: string[];
  hashtag_count: number;
  style_notes: string;
  example_posts: ExamplePost[];
  created_at: string;
  updated_at: string;
}

export interface AccountProfile {
  id: number;
  ig_username: string;
  display_name: string;
  description: string;
  persona_id: number | null;
  persona: Persona | null;
  created_at: string;
  updated_at: string;
}

export interface CaptionResponse {
  captions: { zh: string; ja: string; en: string };
  hashtags: string[];
  photo_summary: string;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  input_tokens: number;
  output_tokens: number;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listPersonas: () => fetch(`${API_BASE}/personas`).then(handle<Persona[]>),
  getPersona: (id: number) => fetch(`${API_BASE}/personas/${id}`).then(handle<Persona>),
  createPersona: (body: Omit<Persona, "id" | "created_at" | "updated_at">) =>
    fetch(`${API_BASE}/personas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle<Persona>),
  updatePersona: (id: number, body: Partial<Persona>) =>
    fetch(`${API_BASE}/personas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle<Persona>),
  deletePersona: (id: number) =>
    fetch(`${API_BASE}/personas/${id}`, { method: "DELETE" }).then(handle<void>),

  listProfiles: () => fetch(`${API_BASE}/profiles`).then(handle<AccountProfile[]>),
  createProfile: (body: {
    ig_username: string;
    display_name?: string;
    description?: string;
    persona_id?: number | null;
  }) =>
    fetch(`${API_BASE}/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle<AccountProfile>),
  updateProfile: (id: number, body: Partial<AccountProfile>) =>
    fetch(`${API_BASE}/profiles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle<AccountProfile>),
  deleteProfile: (id: number) =>
    fetch(`${API_BASE}/profiles/${id}`, { method: "DELETE" }).then(handle<void>),

  generateCaption: async (
    personaId: number,
    photo: File,
    userHint: string,
  ): Promise<CaptionResponse> => {
    const fd = new FormData();
    fd.append("persona_id", String(personaId));
    fd.append("user_hint", userHint);
    fd.append("photo", photo);
    const res = await fetch(`${API_BASE}/caption/generate`, { method: "POST", body: fd });
    return handle<CaptionResponse>(res);
  },
};
