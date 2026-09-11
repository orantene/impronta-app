# T0-04 — isolated QA runtime, proven 2026-09-09

Runtime: Vercel preview of `program/journeys-2026-09`, branch-scoped Preview env
pointing at Supabase branch `qa-journeys` (`fxlankepwnvelxjrahwk`). Production
(`pluhdapdnuiulvxmyspd`) is never reachable from it.

## Hosts

| Host | Kind | Tenant | Proof |
|---|---|---|---|
| staging-qa-app.tulala.digital | app | — | 200 with the bypass header |
| staging-qa-journeys.tulala.digital | subdomain (primary) | qa-journeys | title "QA Journeys · Menu and reservations · Tulala" |
| staging-qa-journeys-b.tulala.digital | subdomain (primary) | qa-journeys-b | title "QA Journeys B · Tulala" |

All three are attached to the Vercel project and bound to the candidate git
branch, so every push to it re-points them. They exist in `agency_domains` on
the ISOLATED database only; production's table is untouched. The `.local` rows
were demoted to non-primary because a tenant may hold only one primary host.

Vercel Authentication stays ON for previews. Automated runs pass the project's
Protection Bypass for Automation secret as a header
(`VERCEL_AUTOMATION_BYPASS_SECRET`, stored in the gitignored isolated env file
and as a GitHub Actions secret; never committed). A person opens the hosts by
signing in to Vercel.

## Evidence the runtime is real, not a 200

- `/api/dev/signin` sets `sb-fxlankepwnvelxjrahwk-auth-token`: the cookie name
  itself proves the preview is bound to the isolated project.
- `C01-nail-salon` operator smoke: PASS (reaches the workspace, not the login wall).
- `PERM-cross-workspace`: 5/5 PASS, including "B's own owner reaches that same
  order", which is what makes A's refusal an authorization result rather than
  an empty database.

## First build failed on purpose-revealing grounds

The first preview of the branch built before the branch-scoped env existed, so
it ran against production and the prebuild drift check refused: "16 migration(s)
not applied to the connected Supabase project". That is the guard working. After
the env was scoped to the isolated branch (778 applied = 778 files) the build
passed. No registered host pointed at that failed deployment at any time.

## One platform fact worth keeping

The isolated branch's pooled connection arrives with
`default_transaction_read_only = on`, so every write refused (`25006`) and
`journeys:smoke` died at the first `SELECT ... FOR UPDATE`. Cleared on the
isolated branch only with `ALTER ROLE postgres IN DATABASE postgres SET
default_transaction_read_only = off` plus the same at database level. Re-check
this after any branch rebase or reset.
