# Builder E2E in CI — manual, owner-gated

`.github/workflows/builder-e2e.yml` runs the Impronta builder Playwright smoke
suite (`web/e2e/smoke.spec.ts`) in a clean, pinned-browser CI environment. It is
**manual** (`workflow_dispatch` only) on purpose. This doc explains why, and how
to turn it on.

## Why it is not an automatic PR gate

The smoke suite drives a **live Next.js dev server** plus **dev-signin**, both of
which read a real **Supabase** project (auth, agency/tenant rows, builder draft
storage). CI has no Supabase by design, so this suite cannot run on every PR
without owner-provisioned secrets.

Making it an auto PR/push gate would make it **red-by-default** the moment a
secret rotates or the Supabase sandbox throttles. The repo has already lived that
failure mode — `builder-fidelity.yml` and the perf-budget job both carry long
comments about how a chronically-red job "trains everyone to merge through red."
A `workflow_dispatch`-only job never appears in PR status checks, so it cannot
erode the blocking gates in `ci.yml`.

## What already protects the same regression class on every PR

The deterministic builder logic is **already gated on every PR** by the
`test:builder-chrome` node:test lane in `ci.yml` (≈200 tests: breakpoint
registry, pointer-drag, multi-node transforms, layers tree, anchored-popover,
locked-fields, responsive-field-state, visibility-render, style-classes, …).

That lane catches the *class* of bug behind the builder topbar/dropdown and
per-breakpoint regressions without needing a browser or a database. This
workflow adds the **interaction-level** coverage (real clicks, real publish
round-trip) on demand — it complements the PR gate, it does not replace it.

## Enable it (one-time, owner)

1. Stand up a **dedicated test/sandbox Supabase project** — never production. The
   smoke creates and publishes builder drafts.
2. Add these repository secrets (Settings → Secrets and variables → Actions):

   | Secret | Value |
   | --- | --- |
   | `E2E_SUPABASE_URL` | the test project's `NEXT_PUBLIC_SUPABASE_URL` |
   | `E2E_SUPABASE_ANON_KEY` | its `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
   | `E2E_SUPABASE_SERVICE_ROLE_KEY` | its `SUPABASE_SERVICE_ROLE_KEY` |
   | `E2E_TEST_ADMIN_EMAIL` | optional — only for the password-signin path |
   | `E2E_TEST_ADMIN_PASSWORD` | optional — only for the password-signin path |

3. Actions tab → **Builder E2E (Playwright smoke)** → **Run workflow**. Leave
   `grep` blank to run the whole smoke file, or pass a Playwright `-g` title
   filter to run one scenario.

The first step, **Verify required secrets**, fails fast with a clear message if
any required secret is missing — so a "not configured yet" state can never look
like a green pass.

## Notes

- The seed contract matters: the test tenant must have the `impronta` slug
  routing the smoke expects (`/impronta/...`) and a dev-signin-capable admin.
  Mirror your local `web/.env.local` setup.
- The dev-signin route returns 403 only when `NODE_ENV=production`. CI runs
  `next dev` (`NODE_ENV=development`), so dev-signin is allowed.
- This workflow was authored without Actions-write access, so it has not been
  dispatched/verified end-to-end against live secrets. Treat the **first owner
  run as the verification run** — start with a single `-g` scenario before
  running the full file.
