import { useEffect, useMemo, useState } from "react";
import { useUser } from "../lib/auth";
import {
  CaptionHistory,
  ImageHistory,
  deleteCaptionHistory,
  deleteImageHistory,
  listCaptionHistory,
  listImageHistory,
} from "../lib/firestore";
import { downloadOrShareImage, toDataUrl } from "../lib/image-utils";

type Tab = "captions" | "images";

function dayKey(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function timeStr(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}

function groupByDay<T extends { created_at: number }>(rows: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = dayKey(r.created_at);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

function History() {
  const { user } = useUser();
  const [tab, setTab] = useState<Tab>("captions");
  const [captions, setCaptions] = useState<CaptionHistory[]>([]);
  const [images, setImages] = useState<ImageHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([listCaptionHistory(user.uid), listImageHistory(user.uid)])
      .then(([c, i]) => {
        setCaptions(c);
        setImages(i);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [user, refreshKey]);

  const captionGroups = useMemo(() => groupByDay(captions), [captions]);
  const imageGroups = useMemo(() => groupByDay(images), [images]);

  async function onDeleteCaption(id: string) {
    if (!user) return;
    if (!confirm("確定刪除這筆文案紀錄?")) return;
    try {
      await deleteCaptionHistory(user.uid, id);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(String(e));
    }
  }

  async function onDeleteImage(id: string) {
    if (!user) return;
    if (!confirm("確定刪除這張圖片紀錄?")) return;
    try {
      await deleteImageHistory(user.uid, id);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(String(e));
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  async function downloadImage(item: ImageHistory) {
    const ext = item.result_mime.includes("jpeg") ? "jpg" : "png";
    const filename = `nuannuanzhu_${item.created_at}.${ext}`;
    try {
      await downloadOrShareImage(item.result_image, item.result_mime, filename);
    } catch (e) {
      setError(`下載失敗: ${String(e)}`);
    }
  }

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium transition border-b-2 ${
      active
        ? "border-brand-500 text-brand-600"
        : "border-transparent text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-base sm:text-lg font-semibold">歷史紀錄</h2>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="text-xs text-brand-600 hover:underline"
        >
          ⟳ 重新整理
        </button>
      </div>

      <div className="flex border-b border-slate-200">
        <button onClick={() => setTab("captions")} className={tabClass(tab === "captions")}>
          📝 文案 ({captions.length})
        </button>
        <button onClick={() => setTab("images")} className={tabClass(tab === "images")}>
          🖼️ 修圖 ({images.length})
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded">
          {error}
        </div>
      )}

      {loading && <div className="text-sm text-slate-400">載入中...</div>}

      {!loading && tab === "captions" && (
        <div className="space-y-6">
          {captionGroups.length === 0 ? (
            <div className="bg-white p-6 rounded-lg border border-dashed border-slate-300 text-center text-slate-400">
              還沒有文案紀錄。去文案工作室產一篇看看。
            </div>
          ) : (
            captionGroups.map(([day, rows]) => (
              <div key={day}>
                <h3 className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">
                  {day} · {rows.length} 篇
                </h3>
                <div className="space-y-3">
                  {rows.map((c) => (
                    <div
                      key={c.id}
                      className="bg-white border border-slate-200 rounded-lg p-4"
                    >
                      <div className="flex justify-between items-start gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-slate-500">
                            {timeStr(c.created_at)} · 角色:{c.persona_name}
                            {c.photo_count > 1 && (
                              <span className="ml-2 px-1.5 py-0.5 bg-brand-50 text-brand-700 rounded">
                                🎠 輪播 {c.photo_count} 張
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => onDeleteCaption(c.id)}
                          className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                        >
                          🗑️
                        </button>
                      </div>

                      <div className="grid sm:grid-cols-[80px_1fr] gap-3">
                        {c.photo_thumbnail && (
                          <img
                            src={toDataUrl(c.photo_thumbnail, "image/jpeg")}
                            alt="thumb"
                            className="w-20 h-20 object-cover rounded border border-slate-200"
                          />
                        )}
                        <div className="space-y-2 text-sm min-w-0">
                          <div className="whitespace-pre-wrap">{c.captions.zh}</div>
                          <details className="text-xs text-slate-600">
                            <summary className="cursor-pointer hover:text-brand-600">
                              JA / EN / Hashtags
                            </summary>
                            <div className="mt-2 space-y-2 pl-2 border-l-2 border-slate-200">
                              <div>
                                <span className="text-slate-400">JA:</span>{" "}
                                <span className="whitespace-pre-wrap">{c.captions.ja}</span>
                              </div>
                              <div>
                                <span className="text-slate-400">EN:</span>{" "}
                                <span className="whitespace-pre-wrap">{c.captions.en}</span>
                              </div>
                              <div>
                                <span className="text-slate-400">Tags:</span>{" "}
                                <span>{c.hashtags.join(" ")}</span>
                              </div>
                            </div>
                          </details>
                          <div className="flex gap-3 pt-1 text-xs">
                            <button
                              onClick={() => copy(c.captions.zh)}
                              className="text-brand-600 hover:underline"
                            >
                              複製 ZH
                            </button>
                            <button
                              onClick={() => copy(`${c.captions.zh}\n.\n${c.captions.ja}\n.\n${c.captions.en}\n\n${c.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join("")}`)}
                              className="text-brand-600 hover:underline"
                            >
                              複製完整貼文
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && tab === "images" && (
        <div className="space-y-6">
          {imageGroups.length === 0 ? (
            <div className="bg-white p-6 rounded-lg border border-dashed border-slate-300 text-center text-slate-400">
              還沒有修圖紀錄。去製圖工作室處理一張看看。
            </div>
          ) : (
            imageGroups.map(([day, rows]) => (
              <div key={day}>
                <h3 className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">
                  {day} · {rows.length} 張
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {rows.map((img) => (
                    <div
                      key={img.id}
                      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
                    >
                      <img
                        src={toDataUrl(img.result_image, img.result_mime)}
                        alt="result"
                        className="w-full aspect-square object-cover"
                      />
                      <div className="p-2 space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500">
                            {img.mode === "edit" ? "✏️ 修圖" : "🎨 生成"}
                            {img.mode === "edit" && (img.source_count ?? 1) > 1 && (
                              <span className="ml-1 px-1 py-0.5 bg-brand-50 text-brand-700 rounded text-[10px]">
                                🧩 ×{img.source_count}
                              </span>
                            )}
                            {" · "}
                            {timeStr(img.created_at)}
                          </span>
                          <button
                            onClick={() => onDeleteImage(img.id)}
                            className="text-red-600 hover:bg-red-50 px-1 rounded"
                          >
                            🗑️
                          </button>
                        </div>
                        <div className="text-xs text-slate-600 line-clamp-2" title={img.prompt}>
                          {img.prompt}
                        </div>
                        <button
                          onClick={() => downloadImage(img)}
                          className="w-full text-xs bg-brand-50 text-brand-700 hover:bg-brand-100 py-1 rounded"
                        >
                          ⬇️ 下載
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default History;
