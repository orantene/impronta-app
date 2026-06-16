# Migration auto-apply — runbook

**Workflow:** `.github/workflows/auto-apply-migrations.yml`
**Status:** merged but **DORMANT** — it triggers on pushes that touch `supabase/migrations/**`, but does nothing (neutral green no-op) until the two required secrets below are added. Adding them activates it.

## What it does

Vercel auto-deploys code on every push to `main`, but Supabase has **never**
auto-applied migrations — they were applied by hand (Supabase MCP `execute_sql`
+ a manually inserted `supabase_migrations.schema_migrations` row), because
`supabase db push` is **blocked by migration-history drift** on this project.
That gap caused three separate silent-500 incidents where code shipped ahead of
its schema (see `CLAUDE.md` → "Schema + code shipping protocol").

This Action closes the gap: when a migration-only commit lands on `main`, it
applies **only the not-yet-applied** migration files to the linked Supabase
project and records each version — the same proven pattern the team did by hand,
now automated.

## Why not `supabase db push`

Remote `schema_migrations` has rows whose files arrived out of order via the
Management API / MCP (e.g. `20261027000000/001/002` weren't on `main` when
applied). `supabase db push` reconciles the **full** history and **fails** on
this drift. Instead the Action reuses the repo's robust applier:

```
web/scripts/apply-migration.mjs --apply-pending
```

which:
1. reads the versions already present in remote `schema_migrations`,
2. applies **only** local `supabase/migrations/*.sql` files whose version is
   absent, via the Supabase **Management API SQL endpoint**
   (`POST /v1/projects/{ref}/database/query` — pure HTTPS, no IPv6/pooler issue),
3. inserts each applied version into `schema_migrations` with
   `ON CONFLICT (version) DO NOTHING`.

It is **idempotent**: re-running applies only what is still pending.

## Required GitHub secrets

Add under **Settings ▸ Secrets and variables ▸ Actions ▸ Repository secrets**:

| Secret | Required? | What / where | Used by |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | **Yes** | Supabase **personal access token** (Account ▸ Access Tokens). Same token `vercel env pull` uses. | `apply-migration.mjs` → Management API |
| `SUPABASE_URL` | **Yes** | Project URL `https://<ref>.supabase.co`. Mirrors Vercel's `NEXT_PUBLIC_SUPABASE_URL`. The applier derives the project ref from it. | `apply-migration.mjs` (mapped to `NEXT_PUBLIC_SUPABASE_URL`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Service-role key (same value Vercel uses). Enables the post-apply drift-verification step; if absent that step is skipped. | `check-migrations-applied.mjs` |

Nothing is hardcoded. **Until both required secrets are added the Action is a
dormant no-op** — a migration push lands as a neutral green job that applies
nothing, so `main` stays green and migrations keep being applied via the manual
MCP / `db:push` flow. Adding both secrets activates auto-apply.

## Migration-order recommendation (not enforced)

Prefer landing a schema change a beat **ahead** of the code that depends on it
(its own commit, or first in the PR) so it's applied before that code's deploy
builds.

This is a **recommendation, not a gate.** The Action's guard only **warns** on a
mixed migration + code push and still applies the pending migration(s) — because
this repo routinely bundles a migration with the code that needs it and the
regenerated `database.types.ts` in one PR. (The apply is idempotent and records
each version with `ON CONFLICT DO NOTHING`, so a bundled push is safe.)

## Residual race vs. Vercel (non-blocking by design)

This Action runs **independently** of Vercel. If a code deploy's build starts
**before** this Action finishes, Vercel's prebuild drift gate
(`web/scripts/check-migrations-applied.mjs`) may transiently fail.

**Mitigation:** keep migrations in their own commit merged a beat ahead of the
dependent code, so by the time the code deploy builds, the migration is already
applied. If a deploy trips the drift gate transiently, just **redeploy** once
this Action is green.

## How to disable

- **GitHub UI:** Actions ▸ *Auto-apply Supabase migrations* ▸ "···" ▸ **Disable
  workflow**.
- **Or** delete `.github/workflows/auto-apply-migrations.yml`.

With it off, migrations revert to the manual flow (`npm run db:push` or the
Management-API / MCP pattern).

## Rollback

The Action only rolls migrations **forward**; it never drops or reverts schema.
To undo an applied migration:

- **Preferred:** write a **new compensating migration** (forward-only
  discipline) and let the Action apply it.
- **Manual:** revert via the Supabase MCP / SQL editor, then delete the
  corresponding `schema_migrations` row so the version is no longer recorded.

**Never** edit an already-applied migration file in place — change the version's
recorded state, not its file.

## Failure playbook

| Symptom | Likely cause | Fix |
|---|---|---|
| Guard logs a "Mixed migration + non-migration push" **warning** | Migration + code/types in one push | None needed — it's a warning; the migration still applies. Split commits only if you want the recommended migration-ahead ordering. |
| Job is green but applied nothing ("Auto-apply dormant" notice) | `SUPABASE_ACCESS_TOKEN` / `SUPABASE_URL` not set yet | Add both secrets to activate; the migration was applied via the manual flow in the meantime. |
| `apply-migration` SQL error | Bad SQL in a migration file | Fix the migration, push a migration-only correction (or compensating migration); the applier re-runs only pending files. |
| Post-apply drift check fails | A file applied but its `schema_migrations` row didn't record, or a file the RPC sees as pending | Inspect; the apply is idempotent — re-run the workflow. |
| Vercel deploy 500s right after merge | Code deploy built before this Action applied the migration | Wait for this Action to go green, then redeploy. |
