# GitHub Issues — Chat with Anything (v1.1, finalized)

Copy each block into a GitHub issue. Labels: `epic`, `feature`, `chore`, `spike`, `docs`.

**Milestone:** `v1.0 — Portfolio Demo`

12 issues total. See `docs/PRD.md` §17 for full rationale on the two-pipeline (text vs. vision) split and the pre-build spike.

---

## #1 chore: scaffold Cloudflare Worker + React monorepo

**Labels:** `chore`, `infrastructure`

### Description
Bootstrap the repo with Worker + React (Vite), Hono, wrangler, TypeScript, and dev scripts.

### Tasks
- [ ] Init pnpm workspace / single package
- [ ] `src/worker/index.ts` — Hono app skeleton
- [ ] `src/ui/` — Vite React app
- [ ] `wrangler.jsonc` — bindings placeholders (R2, D1, AI, ai_search_namespaces, KV, crons)
- [ ] Scripts: `dev`, `build`, `deploy`, `typecheck`
- [ ] `.gitignore`, README stub

### Acceptance criteria
- `pnpm dev` runs UI dev server
- `wrangler dev` starts Worker
- TypeScript strict mode passes

---

## #2 feat: add D1 migrations and document repository

**Labels:** `feature`, `backend`

### Description
D1 schema for document metadata and typed repository helpers. Schema includes `pipeline` (text/vision) and `expires_at` for the 24h retention policy.

### Tasks
- [ ] `migrations/0001_init.sql` (see PRD §9 for exact schema)
- [ ] Document types + repository module: `createDocument`, `getDocument`, `updateDocumentStatus`, `findExpiredDocuments`
- [ ] Wire `DB` binding in Worker env types

### Acceptance criteria
- `wrangler d1 migrations apply` succeeds
- CRUD helpers for documents work in Worker context

**Depends on:** #1

---

## #3 feat: implement R2 presigned upload API

**Labels:** `feature`, `backend`

### Description
Upload flow: presign → client PUT → complete. Pattern from makthaba-ui.

### Tasks
- [ ] `POST /api/v1/documents/presign`
- [ ] `POST /api/v1/documents/:id/complete` — sets `pipeline` based on mime type, sets `expires_at`
- [ ] R2 key: `uploads/{docId}/{fileName}`
- [ ] Validate extension + content-type + size (20MB max); PDF/TXT/MD/PNG/JPG/JPEG/WEBP only
- [ ] D1 row lifecycle: `uploading` → `indexing` (text) or `uploading` → `ready` (vision)

### Acceptance criteria
- File stored in R2 via browser upload
- D1 document record created with correct `pipeline` value

**Depends on:** #2

---

## #4 feat: build landing page with drag-and-drop upload

**Labels:** `feature`, `frontend`

### Description
Landing page with file dropzone and upload progress.

### Tasks
- [ ] Dropzone component (restrict to PDF/TXT/MD/PNG/JPG/JPEG/WEBP)
- [ ] Presign → XHR PUT → complete flow
- [ ] Progress bar + error states
- [ ] Redirect to `/chat/:docId` on success
- [ ] Copy near dropzone: "Uploads are automatically deleted after 24 hours"

### Acceptance criteria
- End-to-end upload from browser works

**Depends on:** #3

---

## #5 spike: verify AI Search runtime behavior

**Labels:** `spike`, `backend`, `ai`

### Description
De-risk the two biggest unknowns before building on top of them: per-document AI Search instance creation/indexing latency, and `chatCompletions()` streaming. No production code required — findings inform #6 and #8.

### Tasks
- [ ] Create one AI Search instance via runtime `create()`
- [ ] Push one test doc via Items API; time until searchable
- [ ] Identify the real "indexed/ready" signal (status field vs. poll-`search()`)
- [ ] Test `chatCompletions()` with streaming; confirm it works cleanly through a Worker
- [ ] Check account-level AI Search instance quota (dashboard/docs)
- [ ] Write up findings (in PRD or a scratch doc)

### Acceptance criteria
- Written answers to: indexing latency, ready-signal, streaming Y/N, instance quota
- Decision made: per-doc instances as planned, or fall back to shared-instance + metadata-filter

**Depends on:** #1

---

## #6 feat: wire AI Search indexing for PDF/TXT/MD documents

**Labels:** `feature`, `backend`, `ai`

### Description
Text pipeline indexing, informed by #5 findings. Items API direct upload only — not R2-bucket-watch.

