# Deployment Guide

This guide takes you from "works on my laptop" → "real public URLs".

> **Prerequisite check before starting:**
> - [ ] You have a Google account (for Vercel) and email (for Render) ready
> - [ ] Your `GEMINI_API_KEY` is in hand (you already have one — same one as `.env` locally)

The hybrid architecture:
- **Frontend** (static React build) → **Vercel** (free tier)
- **Backend** (FastAPI + SQLite) → **Render** (free tier)
- Frontend `fetch()` calls go from `*.vercel.app` → `*.onrender.com` → Gemini

## Time budget

About 30 minutes if nothing goes wrong. Most time is waiting for builds.

---

## Step 1 — Deploy the backend to Render

1. Go to https://render.com → sign up with GitHub.
2. Top-right **+ New** → **Blueprint**.
3. Connect to the `trevor1018/ig-autopilot` repo.
4. Render auto-detects `render.yaml` at the root and shows one service: `ig-autopilot-api`.
5. Click **Apply**. Render starts building (3–5 min).
6. While it builds, click into the service → **Environment** tab → set:

   | Key | Value |
   |---|---|
   | `GEMINI_API_KEY` | your real key (same as in local `.env`) |
   | `CORS_ORIGINS` | leave empty for now — we'll fill in after frontend deploys |

   `IG_DRY_RUN`, `SWEEP_HOURS`, `DAILY_ACTION_CAP` etc. are pre-filled from `render.yaml`.

7. Wait for build to finish → status shows **Live**. Copy the URL — looks like
   `https://ig-autopilot-api.onrender.com`.

8. Smoke test: open `https://ig-autopilot-api.onrender.com/health` in a browser.
   You should see:
   ```json
   {"status":"ok","model":"gemini-2.5-flash","ig_dry_run":true,"sweep_hours_utc":[0,8,16]}
   ```

> **Free tier notes:**
> - Service sleeps after 15 min idle. First request after sleep takes ~30s to wake.
> - Sleeping kills APScheduler — auto-sweeps will only fire when the service happens to be awake. Upgrade to paid Starter ($7/mo) when you actually want 24/7 sweeps.

---

## Step 2 — Deploy the frontend to Vercel

1. Go to https://vercel.com → sign up with GitHub.
2. **Add New** → **Project** → select `trevor1018/ig-autopilot`.
3. Configuration screen:
   - **Root Directory** → click Edit → set to `frontend`
   - **Framework Preset** → Vite (auto-detected)
   - **Build / Install commands** → defaults are fine (`vercel.json` covers it)
   - **Environment Variables**:
     - Key: `VITE_API_BASE_URL`
     - Value: the Render URL from Step 1 (e.g. `https://ig-autopilot-api.onrender.com`)
4. **Deploy** → wait 1-2 min → done.
5. Copy the URL — looks like `https://ig-autopilot.vercel.app`.

---

## Step 3 — Wire CORS

The backend rejects calls from origins not in `CORS_ORIGINS`. Now that we know the Vercel URL:

1. Render dashboard → `ig-autopilot-api` → **Environment** → add/edit:
   ```
   CORS_ORIGINS = https://ig-autopilot.vercel.app,http://localhost:5173
   ```
   (Keep `localhost` so you can also dev locally against the production backend.)
2. Render auto-redeploys after env var change (~30 sec).

---

## Step 4 — Seed the production DB

The Render disk is empty — no Personas, no Profiles. Run the seed script once:

1. Render dashboard → `ig-autopilot-api` → **Shell** tab.
2. Run:
   ```bash
   python seed.py
   ```
3. Output should match the local seed:
   ```
   Created Persona: 暖暖豬 (id=1)
   Created AccountProfile: nuannuanzhu_demo (id=1)
   ```

---

## Step 5 — End-to-end smoke test

1. Open `https://ig-autopilot.vercel.app/`.
2. **Caption Studio** — should load 暖暖豬 persona in the dropdown.
3. Upload a photo → Generate → ZH/JA/EN copy + 5 hashtags appear.
4. **Sweep** page → quota gauge shows 0 / 120, mode = 🧪 DRY-RUN.
5. **Targets** → add a fake target (e.g. `pikachu_official`).
6. **Sweep** → click **▶ Trigger sweep now**.
7. **Log** page → see one new "like" or "comment" entry with status=executed, DRY badge.

If all 7 work → you're live. ✅

---

## Going from DRY-RUN to LIVE (when you're ready, not now)

⚠️ This is where IG bans actually happen. Read carefully.

1. Use a **test IG account**, not your main 暖暖豬 account, for the first 2 weeks.
2. On Render → set:
   ```
   IG_DRY_RUN = false
   IG_USERNAME = your_test_account
   IG_PASSWORD = ...
   ```
3. Lower `DAILY_ACTION_CAP` to ~50 for the first week.
4. Watch the Log page daily. Any "failed" with rate-limit-style errors → pause immediately.
5. Once you have 1 week of clean operation on the test account, switch to the real account.

---

## Cost summary

- Render free tier: $0/mo, sleeps after idle, scheduler runs only when awake
- Vercel free: $0/mo for personal projects, no limits relevant to your scale
- Gemini Flash free: 250 RPD, ~enough for 1-3 sweeps × 5 targets × 10% comment rate per day

When you're ready for 24/7 sweeps:
- Render Starter $7/mo → no sleeping
- Total: $7/mo
