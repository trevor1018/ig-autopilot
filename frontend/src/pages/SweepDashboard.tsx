import { useEffect, useMemo, useState } from "react";
import { AccountProfile, QuotaStatus, SweepRun, api } from "../api/client";

function pct(used: number, cap: number) {
  if (cap === 0) return 0;
  return Math.min(100, Math.round((used / cap) * 100));
}

function gaugeColor(used: number, cap: number) {
  const p = pct(used, cap);
  if (p >= 90) return "bg-red-500";
  if (p >= 70) return "bg-amber-500";
  return "bg-green-500";
}

function SweepDashboard() {
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [profileId, setProfileId] = useState<number | "">("");
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [sweeps, setSweeps] = useState<SweepRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api.listProfiles().then((p) => {
      setProfiles(p);
      if (p.length > 0 && profileId === "") setProfileId(p[0].id);
    });
  }, []);

  useEffect(() => {
    if (profileId === "") return;
    Promise.all([api.getQuota(profileId as number), api.listSweeps(profileId as number)])
      .then(([q, s]) => {
        setQuota(q);
        setSweeps(s);
      })
      .catch((e) => setError(String(e)));
  }, [profileId, refreshKey]);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === profileId) ?? null,
    [profiles, profileId],
  );

  async function onTrigger() {
    if (profileId === "") return;
    setBusy(true);
    setError(null);
    try {
      await api.triggerSweep(profileId as number);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Sweep dashboard</h2>
        <select
          value={profileId}
          onChange={(e) => setProfileId(e.target.value === "" ? "" : Number(e.target.value))}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              @{p.ig_username}
            </option>
          ))}
        </select>
        <button
          onClick={onTrigger}
          disabled={busy || profileId === ""}
          className="bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white text-sm font-medium px-4 py-1.5 rounded ml-auto"
        >
          {busy ? "Sweeping..." : "▶ Trigger sweep now"}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded">
          {error}
        </div>
      )}

      {/* Quota gauge */}
      {quota && (
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex justify-between items-baseline mb-2">
            <h3 className="font-semibold">Today's quota</h3>
            <span className="text-xs text-slate-400">
              {quota.dry_run ? "🧪 DRY-RUN mode (no real IG actions)" : "🔴 LIVE mode"}
            </span>
          </div>
          <div className="text-3xl font-bold mb-2">
            {quota.used_today}{" "}
            <span className="text-base font-normal text-slate-400">/ {quota.cap}</span>
          </div>
          <div className="h-3 bg-slate-100 rounded overflow-hidden mb-2">
            <div
              className={`h-full transition-all ${gaugeColor(quota.used_today, quota.cap)}`}
              style={{ width: `${pct(quota.used_today, quota.cap)}%` }}
            />
          </div>
          <div className="text-xs text-slate-500">
            {quota.remaining} actions remaining · resets in{" "}
            {Math.floor(quota.seconds_until_reset / 3600)}h{" "}
            {Math.floor((quota.seconds_until_reset % 3600) / 60)}m
          </div>
        </div>
      )}

      {/* Recent sweeps */}
      <div>
        <h3 className="font-semibold mb-2">Recent sweeps</h3>
        {sweeps.length === 0 ? (
          <div className="bg-white p-6 rounded-lg border border-dashed border-slate-300 text-center text-slate-400">
            No sweeps yet. Hit "Trigger sweep now" to test.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">Started</th>
                  <th className="text-left px-3 py-2">Trigger</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Targets</th>
                  <th className="text-right px-3 py-2">New posts</th>
                  <th className="text-right px-3 py-2">Planned</th>
                  <th className="text-right px-3 py-2">Skipped</th>
                  <th className="text-right px-3 py-2">Failed</th>
                </tr>
              </thead>
              <tbody>
                {sweeps.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {new Date(s.started_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{s.trigger}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          s.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : s.status === "failed"
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{s.targets_scanned}</td>
                    <td className="px-3 py-2 text-right">{s.new_posts_found}</td>
                    <td className="px-3 py-2 text-right font-medium">{s.actions_planned}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{s.actions_skipped}</td>
                    <td className="px-3 py-2 text-right text-red-600">{s.actions_failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedProfile && (
        <div className="text-xs text-slate-400 bg-slate-100 p-3 rounded">
          Showing data for <code>@{selectedProfile.ig_username}</code>. Scheduled
          sweeps run automatically per server-side <code>SWEEP_HOURS</code>.
        </div>
      )}
    </div>
  );
}

export default SweepDashboard;
