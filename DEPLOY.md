# Deploy to GitHub Pages

Architecture: pure static frontend → GitHub Pages → Firebase (Auth + Firestore) → Gemini API.
No backend server. Free forever. Same setup as `mlb-tracker`.

Live URL: https://trevor1018.github.io/ig-autopilot/

---

## One-time setup

### 1. Allow `trevor1018.github.io` in Firebase

Firebase Auth blocks logins from unknown domains. Add the GitHub Pages domain:

1. Open https://console.firebase.google.com → project `ig-autopilot`
2. Left menu → **Authentication** → **Settings** tab → **Authorized domains**
3. **Add domain** → `trevor1018.github.io` → Save

### 2. Enable GitHub Pages with Actions as the source

1. Open https://github.com/trevor1018/ig-autopilot
2. **Settings** tab → **Pages** (left sidebar)
3. **Build and deployment** → **Source** → select **GitHub Actions**

That's it for the manual setup.

---

## Auto-deploy flow

Every push to `main` triggers `.github/workflows/deploy.yml`:

```
push to main  →  GitHub Actions  →  npm ci + npm run build  →  GitHub Pages
                                    (in frontend/)            (~1-2 min)
```

After the workflow completes, the new build is live at the URL above.

You can also trigger a deploy manually: **Actions** tab → **Deploy to GitHub Pages** → **Run workflow**.

---

## Local development

`npm run dev` still works with `base: '/'` (Vite config picks dev vs build automatically).

```bash
cd frontend
npm install      # first time
npm run dev      # http://localhost:5173/
```

For the local app to work end-to-end you also need:
- A Gemini API key set in **設定** page (stored in your Firestore, only readable by your account)
- `localhost` is already in Firebase's authorized domains by default

---

## Build verification before push

Optional but useful — make sure the production bundle compiles:

```bash
cd frontend
npm run build
npm run preview   # serves dist/ at http://localhost:4173/ig-autopilot/
```

If `preview` works, the GitHub Pages deploy will also work.

---

## What's hosted where

| Thing | Hosted at | Cost |
|---|---|---|
| Frontend (HTML/JS/CSS) | GitHub Pages | $0 |
| Auth (Google sign-in) | Firebase Auth | $0 |
| User data (personas, captions, image history) | Firestore | $0 (1 GB free) |
| Image generation / editing | Gemini API (your own key) | $0 (free tier) |
| Backend server | None — there is no backend | $0 |

---

## Going from this to having other people use it

Each user signs in with their own Google account, gets their own isolated Firestore data, and uses their own Gemini API key. Nothing to share, nothing to coordinate — just send them the URL.

Caveat: while the Firebase OAuth consent screen is in **Test mode**, only emails listed under **Test users** in Google Cloud Console can sign in. To open it up to anyone:

1. Open https://console.cloud.google.com → your auth project → **APIs & Services** → **OAuth consent screen**
2. **Publishing status** → **PUBLISH APP**
3. (Google may ask for verification depending on scopes — for plain `email` + `profile` scopes it's usually instant)
