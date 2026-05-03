import { useEffect, useState } from "react";
import {
  AccountProfile,
  ActivitySummary,
  ContentSummary,
  api,
} from "../api/client";

const SKIP_REASON_LABELS: Record<string, string> = {
  no_new_post: "沒有新貼文",
  daily_cap_reached: "已達每日上限",
  fetch_failed: "抓取失敗",
  cap_zero: "配額為 0",
};

function Sparkline({ series }: { series: { day: string; count: number }[] }) {
  if (series.length === 0) return null;
  const max = Math.max(1, ...series.map((s) => s.count));
  return (
    <div className="flex items-end gap-1 h-20">
      {series.map((s) => (
        <div key={s.day} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full bg-brand-500 rounded-sm"
            style={{
              height: `${Math.max(2, (s.count / max) * 70)}px`,
              minHeight: "2px",
            }}
            title={`${s.day}: ${s.count}`}
          />
          <div className="text-[10px] text-slate-400">{s.day.slice(5)}</div>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

function Distribution({
  data,
  labelMap,
}: {
  data: Record<string, number>;
  labelMap?: Record<string, string>;
}) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return <div className="text-xs text-slate-400">無資料</div>;
  }
  const max = Math.max(...entries.map(([, v]) => v));
  return (
    <div className="space-y-1">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 text-xs">
          <div className="w-24 truncate text-slate-600">{labelMap?.[k] ?? k}</div>
          <div className="flex-1 bg-slate-100 rounded h-3 relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-brand-400"
              style={{ width: `${(v / max) * 100}%` }}
            />
          </div>
          <div className="w-8 text-right text-slate-500">{v}</div>
        </div>
      ))}
    </div>
  );
}

function Analytics() {
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [profileId, setProfileId] = useState<number | "">("");
  const [days, setDays] = useState(7);
  const [activity, setActivity] = useState<ActivitySummary | null>(null);
  const [content, setContent] = useState<ContentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listProfiles().then((p) => {
      setProfiles(p);
      if (p.length > 0 && profileId === "") setProfileId(p[0].id);
    });
  }, []);

  useEffect(() => {
    if (profileId === "") return;
    Promise.all([
      api.getActivity(profileId as number, days),
      api.getContent(profileId as number),
    ])
      .then(([a, c]) => {
        setActivity(a);
        setContent(c);
      })
      .catch((e) => setError(String(e)));
  }, [profileId, days]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">分析</h2>
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
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value={7}>最近 7 天</option>
          <option value={14}>最近 14 天</option>
          <option value={30}>最近 30 天</option>
        </select>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded">
          {error}
        </div>
      )}

      {activity && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="總動作數" value={activity.total_actions} />
            <StatCard
              label="按讚數"
              value={activity.by_action_type.like ?? 0}
              hint={`佔比 ${(((activity.by_action_type.like ?? 0) / Math.max(1, activity.total_actions)) * 100).toFixed(0)}%`}
            />
            <StatCard
              label="留言數"
              value={activity.by_action_type.comment ?? 0}
              hint={`佔比 ${(((activity.by_action_type.comment ?? 0) / Math.max(1, activity.total_actions)) * 100).toFixed(0)}%`}
            />
            <StatCard
              label="略過數"
              value={activity.by_status.skipped ?? 0}
              hint="含上限 / 沒新文等"
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="font-semibold text-sm mb-3">
              每日量 — 最近 {activity.window_days} 天
            </h3>
            <Sparkline series={activity.daily_series} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="font-semibold text-sm mb-3">最常互動對象</h3>
              {activity.top_targets.length === 0 ? (
                <div className="text-xs text-slate-400">還沒有互動紀錄。</div>
              ) : (
                <div className="space-y-1">
                  {activity.top_targets.map(([username, count]) => (
                    <div key={username} className="flex justify-between text-sm">
                      <span>@{username}</span>
                      <span className="text-slate-500">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="font-semibold text-sm mb-3">略過原因分布</h3>
              <Distribution data={activity.by_skip_reason} labelMap={SKIP_REASON_LABELS} />
            </div>
          </div>
        </>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h3 className="font-semibold text-sm mb-3">內容分析 (Phase 3)</h3>
        {content?.status === "no_data" ? (
          <div className="text-sm text-slate-500">
            <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs mr-2">
              等待資料中
            </span>
            還沒有 PostAnalysis 資料。Phase 3 需要 Phase 2 跑幾天累積真實貼文 metadata
            +分類 pass 才能出圖。等 Phase 2 對真實 target 跑幾天後就會自動有資料。
          </div>
        ) : content ? (
          <div className="grid md:grid-cols-3 gap-6 text-sm">
            <div>
              <div className="text-xs text-slate-500 mb-2">場景分類</div>
              <Distribution data={content.by_scene} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-2">媒體類型</div>
              <Distribution data={content.by_media_type} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-2">互動率分布</div>
              <Distribution data={content.engagement_buckets} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default Analytics;
