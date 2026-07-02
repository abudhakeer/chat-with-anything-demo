# Chat with Anything — Product Requirements Document

**Version:** 1.1  
**Status:** Finalized  
**Owner:** Abu Abdullah  
**Target:** Portfolio demo (ship in 1–2 days of focused work)  
**Stack:** Cloudflare-only — single Worker (assets + API), R2, AI Search, D1, Workers AI, KV, Cron Triggers

---

## 1. Summary

**Chat with Anything** is a lightweight web demo where a user uploads a document (PDF, image, or office file), previews it on the left, and chats with it on the right. The original product was built in ~2023 with LangChain, Python on Railway, and Supabase for everything. This rebuild is a **2026 edge-native version** using Cloudflare managed RAG (AI Search) instead of a custom chunk/embed pipeline.

**Portfolio narrative:** Same product vision; modern stack; demonstrates judgment about when *not* to build custom RAG.

---

## 2. Goals

| Goal | Success metric |
|------|----------------|
| Ship a live demo link | Public URL on `*.workers.dev` or custom domain |
| End-to-end on Cloudflare | No Supabase, Vercel, Railway, or LangChain |
| Upload → preview → chat flow | < 3 clicks from landing to first question |
| Honest scope | Works reliably for demo-sized files |
| Resume-ready case study | README + screenshots + architecture diagram |

---

## 3. Non-goals (v1)

- User accounts / login
- Multi-document workspaces
- Custom RAG pipeline (Vectorize, Queues, manual chunking)
- Billing, teams, sharing links
- Production-grade PPT layout preservation
- Mobile app
- 100% offline / air-gapped deployment

---

## 4. User personas

**Primary:** Recruiter or hiring manager skimming portfolio — wants to see the flow in 60 seconds.

**Secondary:** Engineer evaluating edge AI architecture — reads README and wrangler config.

---

## 5. User flows

### 5.1 Happy path

```
Landing (/)
  → drag-and-drop or pick file (PDF / image / TXT / DOC)
  → upload progress bar
  → "Indexing document…" (poll until ready)
  → redirect to /chat/:docId
  → left: file preview | right: chat
  → user asks question → streamed answer
  → optional: click suggested prompt chips
```

### 5.2 Error paths

| Situation | UX |
|-----------|-----|
| Unsupported file type | Inline error before upload |
| File too large | Inline error with max size stated |
| Indexing timeout (>2 min) | Retry button + link back home |
| Chat API failure | Toast + "Try again" |
| Empty question | Disable send button |

### 5.3 Demo shortcuts (portfolio polish)

- 1–2 **sample documents** on landing (pre-indexed) — "Try without uploading"
- 3 **suggested prompts** on chat page: Summarize, Key points, Find specific topic

---

## 6. Supported file types (v1)

**v1 scope is deliberately narrow — three formats, two distinct pipelines.** DOC/PPT are cut from v1 (see below) because they'd need a fourth preview mode with a materially worse UX (blank/loading preview until indexing finishes), for no portfolio payoff.

| Type | Extensions | Preview | Processing pipeline |
|------|------------|---------|---------------------|
| PDF | `.pdf` | iframe, available immediately | **Text pipeline** — AI Search (Items API) |
| Plain text | `.txt`, `.md` | rendered text, available immediately | **Text pipeline** — AI Search (Items API) |
| Image | `.png`, `.jpg`, `.jpeg`, `.webp` | `<img>`, available immediately | **Vision pipeline** — Workers AI vision, direct, no indexing |

**Two pipelines, not one with a fallback:**

- **Text pipeline** (PDF/TXT/MD): indexed into AI Search, chat answered via `chatCompletions()` — retrieval-grounded.
- **Vision pipeline** (images): never touches AI Search. Image goes straight to a Workers AI vision model as part of the chat call. No "indexing" step, no `indexing` status wait — status goes straight from `uploading` to `ready`.

This split removes ambiguity from implementation: the chat endpoint routes on the document's pipeline type, not on a "try AI Search, fall back if weak" heuristic.

**Out of scope for v1 (future work):** DOC/DOCX, PPT/PPTX. Revisit if there's time after core flow + polish is done.

**Hard limits (v1):**

- Max file size: **20 MB**
- Max pages (PDF): **50** (warn in UI; no hard block unless API fails)
- One active document per chat session

