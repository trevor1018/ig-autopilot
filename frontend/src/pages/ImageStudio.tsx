import { useEffect, useMemo, useState } from "react";
import { useUser } from "../lib/auth";
import {
  Persona,
  ensureDefaultPersona,
  getApiKey,
  getMonthlyImageUsage,
  incrementMonthlyImageUsage,
  listPersonas,
  saveImageHistory,
} from "../lib/firestore";
import { ImageGenResult, editImage, generateImage } from "../lib/gemini";
import { compressToJpeg, downloadOrShareImage, toDataUrl } from "../lib/image-utils";

type Mode = "edit" | "generate";

interface ResultState {
  url: string;
  base64: string;
  mime: string;
  narrative: string;
}

// Pricing & budget (matches what you set in GCP Console → Billing → Budgets).
// Update both numbers here if you change the cap.
const COST_PER_IMAGE_USD = 0.039; // gemini-2.5-flash-image price
const MONTHLY_BUDGET_USD = 5;

function ImageStudio() {
  const { user } = useUser();
  const [mode, setMode] = useState<Mode>("edit");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personaId, setPersonaId] = useState<string | null>(null);

  // Edit mode
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");

  // Generate mode
  const [prompt, setPrompt] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [savedToHistory, setSavedToHistory] = useState(false);

  // Monthly usage tracking (refreshed on mount + after each successful gen)
  const [monthlyCount, setMonthlyCount] = useState<number>(0);
  const [usageLoaded, setUsageLoaded] = useState(false);

  async function refreshUsage() {
    if (!user) return;
    try {
      const n = await getMonthlyImageUsage(user.uid);
      setMonthlyCount(n);
      setUsageLoaded(true);
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    if (!user) return;
    ensureDefaultPersona(user.uid)
      .then(() => listPersonas(user.uid))
      .then((rows) => {
        setPersonas(rows);
        if (rows.length > 0 && personaId === null) setPersonaId(rows[0].id);
      })
      .catch((e) => setError(String(e)));
    refreshUsage();
  }, [user]);

  useEffect(() => {
    if (!photo) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    return () => {
      if (result?.url) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  const selectedPersona = useMemo(
    () => personas.find((p) => p.id === personaId) ?? null,
    [personas, personaId],
  );

  function clearResult() {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    setSavedToHistory(false);
  }

  function ingestResult(r: ImageGenResult): ResultState {
    const url = toDataUrl(r.image_base64, r.image_mime);
    return {
      url,
      base64: r.image_base64,
      mime: r.image_mime,
      narrative: r.narrative,
    };
  }

  async function persistToHistoryAndRefresh(args: {
    mode: Mode;
    promptText: string;
    persona: Persona | null;
    sourceFile: File | null;
    result: ResultState;
  }) {
    if (!user) return;
    try {
      // Source thumbnail for edit mode (so history shows what we started from)
      let sourceThumb: string | null = null;
      if (args.sourceFile) {
        const t = await compressToJpeg(args.sourceFile, 256, 0.7);
        sourceThumb = t.base64;
      }

      // Result image: if it's already small enough, store as-is; otherwise re-compress.
      // Approx byte-size of a base64 string is 0.75 × length. Firestore doc limit 1 MB.
      let resultB64 = args.result.base64;
      let resultMime = args.result.mime;
      const approxBytes = (args.result.base64.length * 3) / 4;
      if (approxBytes > 800_000) {
        // Re-encode through canvas to JPEG to fit
        const blob = await fetch(args.result.url).then((r) => r.blob());
        const c = await compressToJpeg(blob, 1280, 0.82);
        resultB64 = c.base64;
        resultMime = c.mimeType;
      }

      await saveImageHistory(user.uid, {
        mode: args.mode,
        prompt: args.promptText,
        persona_id: args.persona?.id ?? null,
        persona_name: args.persona?.name ?? "",
        source_thumbnail: sourceThumb,
        result_image: resultB64,
        result_mime: resultMime,
        narrative: args.result.narrative,
        created_at: Date.now(),
      });
      setSavedToHistory(true);
    } catch (e) {
      console.warn("History save failed:", e);
    }
  }

  async function onSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !photo || !instruction.trim()) {
      setError("請上傳照片並寫修圖指令");
      return;
    }
    setLoading(true);
    setError(null);
    clearResult();
    try {
      const apiKey = await getApiKey(user.uid);
      if (!apiKey) throw new Error("Gemini API key 未設定 — 去「設定」頁加。");
      const c = await compressToJpeg(photo, 1280, 0.85);
      const res = await editImage(c.base64, c.mimeType, instruction, selectedPersona, apiKey);
      // Counter increment FIRST — Gemini API call already happened, GCP will
      // bill for it whether or not we save history. Counter must reflect that.
      await incrementMonthlyImageUsage(user.uid).catch(() => {});
      refreshUsage();
      const ingested = ingestResult(res);
      setResult(ingested);
      await persistToHistoryAndRefresh({
        mode: "edit",
        promptText: instruction,
        persona: selectedPersona,
        sourceFile: photo,
        result: ingested,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !prompt.trim()) {
      setError("請輸入提示文字");
      return;
    }
    setLoading(true);
    setError(null);
    clearResult();
    try {
      const apiKey = await getApiKey(user.uid);
      if (!apiKey) throw new Error("Gemini API key 未設定 — 去「設定」頁加。");
      const res = await generateImage(prompt, selectedPersona, apiKey);
      await incrementMonthlyImageUsage(user.uid).catch(() => {});
      refreshUsage();
      const ingested = ingestResult(res);
      setResult(ingested);
      await persistToHistoryAndRefresh({
        mode: "generate",
        promptText: prompt,
        persona: selectedPersona,
        sourceFile: null,
        result: ingested,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function downloadResult() {
    if (!result) return;
    const ext = result.mime.includes("jpeg") ? "jpg" : "png";
    const filename = `nuannuanzhu_${Date.now()}.${ext}`;
    try {
      await downloadOrShareImage(result.base64, result.mime, filename);
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
    <div className="grid lg:grid-cols-2 gap-5 lg:gap-8">
      <section>
        <div className="flex border-b border-slate-200 mb-4 sm:mb-6">
          <button
            className={tabClass(mode === "edit")}
            onClick={() => {
              setMode("edit");
              setError(null);
              clearResult();
            }}
          >
            ✏️ AI 修圖
          </button>
          <button
            className={tabClass(mode === "generate")}
            onClick={() => {
              setMode("generate");
              setError(null);
              clearResult();
            }}
          >
            🎨 AI 生成圖
          </button>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 mb-4">
          <label className="block text-xs font-medium mb-1">
            角色 (Persona){" "}
            <span className="text-slate-400 font-normal">
              — 選了會把角色資訊送進 AI 當背景脈絡(可不選)
            </span>
          </label>
          <select
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            value={personaId ?? ""}
            onChange={(e) => setPersonaId(e.target.value === "" ? null : e.target.value)}
          >
            <option value="">— 不指定角色 —</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.character_name})
              </option>
            ))}
          </select>
          {selectedPersona && (
            <p className="text-xs text-slate-500 mt-2">
              角色:{selectedPersona.character_name}
            </p>
          )}
        </div>

        {mode === "edit" ? (
          <form
            onSubmit={onSubmitEdit}
            className="space-y-4 bg-white p-4 sm:p-6 rounded-lg border border-slate-200"
          >
            <div>
              <label className="block text-sm font-medium mb-1">原始照片</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                className="block w-full text-sm"
              />
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="預覽"
                  className="mt-3 max-h-72 rounded-md border"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                修圖指令{" "}
                <span className="text-xs font-normal text-slate-400">
                  (用文字描述要改什麼)
                </span>
              </label>
              <textarea
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                rows={4}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="例:把暖暖豬的眼睛閉起來,看起來像在睡覺,其他部分完全不要動"
              />
              <p className="text-xs text-slate-400 mt-1">
                💡 越具體越好。記得寫「其他部分不要動」之類的保留指令。
              </p>
            </div>
            <button
              type="submit"
              disabled={loading || !photo || !instruction.trim()}
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white font-medium py-2 rounded-md transition"
            >
              {loading ? "AI 修圖中... (5-15 秒)" : "✏️ 開始修圖"}
            </button>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded">
                {error}
              </div>
            )}
          </form>
        ) : (
          <form
            onSubmit={onSubmitGenerate}
            className="space-y-4 bg-white p-4 sm:p-6 rounded-lg border border-slate-200"
          >
            <div>
              <label className="block text-sm font-medium mb-1">
                生成提示文字{" "}
                <span className="text-xs font-normal text-slate-400">
                  (越具體越好)
                </span>
              </label>
              <textarea
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                rows={6}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例:一隻橘色的擬人化小豬玩偶,坐在咖啡廳的吧台前,面前一杯拿鐵。柔光、暖色調、Instagram 風格。"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white font-medium py-2 rounded-md transition"
            >
              {loading ? "AI 生成中... (5-15 秒)" : "🎨 開始生成"}
            </button>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded">
                {error}
              </div>
            )}
          </form>
        )}

        {/* Monthly usage gauge */}
        {(() => {
          const cost = monthlyCount * COST_PER_IMAGE_USD;
          const pct = Math.min(100, (cost / MONTHLY_BUDGET_USD) * 100);
          const barColor =
            pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-500";
          return (
            <div className="mt-4 bg-white p-3 rounded-lg border border-slate-200">
              <div className="flex justify-between items-baseline mb-1.5 text-xs">
                <span className="font-medium text-slate-700">本月圖像 API 用量</span>
                <span className="text-slate-500">
                  ${cost.toFixed(2)} / ${MONTHLY_BUDGET_USD.toFixed(2)}
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded overflow-hidden mb-1.5">
                <div
                  className={`h-full transition-all ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 leading-relaxed">
                {usageLoaded
                  ? `已產 ${monthlyCount} 張 × $${COST_PER_IMAGE_USD}/張 · `
                  : "讀取中... · "}
                預算 ${MONTHLY_BUDGET_USD} 是你在 GCP Console 設的軟性上限,真實帳單以 GCP Billing 為準
              </div>
            </div>
          );
        })()}
      </section>

      <section>
        <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">結果</h2>
        {!result && !loading && (
          <div className="bg-white p-6 rounded-lg border border-dashed border-slate-300 text-center text-slate-400">
            結果會顯示在這。
          </div>
        )}
        {loading && (
          <div className="bg-white p-6 rounded-lg border border-slate-200 text-slate-500">
            正在呼叫 Gemini Image...
          </div>
        )}
        {result && (
          <div className="space-y-3">
            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <img src={result.url} alt="結果" className="w-full rounded" />
            </div>

            <button
              onClick={downloadResult}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 rounded-lg transition"
            >
              ⬇️ 下載 / 分享
            </button>
            <p className="text-[10px] text-slate-400 text-center -mt-1">
              手機:會開啟系統「分享」面板,選「儲存影像」即可存到相簿
            </p>

            {savedToHistory && (
              <div className="text-xs text-green-700 bg-green-50 border border-green-200 p-2 rounded">
                ✓ 已自動儲存到歷史紀錄
              </div>
            )}

            {result.narrative && (
              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-400 mb-1">AI 說明</div>
                <p className="text-sm whitespace-pre-wrap">{result.narrative}</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default ImageStudio;
