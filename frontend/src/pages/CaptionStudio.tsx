import { useEffect, useMemo, useState } from "react";
import { CaptionResponse, Persona, api } from "../api/client";

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
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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
    if (!photo) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const selectedPersona = useMemo(
    () => personas.find((p) => p.id === personaId) ?? null,
    [personas, personaId],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!personaId || !photo) {
      setError("Pick a persona and upload a photo first.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.generateCaption(personaId, photo, userHint);
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
        <h2 className="text-lg font-semibold mb-4">1. Upload + configure</h2>
        <form onSubmit={onSubmit} className="space-y-4 bg-white p-6 rounded-lg border border-slate-200">
          <div>
            <label className="block text-sm font-medium mb-1">Persona</label>
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
                Tones: {selectedPersona.tones.join(", ")} · Languages:{" "}
                {selectedPersona.languages.join(", ")} · Must include #
                {selectedPersona.required_hashtags.join(" #") || "—"}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            {previewUrl && (
              <img src={previewUrl} alt="preview" className="mt-3 max-h-72 rounded-md border" />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Hint (optional) — extra context the photo alone doesn't tell
            </label>
            <textarea
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              rows={3}
              value={userHint}
              onChange={(e) => setUserHint(e.target.value)}
              placeholder="e.g. 今天暖暖豬第一次去海邊,有點怕水"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !photo || !personaId}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white font-medium py-2 rounded-md transition"
          >
            {loading ? "Generating..." : "Generate caption"}
          </button>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded">
              {error}
            </div>
          )}
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">2. Result</h2>
        {!result && !loading && (
          <div className="bg-white p-6 rounded-lg border border-dashed border-slate-300 text-center text-slate-400">
            Output will appear here.
          </div>
        )}
        {loading && (
          <div className="bg-white p-6 rounded-lg border border-slate-200 text-slate-500">
            Calling Gemini...
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
              {copiedAll ? "✓ Copied — paste into IG" : "📋 Copy full post"}
            </button>

            {result.photo_summary && (
              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-400 mb-1">Photo summary</div>
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
                    Copy
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
                  Copy all
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
