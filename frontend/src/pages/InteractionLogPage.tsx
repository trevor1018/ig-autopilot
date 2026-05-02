import { useEffect, useState } from "react";
import { AccountProfile, InteractionLog, api } from "../api/client";

const STATUS_COLORS: Record<string, string> = {
  executed: "bg-green-100 text-green-700",
  planned: "bg-blue-100 text-blue-700",
  skipped: "bg-slate-100 text-slate-500",
  failed: "bg-red-100 text-red-700",
};

const ACTION_LABELS: Record<string, string> = {
  like: "❤️ Like",
  comment: "💬 Comment",
  follow: "➕ Follow",
  view_story: "👀 Story",
  skip: "⏭️ Skip",
};

function InteractionLogPage() {
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [profileId, setProfileId] = useState<number | "">("");
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [logs, setLogs] = useState<InteractionLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api.listProfiles().then((p) => {
      setProfiles(p);
      if (p.length > 0 && profileId === "") setProfileId(p[0].id);
    });
  }, []);

  useEffect(() => {
    api
      .listInteractions({
        profile_id: profileId === "" ? undefined : (profileId as number),
        action_type: actionFilter || undefined,
        status: statusFilter || undefined,
        limit: 200,
      })
      .then(setLogs)
      .catch((e) => setError(String(e)));
  }, [profileId, actionFilter, statusFilter, refreshKey]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold">Interaction log</h2>
        <select
          value={profileId}
          onChange={(e) => setProfileId(e.target.value === "" ? "" : Number(e.target.value))}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value="">all profiles</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              @{p.ig_username}
            </option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value="">all actions</option>
          <option value="like">like</option>
          <option value="comment">comment</option>
          <option value="skip">skip</option>
          <option value="follow">follow</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value="">all statuses</option>
          <option value="executed">executed</option>
          <option value="planned">planned</option>
          <option value="skipped">skipped</option>
          <option value="failed">failed</option>
        </select>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="ml-auto text-xs text-brand-600 hover:underline"
        >
          ⟳ Refresh
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded mb-3">
          {error}
        </div>
      )}

      {logs.length === 0 ? (
        <div className="bg-white p-6 rounded-lg border border-dashed border-slate-300 text-center text-slate-400">
          No interactions yet. Trigger a sweep on the Sweep page.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left px-3 py-2">When</th>
                <th className="text-left px-3 py-2">Target</th>
                <th className="text-left px-3 py-2">Action</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(l.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    {l.target_username ? `@${l.target_username}` : "—"}
                    {l.target_post_url && (
                      <a
                        href={l.target_post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 text-xs text-brand-600 hover:underline"
                      >
                        post↗
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {ACTION_LABELS[l.action_type] ?? l.action_type}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        STATUS_COLORS[l.status] ?? "bg-slate-100"
                      }`}
                    >
                      {l.status}
                    </span>
                    {l.dry_run && (
                      <span className="ml-1 text-[10px] text-slate-400">DRY</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600 max-w-md break-words">
                    {l.action_type === "comment" && l.comment_text}
                    {l.skip_reason && <span className="text-slate-400">{l.skip_reason}</span>}
                    {l.error_message && (
                      <span className="text-red-600">{l.error_message}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default InteractionLogPage;
