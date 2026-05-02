import { useEffect, useMemo, useState } from "react";
import { AccountProfile, TargetAccount, api } from "../api/client";

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
    if (!confirm(`Remove @${t.ig_username} from targets?`)) return;
    try {
      await api.deleteTarget(t.id);
      setTargets((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Target accounts</h2>
          <select
            value={profileId}
            onChange={(e) => setProfileId(e.target.value === "" ? "" : Number(e.target.value))}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            <option value="">— pick profile —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                @{p.ig_username}
              </option>
            ))}
          </select>
        </div>

        {selectedProfile && (
          <div className="text-xs text-slate-500 mb-3">
            Showing targets for <code>@{selectedProfile.ig_username}</code> ·{" "}
            {targets.length} total · {targets.filter((t) => t.is_active).length} active
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded mb-2">
            {error}
          </div>
        )}

        {targets.length === 0 && profileId !== "" && (
          <div className="text-sm text-slate-400 bg-white p-4 rounded border border-dashed border-slate-300">
            No targets yet. Add one →
          </div>
        )}

        {targets.map((t) => (
          <div
            key={t.id}
            className={`bg-white border rounded-lg p-4 ${
              t.is_active ? "border-slate-200" : "border-slate-200 opacity-50"
            }`}
          >
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold">@{t.ig_username}</div>
                {t.display_name && <div className="text-sm text-slate-600">{t.display_name}</div>}
                {t.genre_tags && (
                  <div className="text-xs text-slate-500 mt-1">
                    {t.genre_tags
                      .split(",")
                      .map((g) => g.trim())
                      .filter(Boolean)
                      .map((g) => (
                        <span key={g} className="bg-slate-100 px-2 py-0.5 rounded mr-1">
                          {g}
                        </span>
                      ))}
                  </div>
                )}
                {t.notes && <div className="text-xs text-slate-500 mt-1">{t.notes}</div>}
                <div className="text-xs text-slate-400 mt-2">
                  Max {t.max_actions_per_sweep} action(s)/sweep ·{" "}
                  {t.like_ratio_override !== null
                    ? `like ratio override: ${t.like_ratio_override}`
                    : "default like ratio"}{" "}
                  · last swept:{" "}
                  {t.last_swept_at ? new Date(t.last_swept_at).toLocaleString() : "never"}
                </div>
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <button
                  onClick={() => toggleActive(t)}
                  className={`px-2 py-1 rounded ${
                    t.is_active
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {t.is_active ? "Active" : "Paused"}
                </button>
                <button
                  onClick={() => onDelete(t)}
                  className="text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={onCreate}
        className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 h-fit"
      >
        <h3 className="font-semibold">Add target</h3>
        <div>
          <label className="block text-xs font-medium mb-1">IG username *</label>
          <input
            value={igUsername}
            onChange={(e) => setIgUsername(e.target.value)}
            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
            placeholder="pikachu_official"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">
            Genre tags <span className="text-slate-400">(comma-separated)</span>
          </label>
          <input
            value={genreTags}
            onChange={(e) => setGenreTags(e.target.value)}
            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
            placeholder="pokemon, plush, kawaii"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">
            Max actions per sweep
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
          {busy ? "Saving..." : "Add target"}
        </button>
      </form>
    </div>
  );
}

export default Targets;