---

## 7. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Worker (Hono) — single deploy                   │
│  - Serves static frontend assets (assets binding)            │
│  - REST/SSE API: upload, status, chat, preview URL           │
└────────────┬────────────────────────────────────────────────┘
             │
   ┌─────────┼─────────┬─────────────┬─────────────┐
   ▼         ▼         ▼             ▼             ▼
  R2        D1     AI Search      Workers AI       KV
(files)  (metadata) (text RAG+   (image vision;  (rate limit
          +expiry)   chat engine   underlies AI     counters)
                     internally)   Search chat)

Cron Trigger (daily) → sweeps expired docs → deletes R2 + D1 + AI Search instance
```

### 7.1 Component responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Worker** | HTTP API, routing chat by pipeline type (text vs. vision), rate limiting, orchestration, Cron handler |
| **R2** | Raw file storage; signed URLs for preview (all types) |
| **D1** | Document records: id, filename, mime, pipeline, r2Key, aiSearchInstanceId, status, expiresAt |
| **AI Search** | Text pipeline only (PDF/TXT/MD): indexing + `chatCompletions()` retrieval-grounded answers |
| **Workers AI** | Vision pipeline (images): direct vision chat call. Also the underlying model AI Search uses internally for text generation — not a separate "fallback" for text, just noted for accuracy in the README |
| **KV** | Upload rate-limit counters (per-IP, sliding window) |
| **Static UI** | React + Vite build, served by the same Worker via `assets` binding — no separate Pages project |

**Note on the diagram:** Workers AI is not a fallback path for text chat — AI Search's `chatCompletions()` runs on Workers AI models internally. The only place Workers AI is called *directly* by our code is the image/vision pipeline.

### 7.2 Ingestion pipeline — finalized

**Decision: Items API direct upload, not R2-bucket-watch indexing.** R2-source AI Search instances re-crawl on a periodic cycle (historically hours) — far too slow for "upload → chat immediately." We push content into AI Search explicitly via the Items API at upload-complete time. R2 remains the source of truth for **preview** only; the copy indexed by AI Search is a separate explicit push.

**Text pipeline (PDF/TXT/MD) — one AI Search instance per document:**

1. On upload complete → `env.AI_SEARCH.create({ id: doc_<uuid> })`
2. Push file into that instance via the **Items API** (not R2-source watching)
3. Poll (server-side, exposed via `/status`) until the instance reports the item indexed — exact signal to be confirmed in the pre-build spike (§17, Issue #5)
4. Chat queries scoped to `instance_ids: [doc_<uuid>]` via `chatCompletions()`

**Fallback (only if the spike reveals quota or latency problems with per-doc instances):** Single shared AI Search instance + search filtered by file-key metadata per query, instead of one instance per upload.

**Image pipeline — no AI Search involvement:**

1. On upload complete → status goes straight to `ready` (no indexing wait)
2. Chat call passes the image (from R2) directly to a Workers AI vision model alongside the user's question

### 7.3 Data retention (firm v1 requirement, not optional)

Public, unauthenticated demo + real uploaded documents = real privacy/cost exposure if left unbounded. **v1 ships with automatic 24-hour deletion:**

- Every document gets `expiresAt = createdAt + 24h` in D1
- A **Cron Trigger** (daily, or hourly for tighter bounds) runs a Worker handler that finds expired rows and deletes: R2 object, AI Search instance (text pipeline only), and the D1 row
- UI states this in copy near the upload zone: *"Uploads are automatically deleted after 24 hours."* — a trust signal, and it reads well in the portfolio case study as a deliberate decision, not an oversight

### 7.4 Reference project

Patterns borrowed from **makthaba-ui** (`/Users/abuabdullah/Documents/makthaba-ui`):

- R2 presigned upload flow (`utils/r2-direct-upload.ts`)
- Worker wrangler bindings structure (`workers/ai-engine/wrangler.jsonc`)

**Not ported:** Vectorize pipeline, Queues, D1 corpus tables, Supabase, Gemini.

---

## 8. API specification

Base path: `/api/v1`

### 8.1 `POST /api/v1/documents`

Create document + return upload instructions.

**Request:** `multipart/form-data` OR JSON presign flow

**Presign flow (preferred):**

1. `POST /api/v1/documents/presign` — `{ fileName, contentType, size }`
2. Client `PUT` to R2 signed URL
3. `POST /api/v1/documents/:id/complete` — finalize + start indexing

**Response:**

```json
{
  "id": "doc_abc123",
  "status": "uploading",
  "uploadUrl": "https://...",
  "r2Key": "uploads/doc_abc123/report.pdf"
}
```

### 8.2 `GET /api/v1/documents/:id`

**Response:**

```json
{
  "id": "doc_abc123",
  "fileName": "report.pdf",
  "mimeType": "application/pdf",
  "status": "indexing | ready | failed",
  "previewUrl": "https://...signed...",
  "createdAt": "2026-07-02T12:00:00Z",
  "error": null
}
```

### 8.3 `POST /api/v1/documents/:id/chat`

Worker routes internally based on the document's `pipeline` field (`text` → AI Search `chatCompletions`, `vision` → direct Workers AI vision call). Client doesn't need to know which pipeline is used.

**Request:**

```json
{
  "message": "What are the key risks?",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Constraint:** `history` is capped at the **last 10 turns**; client truncates before sending. Prevents unbounded token/cost growth on long demo conversations. No server-side persistence of history in v1.

**Response:** `text/event-stream` (SSE) — streamed tokens. If streaming from `chatCompletions()` turns out not to work cleanly (to be confirmed in the pre-build spike), fallback is a single non-streamed response with a client-side simulated typing effect — decide this during the spike, not mid-build.

```
data: {"type":"token","content":"The"}
data: {"type":"token","content":" key"}
data: {"type":"done"}
```

### 8.4 `GET /api/v1/documents/:id/status`

Lightweight poll endpoint for indexing progress (returns `{ status, progress? }`).

### 8.5 `GET /api/v1/health`

`{ "ok": true }` for deploy smoke test.

---

## 9. Data model (D1)

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  pipeline TEXT NOT NULL,
  -- 'text' (PDF/TXT/MD, via AI Search) | 'vision' (image, direct Workers AI)
  ai_search_instance_id TEXT,
  -- null for pipeline='vision'
  status TEXT NOT NULL DEFAULT 'uploading',
  -- uploading | indexing | ready | failed
  -- vision pipeline skips 'indexing' entirely: uploading -> ready
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
  -- created_at + 24h, used by the cleanup Cron Trigger
);

CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created ON documents(created_at);
CREATE INDEX idx_documents_expires ON documents(expires_at);
```

**Chat history:** In-memory on client for v1 (send `history` array). Optional D1 `messages` table in v2.

---

## 10. UI requirements

### 10.1 Landing page `/`

- Hero: title, one-line description, architecture badge ("Built on Cloudflare")
- Drag-and-drop zone with file type + size hints
- Upload progress
- Sample doc buttons (optional, post-MVP within v1 if time)
- Minimal, portfolio-quality design (dark or clean light — pick one)

### 10.2 Chat page `/chat/:docId`

**Desktop:** 50/50 split — preview | chat  
**Mobile:** tabs — Preview | Chat

**Preview panel:**

- PDF → iframe with signed R2 URL
- Image → img tag
- Text → monospace pre block

**Chat panel:**

- Message list (user right, assistant left)
- Streaming cursor while generating
- Input + send
- Suggested prompt chips
- Header: filename, back link

### 10.3 States

| State | UI |
|-------|-----|
| `uploading` | Progress bar |
| `indexing` | Spinner + "Analyzing your document…" |
| `ready` | Enable chat input |
| `failed` | Error message + retry |

---

## 11. Security & abuse (demo-grade)

- No auth — acceptable for portfolio. Accepted risk: doc access is obscurity-via-UUID (`docId`), not real access control. Mitigated by the 24h auto-delete (§7.3) bounding exposure window.
- **Turnstile** on upload endpoint (skip for v1; add only if abuse is observed post-launch)
- Rate limit: 10 uploads / IP / hour — **KV counter**, sliding window (not D1 — D1 isn't suited to hot per-request counters)
- Validate file extension + `content-type` server-side (magic-byte sniffing is a stretch goal, not required for v1)
- R2 objects private — preview via short-lived signed URLs only
- No secrets in client bundle

---

## 12. Environment & secrets

| Variable | Where | Purpose |
|----------|-------|---------|
| `CLOUDFLARE_ACCOUNT_ID` | wrangler | Deploy |
| R2 bucket binding | wrangler | File storage |
| D1 binding | wrangler | Metadata |
| `ai_search_namespaces` binding | wrangler | Text pipeline: RAG + chat |
| `ai` binding | wrangler | Vision pipeline: direct image chat |
| KV namespace binding | wrangler | Upload rate-limit counters |
| Cron Trigger | wrangler `triggers.crons` | Daily expired-document cleanup |
| `AI_SEARCH_NAMESPACE` | var | default namespace name |

No `.env` secrets required for v1 unless using Turnstile.

---

## 13. Wrangler bindings (target)

```jsonc
{
  "name": "chat-with-anything",
  "main": "src/worker/index.ts",
  "compatibility_date": "2026-03-27",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": "./dist", "binding": "ASSETS" },
  "r2_buckets": [{ "binding": "BUCKET", "bucket_name": "chat-with-anything-files" }],
  "d1_databases": [{ "binding": "DB", "database_name": "chat-with-anything", "migrations_dir": "migrations" }],
  "ai": { "binding": "AI" },
  "ai_search_namespaces": [{
    "binding": "AI_SEARCH",
    "namespace": "default",
    "remote": true
  }],
  "kv_namespaces": [{ "binding": "RATE_LIMIT", "id": "<kv-namespace-id>" }],
  "triggers": { "crons": ["0 3 * * *"] }
}
```

---

## 14. Tech choices

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Worker framework | **Hono** | Small, typed, good SSE support |
| Frontend | **React + Vite** | Familiar; static export to Worker assets |
| Styling | **Tailwind CSS** | Fast polish |
| Chat streaming | **SSE from Worker** | No WebSocket complexity for demo |
| Package manager | **pnpm** | Fast, modern |
| Deploy | **wrangler deploy** | Single command |

---

## 15. Acceptance criteria (v1 done)

- [ ] User can upload a PDF ≤20MB and reach chat page
- [ ] PDF preview renders in left panel
- [ ] User can ask a question and see streamed (or simulated-stream) answer grounded in document
- [ ] Indexing state shown with poll until `ready` (text pipeline); image pipeline skips straight to `ready`
- [ ] Uploaded documents are auto-deleted 24h after creation (Cron Trigger verified working)
- [ ] Deployed to Cloudflare with public URL
- [ ] README: architecture diagram, setup steps, case study paragraph, honest note on AI Search being a recent/evolving API
- [ ] No external backend services in production path
- [ ] `wrangler dev` works locally with `remote: true` on AI Search

---

## 16. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Per-doc instance creation/indexing latency or quota unverified | **Pre-build spike (Issue #5)** before any app code depends on it; documented fallback to shared-instance + metadata filter |
| Ingestion mode ambiguity (R2-watch vs. Items API) | Resolved: Items API direct upload only, stated explicitly in §7.2 |
| `chatCompletions()` streaming behavior unverified | Confirmed/falsified in the same spike; fallback is non-streamed response + client-side simulated typing |
| Per-doc instance API changes | Pin `compatibility_date`; check CF changelog before deploy |
| Workers AI quality vs Claude | Acceptable for demo; note in README |
| Unbounded R2/AI Search growth, privacy exposure on public demo | Resolved: firm 24h auto-delete via Cron Trigger (§7.3), not optional |
| Local dev needs remote AI Search | `remote: true` on binding |

---

## 17. Implementation phases & GitHub issues

Issues are ordered for sequential implementation. Each issue = one PR-worthy unit of work. **12 issues total** (was 10 — added a pre-build spike and a dedicated retention issue after PRD review).

---

### Issue #1 — Project scaffold & tooling

**Title:** `chore: scaffold Cloudflare Worker + React monorepo`

**Scope:**
- Init repo: pnpm, TypeScript, ESLint
- Vite React app in `src/ui/`
- Worker entry in `src/worker/`
- Hono router skeleton
- `wrangler.jsonc` with placeholder bindings
- Scripts: `dev`, `build`, `deploy`, `typecheck`
- `.gitignore`, `README.md` stub

**Acceptance:** `pnpm dev` serves UI; `wrangler dev` starts Worker.

---

### Issue #2 — D1 schema & document model

**Title:** `feat: add D1 migrations and document repository`

**Scope:**
- `migrations/0001_init.sql`
- Typed D1 helpers: `createDocument`, `getDocument`, `updateDocumentStatus`
- Wire `DB` binding in Worker

**Acceptance:** Unit-testable repo functions; migration applies via `wrangler d1 migrations apply`.

---

### Issue #3 — R2 storage & presigned upload

**Title:** `feat: implement R2 presigned upload API`

**Scope:**
- `POST /api/v1/documents/presign`
- `POST /api/v1/documents/:id/complete`
- R2 key convention: `uploads/{docId}/{fileName}`
- Port upload pattern from makthaba-ui (client XHR PUT)
- File type + size validation

**Acceptance:** File lands in R2; D1 row created with `status: uploading → indexing`.

---

### Issue #4 — Landing page & upload UI

**Title:** `feat: build landing page with drag-and-drop upload`

**Scope:**
- `/` route in React app
- Dropzone component with progress
- Calls presign → PUT → complete flow
- Redirect to `/chat/:docId` on success
- Error states

**Acceptance:** Manual test upload from browser to R2.

---

### Issue #5 — Spike: verify AI Search runtime behavior

**Title:** `spike: verify AI Search per-instance creation, indexing latency, and streaming`

**Why this exists:** Per-doc AI Search instances (runtime `create()`) and `chatCompletions()` streaming are both recently-shipped, thinly-documented APIs. This spike de-risks the two biggest unknowns in the whole plan **before** any app code depends on them. No PR to main required — findings get written up as a short note (in this doc or a scratch file) and inform Issue #6.

**Scope (manual/scripted verification, not production code):**
- Create one AI Search instance via `create()` in a throwaway Worker or via dashboard/API
- Push one test document via the **Items API**; time how long until content is searchable
- Identify the actual "done indexing" signal available (status field vs. poll-`search()`-until-non-empty)
- Call `chatCompletions()` with `stream: true` (or equivalent); confirm whether it streams cleanly through a Worker
- Check account-level limits on number of AI Search instances (dashboard or docs)

**Acceptance:** Written findings answering: (1) indexing latency, (2) reliable ready-signal, (3) streaming works Y/N, (4) instance quota. These findings decide whether Issue #6 uses per-doc instances as planned or falls back to the shared-instance + metadata-filter approach from §7.2.

**Depends on:** #1 (needs a deployed Worker + Cloudflare account access, not the full app)

---

### Issue #6 — AI Search integration & indexing (text pipeline)

**Title:** `feat: wire AI Search indexing for PDF/TXT/MD documents`

**Scope:**
- Create AI Search instance on upload complete (per findings from #5)
- Push file into instance via **Items API** (not R2-source watching — confirmed in §7.2)
- `GET /api/v1/documents/:id/status` poll endpoint using the real ready-signal from #5
- Update D1 `status` → `ready | failed`, store `ai_search_instance_id`
- Applies only to `pipeline = 'text'` documents (PDF/TXT/MD)

**Acceptance:** After upload, status transitions to `ready`; test `search()` returns relevant chunks for a known query.

**Depends on:** #3, #5

---

### Issue #7 — Image chat via Workers AI vision (vision pipeline)

**Title:** `feat: implement direct vision chat for image uploads`

**Scope:**
- Images (`pipeline = 'vision'`) skip AI Search entirely
- Status goes `uploading` → `ready` immediately (no indexing wait)
- Chat call passes image bytes/URL from R2 directly to a Workers AI vision model alongside the user's question
- No fallback branching — this is the only path for images

**Acceptance:** Upload a PNG/JPG, ask a question about its visual content, get a relevant answer with no indexing delay.

**Depends on:** #3

---

### Issue #8 — Chat API with streaming

**Title:** `feat: implement streaming chat endpoint routing by pipeline`

**Scope:**
- `POST /api/v1/documents/:id/chat`
- Routes internally: `pipeline='text'` → AI Search `chatCompletions()` scoped to doc instance; `pipeline='vision'` → Workers AI vision call from #7
- SSE stream to client (or non-streamed + simulated typing if #5 found streaming unreliable)
- Client `history` truncated server-side to last 10 turns
- Default text model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`

