import { useEffect, useState } from "react";
import { AccountProfile, Persona, api } from "../api/client";

function Profiles() {
  const [rows, setRows] = useState<AccountProfile[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [igUsername, setIgUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [personaId, setPersonaId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  function refresh() {
    Promise.all([api.listProfiles(), api.listPersonas()])
      .then(([p, pp]) => {
        setRows(p);
        setPersonas(pp);
      })
      .catch((e) => setError(String(e)));
  }

  useEffect(refresh, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!igUsername.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createProfile({
        ig_username: igUsername.trim(),
        display_name: displayName.trim(),
        description: description.trim(),
        persona_id: personaId === "" ? null : Number(personaId),
      });
      setIgUsername("");
      setDisplayName("");
      setDescription("");
      setPersonaId("");
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: number) {
    if (!confirm("確定要刪除這個操作帳號嗎?")) return;
    try {
      await api.deleteProfile(id);
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-3">
        <h2 className="text-lg font-semibold mb-2">操作帳號 (Profiles)</h2>
        {rows.map((p) => (
          <div key={p.id} className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">@{p.ig_username}</div>
                {p.display_name && <div className="text-sm text-slate-600">{p.display_name}</div>}
                {p.description && (
                  <div className="text-xs text-slate-500 mt-1">{p.description}</div>
                )}
                <div className="text-xs text-slate-400 mt-2">
                  角色：{p.persona ? p.persona.name : "—"}
                </div>
              </div>
              <button
                onClick={() => onDelete(p.id)}
                className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 flex items-center gap-1 shrink-0"
              >
                🗑️ 刪除
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="text-sm text-slate-400">還沒有操作帳號。從右邊加一個 →</div>
        )}
      </div>

      <form
        onSubmit={onCreate}
        className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 h-fit"
      >
        <h3 className="font-semibold">新增操作帳號</h3>
        <div>
          <label className="block text-xs font-medium mb-1">IG 帳號 *</label>
          <input
            value={igUsername}
            onChange={(e) => setIgUsername(e.target.value)}
            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
            placeholder="nuannuanzhu_official"
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
          <label className="block text-xs font-medium mb-1">說明</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">角色 (Persona)</label>
          <select
            value={personaId}
            onChange={(e) =>
              setPersonaId(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          >
            <option value="">— 無 —</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={busy || !igUsername.trim()}
          className="w-full bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white text-sm font-medium py-2 rounded"
        >
          {busy ? "儲存中..." : "新增"}
        </button>
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 p-2 rounded">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}

export default Profiles;
