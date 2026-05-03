# IG Autopilot — Content Studio

A persona-driven content creation tool for Instagram. Currently focused on caption generation; image studio in development.

> ⚠️ **Public repo notice** — never commit Gemini API keys or any other secrets. Everything sensitive belongs in `.env` (already gitignored). See `.env.example` for the full list of expected variables.

---

## What this is

- **文案工作室 (Caption Studio)** — Upload photos (single or multi-photo carousel), pick a persona, get back ZH/JA/EN copy + 5 hashtags. Powered by Gemini 2.5 Flash with the persona spec sent as `system_instruction` on every call, so it never "forgets" the setup the way a chat session does.
- **角色 (Personas)** — Character configs that drive caption generation. Each persona has a name, POV, tones, languages, required hashtags, style notes, and few-shot example posts. Default seed: `暖暖豬`.

## What's coming next

- **製圖工作室 (Image Studio)** — Image editing / styling tools (in design)
- **Caption enhancements** — A/B variants, history, persona editing UI

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI + SQLAlchemy + SQLite |
| Frontend | Vite + React + TypeScript + Tailwind |
| LLM | Gemini 2.5 Flash (Google AI Studio free tier, `google-genai` SDK) |

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

API docs at http://localhost:8000/docs

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
│   ├── models/persona.py       Persona model (sole table)
│   ├── schemas/                Pydantic request/response schemas
│   ├── routers/                personas, caption
│   ├── services/
│   │   └── caption_generator.py   Gemini API + system_instruction + vision
│   └── seed.py                 inserts 暖暖豬 demo persona
└── frontend/
    └── src/
        ├── pages/              CaptionStudio, Personas
        ├── components/
        └── api/                typed client
```
