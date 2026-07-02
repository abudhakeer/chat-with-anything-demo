# Chat with Anything

Edge-native document Q&A demo on Cloudflare: **R2**, **AI Search**, **Workers AI**, **D1**.

Upload a document → preview it → chat with it.

## Stack

- **Frontend:** React + Vite + Tailwind (served via Worker assets binding)
- **Backend:** Hono on Cloudflare Workers
- **Storage / AI:** R2, D1, AI Search, Workers AI, KV

See [`docs/PRD.md`](docs/PRD.md) for the full product spec.

## Prerequisites

- Node.js 22+ (see `.nvmrc`)
- [pnpm](https://pnpm.io/)
- Cloudflare account (`npx wrangler login`)

## Setup

```bash
pnpm install
pnpm d1:migrate:local
pnpm build
```

Run `pnpm d1:migrate:local` once before first local dev session. Do not add comments on the same line — zsh/pnpm can pass `# ...` text through as extra arguments.

For deploy and AI Search (Issues #5+), provision remote resources after `wrangler login`:

```bash
pnpm exec wrangler d1 create chat-with-anything
pnpm exec wrangler kv namespace create RATE_LIMIT
```

Then update `database_id` and KV `id` in `wrangler.jsonc` and run `pnpm exec wrangler types`.

## Development

**Requires Node.js 22+** (see `.nvmrc`). Run `nvm use` if you use nvm.

Run the UI and Worker in two terminals:

```bash
nvm use          # required — Wrangler needs Node 22+ (see .nvmrc)
pnpm build       # if you have not built the UI yet

# Terminal 1 — React dev server (proxies /api → Worker)
pnpm dev

# Terminal 2 — Cloudflare Worker (local bindings only; no login required)
pnpm dev:worker
```

- UI: http://localhost:5173
- Worker: http://localhost:8787
- Health check: http://localhost:8787/api/v1/health

`pnpm dev:worker` uses `wrangler.local.jsonc` (R2, D1, KV, assets — all local). AI bindings are omitted so you can develop without `wrangler login`.

For deploy and AI Search work (Issues #5+), log in and use production config:

```bash
pnpm exec wrangler login
pnpm deploy   # uses wrangler.jsonc with AI + AI Search remote bindings
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Vite dev server |
| `pnpm dev:worker` | Wrangler dev |
| `pnpm build` | Build UI to `dist/` |
| `pnpm d1:migrate:local` | Apply D1 migrations to local dev database |
| `pnpm typecheck` | TypeScript check |
| `pnpm deploy` | Build + deploy to Cloudflare |

## Implementation

Tracked in [GitHub Issues](https://github.com/abudhakeer/chat-with-anything-demo/issues).
