# Tulala

The Talent Business Platform. Multi-tenant SaaS — branded storefronts, structured booking pipelines, and a shared discovery network for talent agencies.

**Status:** pre-launch. First tenant: Impronta Models Tulum.

## Stack

- Next.js 16 (App Router, React 19, Tailwind 4)
- Supabase (Postgres + RLS + Storage + Auth)
- Vercel (Hobby plan, project `tulala`, team `oran-tenes-projects`)
- TypeScript strict, `tsx --test` for unit tests

## Prerequisites

- Node `>=22.0.0 <25.0.0` (`.nvmrc` pins Node 22)
- npm
- A `web/.env.local` populated from `web/.env.example` (Supabase URL + keys, Google Maps/Places, OpenAI/Anthropic, etc.)
- `vercel` CLI (only for promoting prod)

## Install

```sh
cd web
npm install
cp .env.example .env.local   # then fill in the values
```

## Dev

For most UI/admin/builder work:

```sh
cd web
npm run dev          # localhost:3000
```

For host-routing or tenant-specific work, run the orchestrator from the **repo root**:

```sh
./scripts/dev.sh
```

This starts `next dev` on 3000 and a host-rewriting proxy on 3102 → `app.local:3102`. Visit `http://app.local:3102` to hit the app shell with proper host headers.

The middleware checks `Host` against `public.agency_domains` and returns **404 "Host not registered"** for any host not in the table. `app.local` and the other dev hosts must be seeded once. See [`OPERATING.md` §5](OPERATING.md).

## Test

```sh
cd web
npm run typecheck         # tsc --noEmit
npm run lint              # eslint
npm run ci                # full chain (typecheck → tests → lint → build)
npm run test:tenant-isolation   # multi-tenant safety net — required for any saas/RLS change
```

E2E smoke (Playwright): see `web/e2e/README.md`.

## Deploy

Pre-launch: ship straight to prod.

```sh
git push origin phase-1
# Vercel auto-builds a preview at https://tulala-<hash>-oran-tenes-projects.vercel.app
vercel promote <preview-url> --yes --scope oran-tenes-projects
./scripts/smoke-prod.sh
```

The post-deploy GitHub Action (`.github/workflows/vercel-post-deploy-alias.yml`) re-aliases the two ghost-locked hosts (`tulala.digital`, `app.tulala.digital`) automatically.

For staging click-through:

```sh
vercel alias set <preview-url> staging.tulala.digital --scope oran-tenes-projects
./scripts/smoke-staging.sh
```

Full deploy mechanics in [`OPERATING.md` §3](OPERATING.md).

## Directory layout

```
.
├── AGENTS.md            # Agent operating contract — read first
├── OPERATING.md         # Environments, deploy ladder, governance
├── CLAUDE.md            # Deployment-first reminders for Claude Code
├── README.md            # This file
├── docs/                # Specs, charters, phase trackers, decision log
├── scripts/             # Cross-cutting ops (smoke, dev, deploy alias, seed)
├── supabase/migrations/ # Sequential SQL migrations
└── web/                 # Next.js app (everything actually deployed)
    ├── AGENTS.md        # Next.js 16 quirks
    ├── src/app/         # Routes (marketing, dashboard, public, api)
    ├── src/components/  # 307 components organized by surface
    ├── src/lib/         # Domain logic (saas, site-admin, brand, ai, etc.)
    └── e2e/             # Playwright smoke tests
```

## Where to find more

- [`AGENTS.md`](AGENTS.md) — operating contract for human + agent contributors
- [`OPERATING.md`](OPERATING.md) — environments, deploy ladder, content/code split, governance
- [`docs/decision-log.md`](docs/decision-log.md) — locked architectural decisions
- [`docs/saas/`](docs/saas/) — multi-tenant phase trackers
- [`docs/admin-redesign.md`](docs/admin-redesign.md) — current admin shell direction
