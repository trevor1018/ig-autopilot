import { useEffect, useState } from "react";
import { Persona, api } from "../api/client";

function Personas() {
  const [rows, setRows] = useState<Persona[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  function refresh() {
    api.listPersonas().then(setRows).catch((e) => setError(String(e)));
  }

  useEffect(refresh, []);

  async function onDelete(id: number) {
    if (!confirm("確定要刪除這個角色嗎?")) return;
    try {
      await api.deletePersona(id);
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">角色 (Personas)</h2>
        <span className="text-xs text-slate-400">
          Phase 1：UI 上目前唯讀。要編輯請改用 API 或 seed.py。
        </span>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {rows.map((p) => (
          <div key={p.id} className="bg-white border border-slate-200 rounded-lg">
            <button
              onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              className="w-full flex justify-between items-center p-4 text-left hover:bg-slate-50"
            >
              <div>
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-slate-500">
                  {p.character_name} · {p.tones.join("、")} · {p.languages.join("/")} · #
                  {p.required_hashtags.join(" #")}
                </div>
              </div>
              <span className="text-slate-400 text-sm">
                {expanded === p.id ? "▼" : "▶"}
              </span>
            </button>
            {expanded === p.id && (
              <div className="border-t border-slate-200 p-4 space-y-3 text-sm">
                <div>
                  <div className="font-semibold text-slate-700 mb-1">風格備註</div>
                  <pre className="whitespace-pre-wrap text-xs bg-slate-50 p-3 rounded">
                    {p.style_notes || "(無)"}
                  </pre>
                </div>
                <div>
                  <div className="font-semibold text-slate-700 mb-1">
                    範例貼文 ({p.example_posts.length})
                  </div>
                  {p.example_posts.length === 0 && (
                    <div className="text-xs text-slate-400">(無)</div>
                  )}
                  {p.example_posts.map((ex, i) => (
                    <div key={i} className="bg-slate-50 p-3 rounded mb-2 text-xs space-y-1">
                      {ex.photo_description && <div>📷 {ex.photo_description}</div>}
                      {ex.caption_zh && <div>ZH: {ex.caption_zh}</div>}
                      {ex.caption_ja && <div>JA: {ex.caption_ja}</div>}
                      {ex.caption_en && <div>EN: {ex.caption_en}</div>}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => onDelete(p.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  刪除
                </button>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="text-sm text-slate-400">
            還沒有角色。在 backend 跑{" "}
            <code className="bg-slate-100 px-1 rounded">python seed.py</code>{" "}
            建立暖暖豬 demo 角色。
          </div>
        )}
      </div>
    </div>
  );
}

export default Personas;
