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

// ===== Phase 2: targets / interactions / sweeps =====

export interface TargetAccount {
  id: number;
  profile_id: number;
  ig_username: string;
  display_name: string;
  genre_tags: string;
  notes: string;
  is_active: boolean;
  like_ratio_override: number | null;
  max_actions_per_sweep: number;
  last_seen_post_id: string;
  last_swept_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TargetCreatePayload {
  profile_id: number;
  ig_username: string;
  display_name?: string;
  genre_tags?: string;
  notes?: string;
  is_active?: boolean;
  like_ratio_override?: number | null;
  max_actions_per_sweep?: number;
}

export interface InteractionLog {
  id: number;
  profile_id: number;
  target_id: number | null;
  sweep_run_id: number | null;
  action_type: string;
  target_username: string;
  target_post_id: string;
  target_post_url: string;
  comment_text: string;
  status: string;
  dry_run: boolean;
  error_message: string;
  skip_reason: string;
  created_at: string;
}

export interface SweepRun {
  id: number;
  profile_id: number;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  targets_scanned: number;
  new_posts_found: number;
  actions_planned: number;
  actions_executed: number;
  actions_skipped: number;
  actions_failed: number;
  error_message: string;
}

export interface QuotaStatus {
  profile_id: number;
  used_today: number;
  cap: number;
  remaining: number;
  seconds_until_reset: number;
  dry_run: boolean;
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

  // Targets
  listTargets: (profileId?: number) => {
    const url = profileId != null ? `${API_BASE}/targets?profile_id=${profileId}` : `${API_BASE}/targets`;
    return fetch(url).then(handle<TargetAccount[]>);
  },
  createTarget: (body: TargetCreatePayload) =>
    fetch(`${API_BASE}/targets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle<TargetAccount>),
  updateTarget: (id: number, body: Partial<TargetCreatePayload>) =>
    fetch(`${API_BASE}/targets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle<TargetAccount>),
  deleteTarget: (id: number) =>
    fetch(`${API_BASE}/targets/${id}`, { method: "DELETE" }).then(handle<void>),

  // Interactions
  listInteractions: (params: {
    profile_id?: number;
    target_id?: number;
    sweep_run_id?: number;
    action_type?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    });
    return fetch(`${API_BASE}/interactions?${q.toString()}`).then(handle<InteractionLog[]>);
  },
  getQuota: (profileId: number) =>
    fetch(`${API_BASE}/interactions/quota/${profileId}`).then(handle<QuotaStatus>),

  // Sweeps
  listSweeps: (profileId?: number) => {
    const url = profileId != null ? `${API_BASE}/sweeps?profile_id=${profileId}` : `${API_BASE}/sweeps`;
    return fetch(url).then(handle<SweepRun[]>);
  },
  triggerSweep: (profileId: number) =>
    fetch(`${API_BASE}/sweeps/run/${profileId}`, { method: "POST" }).then(handle<SweepRun>),

  // Analytics
  getActivity: (profileId: number, days = 7) =>
    fetch(`${API_BASE}/analytics/activity/${profileId}?days=${days}`).then(
      handle<ActivitySummary>,
    ),
  getContent: (profileId: number) =>
    fetch(`${API_BASE}/analytics/content/${profileId}`).then(handle<ContentSummary>),
};

export interface ActivitySummary {
  profile_id: number;
  window_days: number;
  total_actions: number;
  by_action_type: Record<string, number>;
  by_status: Record<string, number>;
  by_skip_reason: Record<string, number>;
  top_targets: [string, number][];
  daily_series: { day: string; count: number }[];
}

export interface ContentSummary {
  profile_id: number;
  status: "ready" | "no_data";
  message?: string;
  by_scene: Record<string, number>;
  by_media_type: Record<string, number>;
  engagement_buckets: Record<string, number>;
  total_posts_analyzed?: number;
}
