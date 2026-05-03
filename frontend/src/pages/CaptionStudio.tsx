import { useEffect, useMemo, useState } from "react";
import { CaptionResponse, Persona, api } from "../api/client";

const MAX_PHOTOS = 10;

function formatFullPost(
  captions: { zh: string; ja: string; en: string },
  hashtags: string[],
): string {
  const tagLine = hashtags
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join("");
  return `${captions.zh}\n.\n${captions.ja}\n.\n${captions.en}\n\n${tagLine}`;
}

function CaptionStudio() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personaId, setPersonaId] = useState<number | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [userHint, setUserHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CaptionResponse | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    api
      .listPersonas()
      .then((rows) => {
        setPersonas(rows);
        if (rows.length > 0) setPersonaId(rows[0].id);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (photos.length === 0) {
      setPreviewUrls([]);
      return;
    }
    const urls = photos.map((p) => URL.createObjectURL(p));
    setPreviewUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const selectedPersona = useMemo(
    () => personas.find((p) => p.id === personaId) ?? null,
    [personas, personaId],
  );

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    if (picked.length > MAX_PHOTOS) {
      setError(`一次最多 ${MAX_PHOTOS} 張(IG carousel 上限),已截取前 ${MAX_PHOTOS} 張`);
      setPhotos(picked.slice(0, MAX_PHOTOS));
    } else {
      setError(null);
      setPhotos(picked);
    }
    // Allow re-picking the same files later (e.g. after removing one)
    e.target.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function clearAllPhotos() {
    setPhotos([]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!personaId || photos.length === 0) {
      setError("請先選擇角色並上傳至少一張照片");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.generateCaption(personaId, photos, userHint);
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function copyFullPost() {
    if (!result) return;
    const text = formatFullPost(result.captions, result.hashtags);
    navigator.clipboard.writeText(text).then(
      () => {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 1500);
      },
      () => {},
    );
  }

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <section>
        <h2 className="text-lg font-semibold mb-4">1. 上傳並設定</h2>
        <form onSubmit={onSubmit} className="space-y-4 bg-white p-6 rounded-lg border border-slate-200">
          <div>
            <label className="block text-sm font-medium mb-1">角色 (Persona)</label>
            <select
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={personaId ?? ""}
              onChange={(e) => setPersonaId(Number(e.target.value))}
            >
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.character_name})
                </option>
              ))}
            </select>
            {selectedPersona && (
              <p className="text-xs text-slate-500 mt-2">
                語氣：{selectedPersona.tones.join("、")} · 語言：
                {selectedPersona.languages.join(", ")} · 必含 #
                {selectedPersona.required_hashtags.join(" #") || "—"}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              照片{" "}
              <span className="text-xs font-normal text-slate-400">
                (可多張,最多 {MAX_PHOTOS} 張 — 多張視為 IG 輪播貼文)
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
                        🎠 輪播
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
              提示（選填）— 照片看不出來的補充資訊
            </label>
            <textarea
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              rows={3}
              value={userHint}
              onChange={(e) => setUserHint(e.target.value)}
              placeholder="例：今天暖暖豬第一次去海邊,有點怕水"
            />
          </div>

          <button
            type="submit"
            disabled={loading || photos.length === 0 || !personaId}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white font-medium py-2 rounded-md transition"
          >
            {loading
              ? "產生中..."
              : photos.length > 1
                ? `產生文案 (${photos.length} 張輪播)`
                : "產生文案"}
          </button>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded">
              {error}
            </div>
          )}
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">2. 結果</h2>
        {!result && !loading && (
          <div className="bg-white p-6 rounded-lg border border-dashed border-slate-300 text-center text-slate-400">
            結果會顯示在這。
          </div>
        )}
        {loading && (
          <div className="bg-white p-6 rounded-lg border border-slate-200 text-slate-500">
            正在呼叫 Gemini...
          </div>
        )}
        {result && (
          <div className="space-y-4">
            <button
              onClick={copyFullPost}
              className={`w-full font-semibold py-3 rounded-lg transition text-white ${
                copiedAll ? "bg-green-600" : "bg-brand-500 hover:bg-brand-600"
              }`}
            >
              {copiedAll ? "✓ 已複製 — 貼到 IG 即可" : "📋 複製完整貼文"}
            </button>

            {result.photo_summary && (
              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-400 mb-1">
                  {photos.length > 1 ? "輪播摘要" : "照片摘要"}
                </div>
                <div className="text-sm">{result.photo_summary}</div>
              </div>
            )}

            {(["zh", "ja", "en"] as const).map((lang) => (
              <div key={lang} className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs uppercase tracking-wide font-semibold text-brand-600">
                    {lang}
                  </span>
                  <button
                    onClick={() => copy(result.captions[lang])}
                    className="text-xs text-slate-500 hover:text-brand-600"
                  >
                    複製
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm">{result.captions[lang]}</p>
              </div>
            ))}

            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs uppercase tracking-wide font-semibold text-brand-600">
                  Hashtags ({result.hashtags.length})
                </span>
                <button
                  onClick={() => copy(result.hashtags.join(" "))}
                  className="text-xs text-slate-500 hover:text-brand-600"
                >
                  全部複製
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.hashtags.map((h, i) => (
                  <span
                    key={i}
                    className="text-sm bg-brand-50 text-brand-700 px-2 py-1 rounded"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>

            <div className="text-xs text-slate-400 bg-slate-100 p-3 rounded">
              tokens · in: {result.input_tokens} · out: {result.output_tokens} · cache read:{" "}
              {result.cache_read_tokens} · cache write: {result.cache_creation_tokens}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default CaptionStudio;
