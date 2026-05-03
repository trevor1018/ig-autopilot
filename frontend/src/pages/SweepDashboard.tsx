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

const SWEEP_STATUS_LABELS: Record<string, string> = {
  completed: "已完成",
  failed: "失敗",
  running: "執行中",
};

const TRIGGER_LABELS: Record<string, string> = {
  scheduled: "排程",
  manual: "手動",
};

function modeBadge(mode: "dry_run" | "read_only" | "live") {
  switch (mode) {
    case "dry_run":
      return {
        label: "🧪 DRY-RUN 模式",
        sub: "用合成假資料，不碰 IG，零風險",
        className: "bg-slate-100 text-slate-700",
      };
    case "read_only":
      return {
        label: "👁️ READ-ONLY 模式",
        sub: "真登入 + 抓真貼文，但不執行 like / comment",
        className: "bg-amber-100 text-amber-700",
      };
    case "live":
      return {
        label: "🔴 LIVE 模式",
        sub: "真互動中 — 注意配額與 IG 風控警示",
        className: "bg-red-100 text-red-700",
      };
  }
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
        <h2 className="text-lg font-semibold">掃視儀表板</h2>
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
          {busy ? "掃視中..." : "▶ 立刻執行掃視"}
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
          <div className="flex justify-between items-start mb-2 flex-wrap gap-2">
            <h3 className="font-semibold">今日配額</h3>
            <div
              className={`text-xs px-2 py-1 rounded font-medium ${modeBadge(quota.mode).className}`}
            >
              {modeBadge(quota.mode).label}
              <span className="block text-[10px] font-normal opacity-80 mt-0.5">
                {modeBadge(quota.mode).sub}
              </span>
            </div>
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
            還剩 {quota.remaining} 個動作 · 重置時間：
            {Math.floor(quota.seconds_until_reset / 3600)} 小時{" "}
            {Math.floor((quota.seconds_until_reset % 3600) / 60)} 分後
          </div>
        </div>
      )}

      {/* Recent sweeps */}
      <div>
        <h3 className="font-semibold mb-2">最近的掃視</h3>
        {sweeps.length === 0 ? (
          <div className="bg-white p-6 rounded-lg border border-dashed border-slate-300 text-center text-slate-400">
            還沒有掃視紀錄。按「立刻執行掃視」測試看看。
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">開始時間</th>
                  <th className="text-left px-3 py-2">觸發</th>
                  <th className="text-left px-3 py-2">狀態</th>
                  <th className="text-right px-3 py-2">對象數</th>
                  <th className="text-right px-3 py-2">新貼文</th>
                  <th className="text-right px-3 py-2">已規劃</th>
                  <th className="text-right px-3 py-2">略過</th>
                  <th className="text-right px-3 py-2">失敗</th>
                </tr>
              </thead>
              <tbody>
                {sweeps.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {new Date(s.started_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      {TRIGGER_LABELS[s.trigger] ?? s.trigger}
                    </td>
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
                        {SWEEP_STATUS_LABELS[s.status] ?? s.status}
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
          目前顯示 <code>@{selectedProfile.ig_username}</code> 的資料。排程掃視會依後端{" "}
          <code>SWEEP_HOURS</code> 設定自動執行。
        </div>
      )}
    </div>
  );
}

export default SweepDashboard;
