import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useUser } from "./lib/auth";
import CaptionStudio from "./pages/CaptionStudio";
import History from "./pages/History";
import ImageStudio from "./pages/ImageStudio";
import Login from "./pages/Login";
import Personas from "./pages/Personas";
import Settings from "./pages/Settings";

function App() {
  const { user, loading } = useUser();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        載入中...
      </div>
    );
  }
  if (!user) return <Login />;

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition ${
      isActive
        ? "bg-brand-500 text-white"
        : "text-slate-600 hover:bg-brand-50 hover:text-brand-700"
    }`;

  const avatar = user.photoURL ? (
    <img src={user.photoURL} alt={user.displayName ?? ""} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full" />
  ) : (
    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">
      {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
    </div>
  );

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-3 py-2.5 sm:px-6 sm:py-4 flex items-center gap-2 sm:gap-4 flex-wrap">
          <h1 className="text-base sm:text-xl font-bold text-brand-600">IG Autopilot</h1>
          <nav className="flex gap-0.5 sm:gap-1 flex-wrap">
            <NavLink to="/caption" className={navClass}>
              文案工作室
            </NavLink>
            <NavLink to="/image" className={navClass}>
              製圖工作室
            </NavLink>
            <NavLink to="/history" className={navClass}>
              歷史紀錄
            </NavLink>
            <NavLink to="/personas" className={navClass}>
              角色
            </NavLink>
            <NavLink to="/settings" className={navClass}>
              設定
            </NavLink>
          </nav>
          <NavLink to="/settings" className="ml-auto" title={user.email ?? ""}>
            {avatar}
          </NavLink>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-3 py-4 sm:px-6 sm:py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/caption" replace />} />
          <Route path="/caption" element={<CaptionStudio />} />
          <Route path="/image" element={<ImageStudio />} />
          <Route path="/history" element={<History />} />
          <Route path="/personas" element={<Personas />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
