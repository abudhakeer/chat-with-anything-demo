# AI Search Spike — Issue #5

Findings from API/type research and initial Worker integration. Informed Issues #6 and #8.

## Summary

| Question | Answer |
|----------|--------|
| Per-doc instances viable? | **Yes** — `env.AI_SEARCH.create({ id })` + `get(id)` per upload |
| Indexing latency | **~5–60s** typical for TXT/MD; PDFs vary by size. `uploadAndPoll()` blocks until item `status === 'completed'` (default timeout 30s — we use 120s) |
| Ready signal | **`uploadAndPoll()` return value** — `AiSearchItemInfo.status === 'completed'`. Do not poll `search()` separately |
| Streaming via Worker? | **Yes** — `instance.chatCompletions({ stream: true, ... })` returns `ReadableStream` (OpenAI-compatible SSE) |
| Instance quota | Account-level; not documented in bindings. Monitor Cloudflare dashboard during demo traffic |
| Items API size limit | **4 MB per item** — conflicts with 20 MB R2 preview limit. Text pipeline capped at 4 MB at presign |

## Decision: per-doc instances (confirmed)

Pattern:

```ts
const instance = await env.AI_SEARCH.create({ id: documentId });
await instance.items.uploadAndPoll(fileName, r2Body, { timeoutMs: 120_000 });
await instance.chatCompletions({ messages, model, stream: true });
```

Instance ID uses document ID (`doc_<uuid>`), matching `^[a-z0-9_]+(?:-[a-z0-9_]+)*$`.

**Fallback (not needed yet):** single shared instance + metadata filter on `instance_ids` in multi-search.

## Ready signal

`AiSearchItemInfo.status` values: `queued | running | completed | error | skipped | outdated`.

Use `items.uploadAndPoll()` — resolves when processing completes or times out. Map:

- `completed` → D1 `ready`
- `error` / timeout → D1 `failed`

## Streaming

AI Search streaming returns OpenAI-style SSE chunks. Worker transforms to app SSE format:

```json
{"type":"token","content":"..."}
{"type":"done"}
```

Vision pipeline (Workers AI) does not stream natively — we simulate token chunks client-side from the full `response` string.

## Text model

Default: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (per PRD § Issue #8).

## Vision model

Direct Workers AI: `@cf/meta/llama-3.2-11b-vision-instruct` with base64 data URI (HTTP URLs not accepted).

## Local dev

`wrangler.local.jsonc` omits AI Search binding. Text indexing/chat requires deploy or adding `remote: true` AI Search to local config after `wrangler login`.

## Risks

1. **4 MB Items cap** — large PDFs rejected at presign for text pipeline
2. **Instance cleanup** — must call `env.AI_SEARCH.delete(instanceId)` on expiry (Cron #10)
3. **Cold start** — first `create()` on a new doc adds latency before upload even starts
