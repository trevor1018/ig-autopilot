import { useState } from "react";
import { useUser } from "../lib/auth";

function Login() {
  const { signIn } = useUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 sm:px-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-10 w-full max-w-md text-center shadow-sm">
        <h1 className="text-xl sm:text-2xl font-bold text-brand-600 mb-2">IG Autopilot</h1>
        <p className="text-sm text-slate-500 mb-6 sm:mb-8">內容創作工具 · 文案 + 修圖</p>

        <button
          onClick={onSignIn}
          disabled={busy}
          className="w-full bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2"
        >
          {busy ? "登入中..." : (
            <>
              <span className="text-lg">🔐</span>
              <span>使用 Google 帳號登入</span>
            </>
          )}
        </button>

        {error && (
          <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded text-left">
            {error}
          </div>
        )}

        <p className="text-xs text-slate-400 mt-6 sm:mt-8 leading-relaxed">
          資料儲存於 Firebase Firestore,只有你自己的 Google 帳號讀得到。
          <br />
          首次登入會建立預設「暖暖豬」角色。
        </p>
      </div>
    </div>
  );
}

export default Login;
