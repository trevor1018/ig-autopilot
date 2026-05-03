import { useEffect, useState } from "react";
import { useUser } from "../lib/auth";
import { getApiKey, saveApiKey } from "../lib/firestore";

function Settings() {
  const { user, signOutNow } = useUser();
  const [apiKey, setKey] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    getApiKey(user.uid)
      .then((k) => {
        setKey(k);
        setOriginal(k);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [user]);

  async function onSave() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await saveApiKey(user.uid, apiKey.trim());
      setOriginal(apiKey.trim());
      setSavedAt(Date.now());
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const dirty = apiKey !== original;
  const masked = original.length > 8
    ? `${original.slice(0, 4)}...${original.slice(-4)}`
    : original
      ? "(set)"
      : "(empty)";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">設定</h2>
        <p className="text-xs text-slate-500">
          登入帳號:<code className="ml-1 bg-slate-100 px-1.5 py-0.5 rounded">{user?.email}</code>
        </p>
      </div>

      {/* API key card */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
        <div>
          <h3 className="font-semibold text-sm">Gemini API Key</h3>
          <p className="text-xs text-slate-500 mt-1">
            文案 / 製圖工作室都用這把 key 直接打 Gemini API。
            從 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">Google AI Studio</a> 申請(免費)。
            存在 Firestore 裡,只有你的 Google 帳號讀得到。
          </p>
        </div>

        {loading ? (
          <div className="text-sm text-slate-400">載入中...</div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium mb-1">
                目前的 key:{" "}
                <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                  {masked}
                </code>
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setKey(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono"
                placeholder="AIzaSy..."
                autoComplete="off"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onSave}
                disabled={saving || !dirty}
                className="bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white text-sm font-medium px-4 py-2 rounded"
              >
                {saving ? "儲存中..." : "💾 儲存"}
              </button>
              {savedAt && !dirty && (
                <span className="text-xs text-green-600">✓ 已儲存</span>
              )}
              {dirty && <span className="text-xs text-amber-600">尚未儲存</span>}
            </div>
            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 p-2 rounded">
                {error}
              </div>
            )}
          </>
        )}
      </div>

      {/* Sign out card */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="font-semibold text-sm mb-2">帳號</h3>
        <button
          onClick={() => signOutNow()}
          className="text-sm px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50"
        >
          登出
        </button>
      </div>

      {/* Tech info */}
      <div className="text-xs text-slate-400 leading-relaxed">
        資料儲存於 Firebase Firestore · 圖像直接從你的瀏覽器打 Gemini API · 沒有後端伺服器
      </div>
    </div>
  );
}

export default Settings;