### Tasks
- [ ] Create AI Search instance on upload complete (`pipeline = 'text'` docs only)
- [ ] Push file via Items API
- [ ] `GET /api/v1/documents/:id/status` using the real ready-signal from #5
- [ ] Update D1 `status` → `ready | failed`, store `ai_search_instance_id`

### Acceptance criteria
- Upload transitions to `ready`
- Test `search()` returns relevant chunks for a known query

**Depends on:** #3, #5

---

## #7 feat: implement direct vision chat for image uploads

**Labels:** `feature`, `backend`, `ai`

### Description
Vision pipeline — images never touch AI Search. Direct Workers AI vision call only.

### Tasks
- [ ] `pipeline = 'vision'` docs: status `uploading` → `ready` immediately, no indexing step
- [ ] Chat call passes image (from R2) directly to Workers AI vision model + user question
- [ ] No fallback branching — this is the only image code path

### Acceptance criteria
- Upload PNG/JPG, ask about visual content, get relevant answer, zero indexing delay

**Depends on:** #3

---

## #8 feat: implement streaming chat endpoint routing by pipeline

**Labels:** `feature`, `backend`, `ai`

### Description
Single chat endpoint that routes internally by document pipeline type.

### Tasks
- [ ] `POST /api/v1/documents/:id/chat`
- [ ] Route: `text` → AI Search `chatCompletions()`; `vision` → Workers AI vision call
- [ ] SSE stream (or non-streamed + simulated typing, per #5 findings)
- [ ] Truncate client `history` to last 10 turns server-side

### Acceptance criteria
- Answer received (streamed or simulated) for both a text doc and an image

**Depends on:** #6, #7

---

## #9 feat: build split-view chat page with preview panel

**Labels:** `feature`, `frontend`

### Description
Chat UI with document preview — core product screen.

### Tasks
- [ ] `/chat/:docId` route
- [ ] Indexing poll UI (text pipeline only; vision skips straight to ready)
- [ ] Preview: PDF iframe, image, text
- [ ] Chat messages + SSE consumer
- [ ] Suggested prompts
- [ ] Mobile tab layout

### Acceptance criteria
- Full upload → preview → chat flow in browser for both a PDF and an image

**Depends on:** #4, #8

---

## #10 feat: add Cron Trigger for automatic document expiry

**Labels:** `feature`, `backend`, `infrastructure`

### Description
Firm v1 requirement: 24h auto-delete for privacy and cost bounding. Also includes upload rate limiting via KV.

### Tasks
- [ ] Cron Trigger (daily) → Worker handler finds rows past `expires_at`
- [ ] Deletes R2 object, AI Search instance (text pipeline only), D1 row
- [ ] Upload rate limit: 10/IP/hour via KV counter

### Acceptance criteria
- Manually-expired document is fully cleaned up (R2 + AI Search + D1) after cron run
- 11th upload from same IP within an hour is rejected

**Depends on:** #2, #3, #6

---

## #11 feat: add pre-indexed sample docs and demo polish

**Labels:** `feature`, `frontend`

### Description
Portfolio polish — try without uploading.

### Tasks
- [ ] Seed 2 sample docs (R2 + pre-indexed), exempt from expiry sweep
- [ ] "Try a sample" on landing
- [ ] Loading skeletons, favicon, meta tags
- [ ] Design pass

### Acceptance criteria
- Demo works without user upload

**Depends on:** #9

---

## #12 docs: production deploy and portfolio README

**Labels:** `docs`, `infrastructure`

### Description
Ship it.

### Tasks
- [ ] `wrangler deploy` production
- [ ] README: setup, architecture (two-pipeline diagram), case study, note on AI Search API maturity
- [ ] Screenshots in `docs/images/`
- [ ] `GET /api/v1/health` documented

### Acceptance criteria
- Public URL live
- README portfolio-ready

**Depends on:** #10, #11

---

## Implementation order

```
#1 → #2 → #3 ─┬→ #4 ─────────────────┐
              ├→ #5 → #6 ─┬→ #8 → #9 ┼→ #11 → #12
              └→ #7 ──────┘          │
              └─────────────→ #10 ───┘
```

- #1 also unblocks #5 (spike just needs a deployed Worker + account access)
- #4 and #5/#6/#7 can run in parallel once #3 lands
- #7 (image pipeline) has no dependency on #5/#6 — can be built in parallel with the text pipeline
- #10 (retention) depends on #6 existing (needs to know how to delete an AI Search instance) but not on the UI work