**Acceptance:** curl or browser receives an answer (streamed or simulated) for both a text-pipeline doc and a vision-pipeline image.

**Depends on:** #6, #7

---

### Issue #9 — Chat page UI

**Title:** `feat: build split-view chat page with preview panel`

**Scope:**
- `/chat/:docId` route
- Poll indexing until ready (text pipeline only — vision is immediate)
- Preview: PDF iframe / image / text
- Chat: message list, input, SSE consumer
- Suggested prompt chips
- Mobile tabs layout

**Acceptance:** Full happy path in browser for both a PDF and an image.

**Depends on:** #4, #8

---

### Issue #10 — Data retention: 24h auto-delete

**Title:** `feat: add Cron Trigger for automatic document expiry`

**Scope:**
- `expires_at` column already in D1 schema (§9) — set on document creation (`createdAt + 24h`)
- Cron Trigger (daily) invokes a Worker handler that queries expired rows
- Deletes: R2 object, AI Search instance (text pipeline only, skip for vision docs), D1 row
- UI copy near upload zone: "Uploads are automatically deleted after 24 hours"
- Basic upload rate limiting via KV (10/IP/hour), moved here from old Issue #8 scope

**Acceptance:** Manually insert a document with a past `expires_at`, trigger the cron handler, verify R2 + AI Search + D1 are all cleaned up. Rate limit rejects the 11th upload from the same IP within an hour.

