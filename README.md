# IG Autopilot — Content Studio

A persona-driven content creation tool for Instagram. Caption + image generation, powered by Gemini, with full per-user history.

🌐 **Live**: https://trevor1018.github.io/ig-autopilot/

> ⚠️ Each user uses their own Gemini API key (entered once in **設定**, stored in their own Firestore record). Free-tier-friendly, no shared backend, no quota leaks.

---

## What it does

| 頁 | 功能 |
|---|---|
| **文案工作室** | 上傳 1-10 張照片(單張或 IG 輪播)→ 角色驅動的中日英三語文案 + 5 個 hashtag。ZH 可即時編輯,JA / EN 自動跟著翻譯。Hashtag 一鍵根據新 ZH 重產。生成後自動存歷史紀錄。 |
| **製圖工作室** | AI 修圖(指令式編輯,例如「把暖暖豬的眼睛閉起來,其他不動」)+ AI 生成圖。Gemini 2.5 Flash Image 驅動,自動存歷史。 |
| **歷史紀錄** | 文案 + 修圖兩個分頁,按日期分組。每筆可重新複製、下載、刪除。 |
| **角色** | Persona 列表(目前唯讀,預設「暖暖豬」首次登入自動建立)。 |
| **設定** | 你的 Gemini API key + 登出。 |

---

## Architecture

```
                   GitHub Pages
                  (static frontend)
                         │
                         ▼
       ┌──────────────────────────────┐
       │   React + Vite + Tailwind    │
       └──┬──────────────┬────────────┘
          │              │
          ▼              ▼
   Firebase          Gemini API
   ├ Auth            (your key,
   │  (Google)        from設定)
   └ Firestore
      └ users/{uid}/
        ├ personas/
        ├ captions/
        ├ images/
        └ private/settings   ← 你的 Gemini key
```

**沒有後端伺服器**。Firestore Rules 確保每個人只能讀寫自己 `users/{uid}/` 底下的資料。

| Layer | Tech | Cost |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind | $0 |
| Hosting | GitHub Pages | $0 |
| Auth | Firebase Auth (Google OAuth) | $0 |
| Database | Firebase Firestore (1 GB free) | $0 |
| LLM | Gemini API (Google AI Studio free tier) | $0 |
| Image gen / edit | `gemini-2.5-flash-image-preview` | $0 (~10-50 RPD free) |

---

## Local development

### Prerequisites
- Node.js 20+
- A Firebase project (config already wired into `frontend/src/lib/firebase.ts`)
- Your own Gemini API key (free at https://aistudio.google.com/apikey)

### Run
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173/, sign in with Google, paste API key in 設定 page.

### Build (production)
```bash
npm run build      # outputs to frontend/dist/
npm run preview    # serves build at http://localhost:4173/ig-autopilot/
```

---

## Deployment

Auto-deploys to GitHub Pages on every push to `main` via `.github/workflows/deploy.yml`.

Manual trigger: GitHub repo → **Actions** → **Deploy to GitHub Pages** → **Run workflow**.

See [`DEPLOY.md`](./DEPLOY.md) for the one-time GitHub Pages + Firebase domain setup.

---

## Project layout

```
ig-autopilot/
├── .github/workflows/deploy.yml    GitHub Actions: build + push to Pages
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── firebase.ts         init (auth + db handles)
│   │   │   ├── auth.tsx            AuthProvider, useUser hook
│   │   │   ├── firestore.ts        Persona / Caption / Image / Settings CRUD
│   │   │   ├── gemini.ts           browser-side Gemini REST wrapper
│   │   │   ├── persona-prompt.ts   system_instruction builder
│   │   │   └── image-utils.ts      JPEG compress / base64 helpers
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── CaptionStudio.tsx
│   │   │   ├── ImageStudio.tsx
│   │   │   ├── History.tsx
│   │   │   ├── Personas.tsx
│   │   │   └── Settings.tsx
│   │   ├── App.tsx                 auth gate + nav
│   │   └── main.tsx                HashRouter + AuthProvider wrap
│   ├── vite.config.ts              base: '/ig-autopilot/' for prod
│   ├── package.json
│   └── tailwind.config.js
├── DEPLOY.md
└── README.md
```

> The `backend/` directory from earlier phases (FastAPI + SQLite) is no longer used. It can be deleted in a future cleanup once the Firebase setup is fully verified.

---

## Security model

- Firebase Auth limits sign-in to allowed Google accounts (currently in OAuth consent **Test mode** — only emails added to the Test users list can sign in).
- Firestore Rules: `match /users/{userId}/{document=**}` allows read/write only to `request.auth.uid == userId`. Each user's data is fully isolated.
- Gemini API keys are per-user, stored in each user's own Firestore document, never shared, never sent to any server other than Google's Gemini API directly from the browser.
- Firebase config in `firebase.ts` is **public by design** — these tokens are designed to ship to clients; access control is enforced by Firestore Rules + Auth, not by hiding them.

---

## License

Personal project — no license declared yet.
