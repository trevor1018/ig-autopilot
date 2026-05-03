import { useEffect, useMemo, useState } from "react";
import { AccountProfile, TargetAccount, api } from "../api/client";

interface EditFormState {
  ig_username: string;
  display_name: string;
  genre_tags: string;
  notes: string;
  max_actions_per_sweep: number;
  like_ratio_override: string; // string so empty = "use global default"
}

const EMPTY_EDIT: EditFormState = {
  ig_username: "",
  display_name: "",
  genre_tags: "",
  notes: "",
  max_actions_per_sweep: 1,
  like_ratio_override: "",
};

function targetToEditForm(t: TargetAccount): EditFormState {
  return {
    ig_username: t.ig_username,
    display_name: t.display_name,
    genre_tags: t.genre_tags,
    notes: t.notes,
    max_actions_per_sweep: t.max_actions_per_sweep,
    like_ratio_override:
      t.like_ratio_override !== null ? String(t.like_ratio_override) : "",
  };
}

function Targets() {
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [profileId, setProfileId] = useState<number | "">("");
  const [targets, setTargets] = useState<TargetAccount[]>([]);
  const [error, setError] = useState<string | null>(null);

  // create form state
  const [igUsername, setIgUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [genreTags, setGenreTags] = useState("");
  const [notes, setNotes] = useState("");
  const [maxActions, setMaxActions] = useState(1);
  const [busy, setBusy] = useState(false);

  // edit state (per row)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(EMPTY_EDIT);
  const [savingEdit, setSavingEdit] = useState(false);

  function refresh() {
    api.listProfiles().then((p) => {
      setProfiles(p);
      if (p.length > 0 && profileId === "") setProfileId(p[0].id);
    });
  }

  useEffect(refresh, []);

  useEffect(() => {
    if (profileId === "") {
      setTargets([]);
      return;
    }
    api
      .listTargets(profileId as number)
      .then(setTargets)
      .catch((e) => setError(String(e)));
  }, [profileId]);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === profileId) ?? null,
    [profiles, profileId],
  );

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (profileId === "" || !igUsername.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createTarget({
        profile_id: profileId as number,
        ig_username: igUsername.trim().replace(/^@/, ""),
        display_name: displayName.trim(),
        genre_tags: genreTags.trim(),
        notes: notes.trim(),
        max_actions_per_sweep: maxActions,
      });
      setIgUsername("");
      setDisplayName("");
      setGenreTags("");
      setNotes("");
      const refreshed = await api.listTargets(profileId as number);
      setTargets(refreshed);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(t: TargetAccount) {
    try {
      const updated = await api.updateTarget(t.id, { is_active: !t.is_active });
      setTargets((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    } catch (e) {
      setError(String(e));
    }
  }

  async function onDelete(t: TargetAccount) {
    if (!confirm(`確定要把 @${t.ig_username} 從互動對象移除?`)) return;
    try {
      await api.deleteTarget(t.id);
      setTargets((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e) {
      setError(String(e));
    }
  }

  function startEdit(t: TargetAccount) {
    setEditingId(t.id);
    setEditForm(targetToEditForm(t));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_EDIT);
  }

  async function saveEdit(t: TargetAccount) {
    if (!editForm.ig_username.trim()) {
      setError("IG 帳號不能空白");
      return;
    }

    let likeOverride: number | null = null;
    const trimmedRatio = editForm.like_ratio_override.trim();
    if (trimmedRatio !== "") {
      const parsed = Number(trimmedRatio);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
        setError("like 比例覆寫必須是 0.0 - 1.0 之間的數字（或留空用預設）");
        return;
      }
      likeOverride = parsed;
    }

    setSavingEdit(true);
    setError(null);
    try {
      const updated = await api.updateTarget(t.id, {
        ig_username: editForm.ig_username.trim().replace(/^@/, ""),
        display_name: editForm.display_name.trim(),
        genre_tags: editForm.genre_tags.trim(),
        notes: editForm.notes.trim(),
        max_actions_per_sweep: editForm.max_actions_per_sweep,
        like_ratio_override: likeOverride,
      });
      setTargets((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
      cancelEdit();
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">互動對象 (Targets)</h2>
          <select
            value={profileId}
            onChange={(e) => setProfileId(e.target.value === "" ? "" : Number(e.target.value))}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            <option value="">— 選擇操作帳號 —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                @{p.ig_username}
              </option>
            ))}
          </select>
        </div>

        {selectedProfile && (
          <div className="text-xs text-slate-500 mb-3">
            顯示 <code>@{selectedProfile.ig_username}</code> 的對象 ·
            共 {targets.length} 個 · {targets.filter((t) => t.is_active).length} 個啟用中
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded mb-2">
            {error}
          </div>
        )}

        {targets.length === 0 && profileId !== "" && (
          <div className="text-sm text-slate-400 bg-white p-4 rounded border border-dashed border-slate-300">
            還沒有對象。從右邊加一個 →
          </div>
        )}

        {targets.map((t) =>
          editingId === t.id ? (
            // ===== Edit mode =====
            <div
              key={t.id}
              className="bg-white border-2 border-brand-300 rounded-lg p-4 space-y-3"
            >
              <div className="text-xs font-semibold text-brand-600 uppercase tracking-wide mb-2">
                編輯中 · ID #{t.id}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">IG 帳號 *</label>
                  <input
                    value={editForm.ig_username}
                    onChange={(e) =>
                      setEditForm({ ...editForm, ig_username: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">顯示名稱</label>
                  <input
                    value={editForm.display_name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, display_name: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  類型標籤 <span className="text-slate-400">(以逗號分隔)</span>
                </label>
                <input
                  value={editForm.genre_tags}
                  onChange={(e) =>
                    setEditForm({ ...editForm, genre_tags: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                  placeholder="pokemon, plush, kawaii"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">備註</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm({ ...editForm, notes: e.target.value })
                  }
                  rows={2}
                  className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    每次掃視最多動作數
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={editForm.max_actions_per_sweep}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        max_actions_per_sweep: Number(e.target.value),
                      })
                    }
                    className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    like 比例覆寫{" "}
                    <span className="text-slate-400">
                      (0.0–1.0；留空用預設)
                    </span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editForm.like_ratio_override}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        like_ratio_override: e.target.value,
                      })
                    }
                    placeholder="預設"
                    className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => saveEdit(t)}
                  disabled={savingEdit}
                  className="bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white text-sm font-medium px-4 py-1.5 rounded"
                >
                  {savingEdit ? "儲存中..." : "💾 儲存"}
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={savingEdit}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium px-4 py-1.5 rounded"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            // ===== Read-only mode =====
            <div
              key={t.id}
              className={`bg-white border rounded-lg p-4 ${
                t.is_active ? "border-slate-200" : "border-slate-200 opacity-50"
              }`}
            >
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">@{t.ig_username}</div>
                  {t.display_name && (
                    <div className="text-sm text-slate-600">{t.display_name}</div>
                  )}
                  {t.genre_tags && (
                    <div className="text-xs text-slate-500 mt-1">
                      {t.genre_tags
                        .split(",")
                        .map((g) => g.trim())
                        .filter(Boolean)
                        .map((g) => (
                          <span
                            key={g}
                            className="bg-slate-100 px-2 py-0.5 rounded mr-1"
                          >
                            {g}
                          </span>
                        ))}
                    </div>
                  )}
                  {t.notes && (
                    <div className="text-xs text-slate-500 mt-1">{t.notes}</div>
                  )}
                  <div className="text-xs text-slate-400 mt-2">
                    每次掃視最多 {t.max_actions_per_sweep} 次動作 ·{" "}
                    {t.like_ratio_override !== null
                      ? `like 比例覆寫：${t.like_ratio_override}`
                      : "使用預設 like 比例"}{" "}
                    · 上次掃視：
                    {t.last_swept_at
                      ? new Date(t.last_swept_at).toLocaleString()
                      : "從未"}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 text-xs shrink-0">
                  <button
                    onClick={() => toggleActive(t)}
                    className={`px-2 py-1 rounded border ${
                      t.is_active
                        ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                        : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {t.is_active ? "啟用中" : "已暫停"}
                  </button>
                  <button
                    onClick={() => startEdit(t)}
                    className="px-2 py-1 rounded bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 flex items-center gap-1 justify-center"
                  >
                    ✏️ 編輯
                  </button>
                  <button
                    onClick={() => onDelete(t)}
                    className="px-2 py-1 rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 flex items-center gap-1 justify-center"
                  >
                    🗑️ 刪除
                  </button>
                </div>
              </div>
            </div>
          ),
        )}
      </div>

      <form
        onSubmit={onCreate}
        className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 h-fit"
      >
        <h3 className="font-semibold">新增互動對象</h3>
        <div>
          <label className="block text-xs font-medium mb-1">IG 帳號 *</label>
          <input
            value={igUsername}
            onChange={(e) => setIgUsername(e.target.value)}
            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
            placeholder="pikachu_official"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">顯示名稱</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">
            類型標籤 <span className="text-slate-400">(以逗號分隔)</span>
          </label>
          <input
            value={genreTags}
            onChange={(e) => setGenreTags(e.target.value)}
            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
            placeholder="pokemon, plush, kawaii"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">備註</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">
            每次掃視最多動作數
          </label>
          <input
            type="number"
            min={1}
            max={5}
            value={maxActions}
            onChange={(e) => setMaxActions(Number(e.target.value))}
            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy || profileId === "" || !igUsername.trim()}
          className="w-full bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white text-sm font-medium py-2 rounded"
        >
          {busy ? "儲存中..." : "新增對象"}
        </button>
      </form>
    </div>
  );
}

export default Targets;