**Depends on:** #2, #3, #6

---

### Issue #11 — Sample documents & demo polish

**Title:** `feat: add pre-indexed sample docs and portfolio polish`

**Scope:**
- 2 sample docs in R2 (pre-indexed at deploy or seed script) — exempt from the 24h expiry sweep
- "Try a sample" buttons on landing
- Loading skeletons, favicon, meta tags
- Light design pass

**Acceptance:** Recruiter can try demo without uploading.

**Depends on:** #9

---

### Issue #12 — Deploy, README & case study

**Title:** `docs: production deploy and portfolio README`

**Scope:**
- `wrangler deploy` to production
- README: setup, env, architecture diagram (updated two-pipeline model), case study, honest note on AI Search API maturity
- Screenshots in `docs/images/`
- Health check documented

**Acceptance:** Public URL shared; README complete.

**Depends on:** #10, #11

---

## 18. Suggested commit / branch strategy

```
main (protected)
  └── issue/1-scaffold
  └── issue/2-d1-schema
  └── ...
```

One issue → one branch → one PR → squash merge. Commit message format:

```
feat(upload): add R2 presigned upload API

Refs #3
```

---

## 19. Decisions (finalized after PRD review)

| # | Question | Decision |
|---|----------|----------|
| 1 | Per-doc AI Search instance vs shared instance? | **Per-doc**, pending spike (#5) confirmation; shared+filtered is the documented fallback |
| 2 | React vs vanilla UI? | **React + Vite** |
| 3 | Custom domain or workers.dev? | **workers.dev** for v1 |
| 4 | Store chat history server-side? | **Client-only**, capped at last 10 turns sent per request |
| 5 | Turnstile in v1? | **Skip** unless abuse seen |
| 6 | Ingestion mode? | **Items API direct upload**, not R2-bucket-watch |
| 7 | Image handling? | **Bypass AI Search entirely** — direct Workers AI vision, own pipeline |
| 8 | Data retention? | **Firm 24h auto-delete** via Cron Trigger — not optional |
| 9 | Rate-limit storage? | **KV**, not D1 |
| 10 | DOC/PPT in v1? | **Cut** — future work only |

---

## 20. Appendix — case study draft (for README)

> **Chat with Anything** (2023 concept → 2026 demo)  
> Originally scoped when GPT-4's context window forced custom RAG: LangChain chunking, Python on Railway, Supabase as vector store. The product never launched.  
> This demo rebuilds the same UX — upload any document, preview it, chat — entirely on Cloudflare: R2 for files, AI Search for managed retrieval, Workers AI for generation. No custom embedding pipeline. Same product thinking, fraction of the infrastructure.

---

*PRD finalized after senior-engineer review (v1.1). Next step: create the 12 GitHub issues from Section 17, then implement Issue #1.*
