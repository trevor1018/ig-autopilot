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
import { describePhotoForRegeneration } from "../lib/gemini";
import { compressToJpeg, downloadOrShareImage, toDataUrl } from "../lib/image-utils";
import { generateImagePollinations } from "../lib/pollinations";

type Mode = "edit" | "generate";

interface ResultState {
  url: string;
  base64: string;
  mime: string;
  narrative: string;
}

// Cap for source photos in edit mode. Pollinations only does text-to-image,
// so multi-photo "composition" works by describing each photo via Gemini Vision
// and concatenating into one prompt. More than ~3 inputs makes the description
// pile too long for Pollinations' URL.
const MAX_EDIT_PHOTOS = 3;

function ImageStudio() {
  const { user } = useUser();
  const [mode, setMode] = useState<Mode>("edit");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personaId, setPersonaId] = useState<string | null>(null);

  // Edit mode — supports multiple source photos for composition tasks
  const [photos, setPhotos] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
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
    if (photos.length === 0) {
      setPreviewUrls([]);
      return;
    }
    const urls = photos.map((p) => URL.createObjectURL(p));
    setPreviewUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    if (picked.length > MAX_EDIT_PHOTOS) {
      setError(
        `一次最多 ${MAX_EDIT_PHOTOS} 張(過多 AI 容易搞混),已截取前 ${MAX_EDIT_PHOTOS} 張`,
      );
      setPhotos(picked.slice(0, MAX_EDIT_PHOTOS));
    } else {
      setError(null);
      setPhotos(picked);
    }
    e.target.value = "";
  }

  function removePhoto(i: number) {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  function clearAllPhotos() {
    setPhotos([]);
  }

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

  function ingestResult(args: {
    base64: string;
    mime: string;
    narrative?: string;
  }): ResultState {
    return {
      url: toDataUrl(args.base64, args.mime),
      base64: args.base64,
      mime: args.mime,
      narrative: args.narrative ?? "",
    };
  }

  async function persistToHistoryAndRefresh(args: {
    mode: Mode;
    promptText: string;
    persona: Persona | null;
    sourceFiles: File[]; // empty for generate mode
    result: ResultState;
  }) {
    if (!user) return;
    try {
      // Source thumbnail = first photo only (Firestore doc limit means we can't
      // store all of them); source_count records how many were actually fed in.
      let sourceThumb: string | null = null;
      if (args.sourceFiles.length > 0) {
        const t = await compressToJpeg(args.sourceFiles[0], 256, 0.7);
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
        source_count: args.sourceFiles.length,
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
    if (!user || photos.length === 0 || !instruction.trim()) {
      setError("請上傳至少一張照片並寫修圖指令");
      return;
    }
    setLoading(true);
    setError(null);
    clearResult();
    try {
      const apiKey = await getApiKey(user.uid);
      if (!apiKey) throw new Error("Gemini API key 未設定 — 去「設定」頁加。");

      // Step 1: describe each source photo via Gemini Vision (text model, free).
      // Step 2: combine descriptions + user instruction into a single prompt.
      // Step 3: send to Pollinations.ai for image generation (free, no key).
      const descriptions: string[] = [];
      for (const f of photos) {
        const c = await compressToJpeg(f, 768, 0.8);
        const d = await describePhotoForRegeneration(c.base64, c.mimeType, apiKey);
        descriptions.push(d);
      }

      const personaLine = selectedPersona
        ? `Featured character: ${selectedPersona.character_name}. `
        : "";
      const fullPrompt =
        photos.length === 1
          ? `${personaLine}${descriptions[0]} Edit instruction: ${instruction.trim()}`
          : descriptions
              .map((d, i) => `Source ${i + 1}: ${d}`)
              .join(" ") +
            ` ${personaLine}Combine these elements as follows: ${instruction.trim()}`;

      const res = await generateImagePollinations(fullPrompt);

      // Track usage (Pollinations is free, but we count for stats).
      await incrementMonthlyImageUsage(user.uid).catch(() => {});
      refreshUsage();

      const ingested = ingestResult({
        base64: res.base64,
        mime: res.mime,
        narrative: photos.length > 1
          ? `根據 ${photos.length} 張來源圖描述合成`
          : "根據來源圖描述重新生成",
      });
      setResult(ingested);
      await persistToHistoryAndRefresh({
        mode: "edit",
        promptText: instruction,
        persona: selectedPersona,
        sourceFiles: photos,
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
      // Generate mode: pure text-to-image via Pollinations. No Gemini call
      // needed (no API key required either, but we still let users add a
      // persona context line for character consistency).
      const personaLine = selectedPersona
        ? `Featured character: ${selectedPersona.character_name}. `
        : "";
      const fullPrompt = `${personaLine}${prompt.trim()}`;
      const res = await generateImagePollinations(fullPrompt);
      await incrementMonthlyImageUsage(user.uid).catch(() => {});
      refreshUsage();
      const ingested = ingestResult({ base64: res.base64, mime: res.mime });
      setResult(ingested);
      await persistToHistoryAndRefresh({
        mode: "generate",
        promptText: prompt,
        persona: selectedPersona,
        sourceFiles: [],
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
              <label className="block text-sm font-medium mb-1">
                原始照片{" "}
                <span className="text-xs font-normal text-slate-400">
                  (可多張,最多 {MAX_EDIT_PHOTOS} 張 — 多張會做合成)
                </span>
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={onFileChange}
                className="block w-full text-sm"
              />

              {photos.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2 text-xs">
                    <span className="text-slate-600 font-medium">
                      已選 {photos.length} 張
                      {photos.length > 1 && (
                        <span className="ml-2 px-1.5 py-0.5 bg-brand-50 text-brand-700 rounded">
                          🧩 合成
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={clearAllPhotos}
                      className="text-slate-500 hover:text-red-600"
                    >
                      全部清除
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {previewUrls.map((url, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={url}
                          alt={`預覽 ${i + 1}`}
                          className="w-full h-24 object-cover rounded border border-slate-200"
                        />
                        <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                          {i + 1}
                        </div>
                        <button
                          type="button"
                          onClick={() => removePhoto(i)}
                          className="absolute top-1 right-1 bg-white/95 hover:bg-white text-red-600 rounded-full w-5 h-5 text-xs font-bold flex items-center justify-center shadow"
                          title="移除這張"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
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
                placeholder={
                  photos.length > 1
                    ? "例:把第 1 張的暖暖豬放到第 2 張的咖啡廳場景裡,光線自然融合"
                    : "例:把暖暖豬的眼睛閉起來,看起來像在睡覺,其他部分完全不要動"
                }
              />
              <p className="text-xs text-slate-400 mt-1">
                💡 注意:這是「重新生成相似的圖」,不是真正的局部編輯。AI 會先把你的照片描述成文字,
                再加上你的指令重新畫一張。結果風格類似但不會 1:1 保留原圖細節。
              </p>
            </div>
            <button
              type="submit"
              disabled={loading || photos.length === 0 || !instruction.trim()}
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white font-medium py-2 rounded-md transition"
            >
              {loading
                ? "AI 修圖中... (5-15 秒)"
                : photos.length > 1
                  ? `✏️ 開始合成 (${photos.length} 張)`
                  : "✏️ 開始修圖"}
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

        {/* Monthly usage stat — Pollinations is free, just a usage counter */}
        <div className="mt-4 bg-white p-3 rounded-lg border border-slate-200 text-xs">
          <div className="flex justify-between items-baseline mb-1">
            <span className="font-medium text-slate-700">本月圖像產量</span>
            <span className="text-green-600 font-semibold">$0.00 (免費)</span>
          </div>
          <div className="text-[10px] text-slate-400 leading-relaxed">
            {usageLoaded ? `已產 ${monthlyCount} 張 · ` : "讀取中... · "}
            圖像由 <a href="https://pollinations.ai" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">Pollinations.ai</a>{" "}
            生成(免費,無 key);修圖前的場景描述用 Gemini Vision(免費 tier 內,文字)
          </div>
        </div>
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
