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
    if (!confirm("Delete this persona?")) return;
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
        <h2 className="text-lg font-semibold">Personas</h2>
        <span className="text-xs text-slate-400">
          Phase 1: read-only via UI. Edit through API or seed script.
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
                  {p.character_name} · {p.tones.join(", ")} · {p.languages.join("/")} · #
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
                  <div className="font-semibold text-slate-700 mb-1">Style notes</div>
                  <pre className="whitespace-pre-wrap text-xs bg-slate-50 p-3 rounded">
                    {p.style_notes || "(none)"}
                  </pre>
                </div>
                <div>
                  <div className="font-semibold text-slate-700 mb-1">
                    Example posts ({p.example_posts.length})
                  </div>
                  {p.example_posts.length === 0 && (
                    <div className="text-xs text-slate-400">(none)</div>
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
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="text-sm text-slate-400">
            No personas yet. Run <code className="bg-slate-100 px-1 rounded">python seed.py</code>{" "}
            in the backend to insert the 暖暖豬 demo.
          </div>
        )}
      </div>
    </div>
  );
}

export default Personas;
