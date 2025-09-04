# Garden of You — Design Documentation



## 1) Product Overview
**Elevator pitch.** A journaling web app that turns your writing into a visual "garden" and surface-level analytics, with optional AI‑assisted weekly summaries. Core flows: write → analyze → visualize → reflect.

**Primary users.** Individuals who journal regularly and want light insights, reflection prompts, and an engaging visualization.

**Goals.**
- Make journaling feel rewarding (garden growth + prompts).
- Provide simple, transparent insights (themes, mood, frequency).
- Encourage longitudinal reflection ("Reflect" and saved reflections).


---

## 2) System Architecture (High Level)
**Client (Web UI).** Static HTML + Tailwind CSS + vanilla JS. Renders sections (Journal, Garden, Insights, Reflect, Reflections). Fetches data from Flask API.

**Server (API).** Flask app (CORS-enabled) serving JSON endpoints for entries, analytics, reflection, and AI summaries.

**Data Store.** MongoDB with explicit indexes for common queries and weekly summaries collection.

**AI & Analytics.**
- Sentiment: VADER + TextBlob combined score → emotion bucket.
- Themes: lightweight keyword scoring across curated taxonomies.
- Summarization: extractive (regex/sentence length heuristic).
- Weekly AI summary (optional): OpenAI Chat Completions given week’s entries.

**Security/Privacy (current stance).**
- No auth yet (uses `userId` passed by client; defaults to `default_user`).
- Server-side HTML escaping on input (`html.escape`) to mitigate XSS in stored text.
- OpenAI usage gated by API key; summaries cached for 24h.

**Observability.** Python logging + `/healthz` ping (DB connectivity + timestamp).

---

## 3) Tech Stack
**Frontend:** HTML, TailwindCSS, Vanilla JS.

**Backend:** Python 3, Flask, flask_cors, flask_pymongo, python‑dotenv.

**NLP:** NLTK VADER, TextBlob (polarity), simple regex-based summarizer.

**DB:** MongoDB 7.x (local or hosted). Collections: `entries`, `weekly_summaries`.

**Infra (dev):** Single Flask process, default port 5000. `.env` for `MONGODB_URI`, `OPENAI_API_KEY`, etc.

---

## 4) Data Model (Essential Fields)
**Entry (`entries`).**
- `userId: string`
- `text: string` (HTML-escaped)
- `createdAt: datetime`
- `sentiment: float` (−1..1), `emotion: enum`, `confidence: float`
- `summary: string`
- `themes: [string]`
- `isReflection: bool` (default false)
- `originalEntryId: ObjectId|null`

**Weekly Summary (`weekly_summaries`).**
- `userId: string`
- `weekStart: datetime`, `weekEnd: datetime`
- `generatedAt: datetime`
- `summary: string`
- `entryCount: int`, `avgSentiment: float`, `topThemes: [string]`

**Indexes.**
- `entries`: `[(userId,1),(createdAt,-1)]`, `[(themes,1)]`, `[(sentiment,1)]`, `[(userId,1),(createdAt,-1),(sentiment,1)]`, `[(userId,1),(isReflection,1),(createdAt,-1)]`, `[(originalEntryId,1)]`
- `weekly_summaries`: `[(userId,1),(generatedAt,-1)]`

---

## 5) API Surface (Current)
**Prompts**
- `GET /api/prompt` → `{ prompt, timestamp }`

**Entries**
- `POST /api/entries` → create analyzed entry (validates, escapes HTML; attaches sentiment/themes/summary)
- `GET /api/entries?userId=&limit=&skip=` → paginated list (newest first)

**Insights & Visualization**
- `GET /api/insights?userId=&period=weekly|monthly` → `{avgSentiment, themeCounts, insights, ...}`
- `GET /api/garden?userId=` → aggregated theme counts + stage mapping (seedling/sprouting/growing/blooming)

**Reflection**
- `GET /api/reflect?userId=&exclude=ID[,ID]` → random past entry (older than 1h in dev) + reflection prompt
- `GET /api/reflections?userId=&limit=&skip=` → recent reflection entries (with nested original entry if available)

**AI Weekly Summary**
- `GET /api/weekly-summary?userId=` → generates & stores 1 summary per 24h window (requires `OPENAI_API_KEY`)
- `GET /api/weekly-summaries?userId=&limit=&skip=` → past summaries

**Health**
- `GET /healthz` → DB ping + version

---

## 6) UX Notes
- **Journal**: prompt → textarea → POST → list of recent entries (expand for full text/originals).
- **Garden**: theme → plant metaphor, stage thresholds (2/5/10) drive progress bar + sparkle on bloom.
- **Insights**: mood dial, top themes, simple advanced stats.
- **Reflect**: pulls an older entry + rotating prompts → user writes a reflection (saved as an entry).

---

## 7) Setup (Dev)
1. **Prereqs:** Python 3.10+, MongoDB running; `pip install -r requirements.txt`.
2. **Env:** `.env` with `MONGODB_URI`, `FLASK_DEBUG=true`, (optional) `OPENAI_API_KEY`.
3. **Run:** `python app.py` (starts on :5000). Visit `/` for UI; `/healthz` for status.

---

## 8) Testing Strategy (Lean)
- **Unit:** theme extractor, summarizer, sentiment combiner.
- **API smoke:** health, entries CRUD happy path, insights aggregation.
- **Manual:** UI flows for Journal/Garden/Reflect.

---

## 9) Risks & Tradeoffs
- **No auth** → multi‑user data separation relies on client‑supplied `userId` (spoofable).
- **Keyword themes** → fast & transparent but brittle to phrasing.
- **OpenAI dependency** → rate/latency/cost; mitigated by daily cache.
- **TextBlob/VADER** → English‑centric; sarcasm/nuance limits.

---

## 10) Future Enhancements (Prioritized)
**Security & Accounts**
- Add auth (JWT session or OAuth), per‑user collections/tenant keys.
- Server-side rate limiting, input size guardrails (already capped at 10k chars), audit logs.

**Data & Analytics**
- Replace keyword themes with lightweight ML (zero‑shot or small classifier).
- Topic modeling per user; streaks & frequency heatmap; time‑of‑day trends.
- Per‑entry word count + richer readability metrics.

**AI & Summaries**
- Upgrade to function‑called structured summaries (bullets, wins, challenges, next actions).
- Per‑entry micro‑tips; privacy‑preserving local models where feasible.

**UX & Access**
- Offline-first PWA; mobile layout polish; editor with markdown.
- Inline theme editing (client already has modal shell) with PATCH endpoint.
- Accessibility pass (focus states, aria, contrast, reduced motion).

**Ops & Quality**
- Dockerfile + Compose (app + Mongo).
- CI: lint, test, type-check; CD to Render/Vercel proxy/GCP.
- Metrics (Prometheus exporter) + structured logs.

---

## 11) Roadmap (Lean)
- **MVP (now)**: entries, garden, insights, reflect, weekly summary (if key present).
- **v1**: auth + per-user isolation; PATCH for themes/sentiment edits; export (JSON/CSV).
- **v1.1**: PWA + offline; ML themes; improved insights dashboards.

---

## 12) Appendix — Design Choices (Why)
- **Vanilla JS UI** keeps footprint tiny and deploy simple for a hackathon.
- **Keyword themes** offer understandable, deterministic behavior vs opaque LLM topic tags.
- **Mongo aggregation** powers garden without heavy compute; indexes cover common scans.
- **24h summary cache** avoids accidental LLM spamming, saves cost.
```
