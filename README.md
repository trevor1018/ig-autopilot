# IG Autopilot

A web tool for analyzing and managing Instagram accounts via persona-driven automation.

> ⚠️ **Public repo notice** — never commit Instagram credentials, session cookies, or API keys. Everything sensitive belongs in `.env` (already gitignored). See `.env.example` for the full list of expected variables.

---

## Phase 1 (current) — Caption Studio

What's in scope:

- **AccountProfile** — one row per IG account you operate. Holds the persona reference and (later) credentials.
- **Persona** — character config (name, tone, languages, required hashtags, few-shot examples). Drives caption generation. Default seed: `暖暖豬`.
- **Caption Studio** — upload a photo, pick a persona, get back ZH/JA/EN copy + 5 hashtags. Powered by Gemini 2.5 Pro (free tier). The persona spec is sent as `system_instruction` on every call, so the model never forgets the setup the way a chat session would.

What's NOT in scope yet (Phase 2+):

- Auto-interaction sweeps (3x/day like/comment)
- Interaction logs
- Post analytics / engagement dashboards
- A/B caption testing
- IG API integration (instagrapi)

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI + SQLAlchemy + SQLite |
| Frontend | Vite + React + TypeScript + Tailwind |
| LLM | Gemini 2.5 Pro (Google AI Studio free tier, `google-genai` SDK) |

---

## Setup

### 1. Clone and configure

```bash
cp .env.example .env
# edit .env, set GEMINI_API_KEY (free key from https://aistudio.google.com/apikey)
```

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows PowerShell
pip install -r requirements.txt
python seed.py                  # creates DB + 暖暖豬 demo persona
uvicorn main:app --reload --port 8000
```

API docs available at http://localhost:8000/docs

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

---

## Project layout

```
ig-autopilot/
├── backend/
│   ├── main.py                 FastAPI entrypoint
│   ├── core/                   config, db
│   ├── models/                 SQLAlchemy: AccountProfile, Persona
│   ├── schemas/                Pydantic request/response schemas
│   ├── routers/                profiles, personas, caption
│   ├── services/
│   │   └── caption_generator.py   Gemini API + system_instruction + vision
│   └── seed.py                 inserts 暖暖豬 demo persona
└── frontend/
    └── src/
        ├── pages/              Profiles, Personas, CaptionStudio
        ├── components/         Layout, shared UI
        └── api/                typed client
```

---

## Roadmap

- **Phase 2** — Auto-interaction (APScheduler 3x/day), interaction log, SafetyGuard
- **Phase 3** — Post analytics, A/B captions, hashtag tracker, persona version history
