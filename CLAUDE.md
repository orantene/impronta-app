# Deployment — READ FIRST

This project deploys to **Vercel** (project `tulala`, team `oran-tenes-projects`). GitHub auto-deploys are live as of 2026-04-23.

- Pushes to any branch auto-build a **preview** on Vercel (SSO-gated 401).
- Push to `phase-1` builds a **preview, not production** — Vercel's internal `link.productionBranch` is stale at `"main"` (Hobby plan won't let us edit). Promote releases with `npm run deploy:promote` (preferred) or `vercel promote <preview-url> --yes`.
- **Always alias custom domains after promoting.** Vercel's Promote action updates the project's "production" pointer but does **not** reliably reassign `tulala.digital` + `app.tulala.digital`; they stay aliased to whichever earlier deploy they were on. `npm run deploy:promote` handles both steps in one command. Manual fallback:
  ```
  vercel alias set <preview-url> app.tulala.digital --scope oran-tenes-projects
  vercel alias set <preview-url> tulala.digital --scope oran-tenes-projects
  ```
- **After any deploy, run the smoke test**: `npm run deploy:smoke`. Catches alias drift, missing CSP directives, broken image optimizer, dead Places key, Supabase region drift. Exit code 1 means at least one signal is wrong — re-promote or investigate before walking away.

## Deploy commands cheat-sheet

| Command | What it does |
|---|---|
| `npm run deploy:check` | Read-only — shows which deployment each custom domain currently points to. |
| `npm run deploy:promote` | Promotes the latest preview to production AND re-aliases both custom domains. Idempotent. |
| `npm run deploy:promote -- https://tulala-xxx.vercel.app` | Promote a specific preview URL (rolls back, ships a hotfix, etc.). |
| `npm run deploy:smoke` | HTTP-only health probe of the live site. Run after every promote and before declaring success. |

## QA caveat (important for any feature dev)

`web/src/middleware.ts` gates every request against the `public.agency_domains` DB table. Any host not in the table returns **404 "Host not registered"** before route matching. This means **raw `*.vercel.app` preview URLs will NOT render the app** — they're not in `agency_domains`.

To QA a preview, either:
- `vercel promote <preview-url> --yes` and test on `tulala.digital` / `app.tulala.digital` / `impronta.tulala.digital`, or
- `vercel alias set <preview-url> <seeded-host>` where the target is already in `agency_domains` (no staging host is currently reserved — seed one if you need it).

## Full deploy topology

Domain list, env vars, Supabase seeding contract, ghost-project alias workaround, Vercel IDs, account security notes, branch situation — all in the user-level auto-memory file `project_vercel_deployment.md` (at `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/`). Treat that file as the source of truth for anything deploy-adjacent.

## Branch coordination (multi-agent)

All active development lands on **`phase-1`**. When two or more agents run concurrently:

1. **Always `git pull --rebase origin phase-1` before starting any edit** — prevents stale-base conflicts.
2. **One migration per agent** — never let two agents pick the same timestamp. Use `date -u +%Y%m%d%H%M%S` to generate a unique one at start of work.
3. **Park-restore pattern for timestamp collisions**: if `supabase db push` fails because two files share a timestamp, `mv` one to `.tmp-migrations-park/`, push, then restore. Document the park in your commit message.
4. **TS + lint gate before every commit**: `cd web && npx tsc --noEmit && npm run lint` — a red TS build blocks the next agent's work.
5. **Never force-push** `phase-1` — other agents may have commits in flight.
