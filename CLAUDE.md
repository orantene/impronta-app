# Deployment — READ FIRST

This project deploys to **Vercel** (project `tulala`, team `oran-tenes-projects`). GitHub auto-deploys are live as of 2026-04-23.

- **`main` is the canonical branch** — GitHub default + single source of truth. Nobody's workflow changes: branch off main, PR back to main.
- **Deploys are CI-GATED (since 2026-08-04):** Vercel's production branch is `production`, a pointer branch that `promote-production.yml` fast-forwards ONLY when the structural quality gate passes on that exact main commit. Merge to `main` → CI (~11 min) → pointer advances → Vercel builds production. **Merging to `main` does not deploy** — a `main`-ref build is a preview (`target: null`); only `production`-ref builds are `target: "production"`. **A red main cannot deploy.** When CI fails on main, `main-red-alert.yml` opens a pinned 🔴 MAIN IS RED issue (auto-closes on green); fix forward or revert before merging anything else.
- **The pointer advance is automatic — do not push it by hand as a matter of course.** `promote-production.yml` does it for you on green CI. If the workflow is down and you need to release a commit CI has already vetted, the manual fallback is a fast-forward, never a force: `git push origin origin/main:production`.
- Push to any **other** branch → Vercel builds an SSO-gated **preview** (401).
- `phase-1` is the **retired** former working branch. Do not develop on it; it is kept briefly as a transition alias and will be deleted. New work branches off `main` — see [`web/docs/development-workflow.md`](web/docs/development-workflow.md).
- **Alias custom domains after a production deploy.** The production pointer does **not** reliably reassign `tulala.digital` + `app.tulala.digital`; the `vercel-post-deploy-alias.yml` Action re-aliases them. Manual fallback:
  ```
  vercel alias set <deploy-url> app.tulala.digital --scope oran-tenes-projects
  vercel alias set <deploy-url> tulala.digital --scope oran-tenes-projects
  ```
- **After any deploy, run the smoke test**: `cd web && npm run deploy:smoke`. Catches alias drift, missing CSP directives, broken image optimizer, dead Places key, Supabase region drift. Exit code 1 means at least one signal is wrong — investigate before walking away.

## Deploy commands cheat-sheet

| Command | What it does |
|---|---|
| `npm run deploy:check` | Read-only — shows which deployment each custom domain currently points to. |
| `npm run deploy:promote` | Promotes the latest preview to production AND re-aliases both custom domains. **Refuses to run if local migrations aren't applied to remote Supabase.** Idempotent. |
| `npm run deploy:promote -- https://tulala-xxx.vercel.app` | Promote a specific preview URL (rolls back, ships a hotfix, etc.). |
| `npm run deploy:smoke` | HTTP-only health probe of the live site **plus** Supabase migration-drift check. Run after every promote and before declaring success. |
| `npm run db:push` | Apply all local `supabase/migrations/*.sql` to the linked remote project. Run this after committing a new migration. |
| `npm run db:check` | Read-only — list local migrations not yet applied to remote Supabase. |

## Schema + code shipping protocol (DO NOT SKIP)

Vercel auto-deploys code on every push. Supabase does **not** auto-apply migrations. The two pipelines are independent, and three separate multi-agent incidents have shipped code that referenced unapplied migrations (silent 500s on the feature that needed the new schema).

The rule: **if your work includes a new migration, `npm run db:push` is part of the commit, not optional.**

Per-agent workflow:
1. Branch off `main`; write code + migration locally
2. `npm run db:push` — apply the migration to remote Supabase
3. `cd web && npm run typecheck && npm run lint` — gate
4. `git commit`, push the feature branch, open a PR to `main`
5. Merge the PR → `main` auto-deploys to production

There is no migration auto-apply yet — step 2 is mandatory and must happen *before* the merge, or the production deploy 500s on the feature that needs the new schema. `deploy:promote` is now a rollback / hotfix tool only. `deploy:smoke` reports migration drift — run it after the deploy.

## QA caveat (important for any feature dev)

`web/src/middleware.ts` gates every request against the `public.agency_domains` DB table. Any host not in the table returns **404 "Host not registered"** before route matching. This means **raw `*.vercel.app` preview URLs will NOT render the app** — they're not in `agency_domains`.

To QA a preview, either:
- `vercel promote <preview-url> --yes` and test on `tulala.digital` / `app.tulala.digital` / `impronta.tulala.digital`, or
- `vercel alias set <preview-url> <seeded-host>` where the target is already in `agency_domains` (no staging host is currently reserved — seed one if you need it).

## Full deploy topology

Domain list, env vars, Supabase seeding contract, ghost-project alias workaround, Vercel IDs, account security notes, branch situation — all in the user-level auto-memory file `project_vercel_deployment.md` (at `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/`). Treat that file as the source of truth for anything deploy-adjacent.

## Branch workflow

`main` is canonical. Day-to-day work is **local-first on short-lived feature branches off `main`**, merged back via PR. The full standard — branch naming, when to push, when to deploy, hotfixes, multi-agent coordination — lives in [`web/docs/development-workflow.md`](web/docs/development-workflow.md). Read it before starting.

Multi-agent essentials:

1. **Branch off the latest `main`** — `git fetch origin && git switch -c <type>/<topic> origin/main`. Never commit directly to `main`.
2. **One migration per agent** — never let two agents pick the same timestamp. Use `date -u +%Y%m%d%H%M%S` at the start of work.
3. **Park-restore pattern for timestamp collisions**: if `db push` fails because two files share a timestamp, `mv` one to `.tmp-migrations-park/`, push, then restore. Document the park in your commit message.
4. **TS + lint gate before every commit**: `cd web && npm run typecheck && npm run lint`. These are the ONLY entry points: `npm run typecheck` routes through the machine-wide queue in `web/scripts/tsc-queue.sh`; an ad-hoc `npx tsc --noEmit` bypasses it and starves every queued run (three bypassing runs turned a 12-minute gate into 90 on 2026-09-05). Never invoke `tsc` or `eslint` directly. The queue is the fast path, not a courtesy: a queued run holds a protected slot the governor never pauses, while a bypassing run joins the group that gets starved. The queue script arrived on 2026-09-03 (`8ac303c0c`); in a worktree older than that, `npm run typecheck` is a bare `tsc` that never asks for a turn, so rebase the worktree onto current `main` before running any gate.
5. **Never force-push `main`.**
