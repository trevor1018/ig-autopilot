import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import CaptionStudio from "./pages/CaptionStudio";
import Personas from "./pages/Personas";
import Profiles from "./pages/Profiles";

function App() {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 rounded-md text-sm font-medium transition ${
      isActive
        ? "bg-brand-500 text-white"
        : "text-slate-600 hover:bg-brand-50 hover:text-brand-700"
    }`;

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-6">
          <h1 className="text-xl font-bold text-brand-600">IG Autopilot</h1>
          <nav className="flex gap-2">
            <NavLink to="/caption" className={navClass}>
              Caption Studio
            </NavLink>
            <NavLink to="/personas" className={navClass}>
              Personas
            </NavLink>
            <NavLink to="/profiles" className={navClass}>
              Profiles
            </NavLink>
          </nav>
          <span className="ml-auto text-xs text-slate-400">Phase 1 — caption-only</span>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/caption" replace />} />
          <Route path="/caption" element={<CaptionStudio />} />
          <Route path="/personas" element={<Personas />} />
          <Route path="/profiles" element={<Profiles />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
