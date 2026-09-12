# Case-study suite run — prompt for Cursor

Paste everything below the line into a Cursor agent opened in `/Users/oranpersonal/Desktop/impronta-app`. It needs the two local files named under SETUP (they are on this Mac; never commit them).

---

You are the QA runner for the Tulala program (Next.js 16 + Supabase, app in `web/`). Your job: run the full case-study suite under `web/e2e/cases/` (C01…C48 plus the PERM-*, MONEY-*, SELL-*, POS-* specs; ~60 files) against the deployed QA host and rewrite the scenario matrix from real results. Read-only on production; the QA host is backed by an isolated database.

## Setup

```bash
git fetch origin
git worktree add /private/tmp/cases-run -b work/cases-run origin/program/fidelity
web/scripts/setup-worktree.sh /private/tmp/cases-run          # copies node_modules + .env.local
cp /private/tmp/claude-505/-Users-oranpersonal-Desktop-impronta-app/e30ce090-ce88-474f-861f-a6f78cb4f718/scratchpad/wt-candidate/web/.env.capacity-isolated.local /private/tmp/cases-run/web/.env.capacity-isolated.local
chmod 600 /private/tmp/cases-run/web/.env.capacity-isolated.local
cd /private/tmp/cases-run/web
export VERCEL_AUTOMATION_BYPASS_SECRET=$(cat /private/tmp/claude-505/-Users-oranpersonal-Desktop-impronta-app/e30ce090-ce88-474f-861f-a6f78cb4f718/scratchpad/bypass.secret)
set -a; . ./.env.capacity-isolated.local; set +a
```
Never print the secret or any env value. Never `git switch` in `/Users/oranpersonal/Desktop/impronta-app` itself.

## The host

- Workspace A: `https://staging-qa-journeys.tulala.digital`; workspace B: `https://staging-qa-journeys-b.tulala.digital`.
- Database: Supabase branch `fxlankepwnvelxjrahwk` (fixture tenant `33333333-3333-4333-8333-333333333333`, owner `qa-journeys-owner@impronta.test`). Production (`pluhdapdnuiulvxmyspd`) is never written; never run `npm run db:push`.
- Vercel Authentication is on: every request carries the header `x-vercel-protection-bypass` (the Playwright config sends it from `VERCEL_AUTOMATION_BYPASS_SECRET`; never request the bypass cookie).
- Confirm the host serves the current integration commit before running:
  `curl -s -H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET" https://staging-qa-journeys.tulala.digital/ | grep -o 'sentry-release[^"]*'` must contain `git rev-parse --short origin/program/journeys-2026-09`. If it serves an older commit, wait; do not run against stale code.

## Run

One spec at a time, one Playwright process at a time (the machine is shared with builders; no dev server, no typecheck, no build):

```bash
PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital \
JOURNEYS_B_ORIGIN=https://staging-qa-journeys-b.tulala.digital \
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 JOURNEYS_FIXTURE_READY=1 \
npx playwright test e2e/cases/<spec> --project=chromium --workers=1 --reporter=line --trace=retain-on-failure
```
Add `--project=tablet-pos` or `--project=mobile-checkout` only where a spec declares that project. Before the first spec, switch the fixture workspace's POS modes on the way `e2e/cases/POS-platform-switch.spec.ts` and `e2e/cases/_harness.ts` do it (the settings blob is shared; do not assume).

Rerun a failure once before classifying it.

## Classify every case

- **passed**
- **failed-app**: a real application defect. Describe it, add a row to `docs/plans/program/defects.md` (next free D-id; the file is sequential) with the failing assertion and the trace/screenshot path.
- **failed-fixture**: fixture drift (known: the public `/book` picker caps at 24 offerings by `sort_order`, and ~30 `sort_order = 0` "Prove class" offerings push the fixture's services off the page; 80+ open draft orders). Say exactly which row is missing or shadowed.
- **failed-spec**: a stale selector after the design re-skins (known drifts: the Counter rail row "Shifts" is now "Cash"; "Cancel sale" is now Hold → Discard; rail children only show under the lit row so Preparation is reached via Orders; the top-bar POS switch opens a mode menu when more than one mode is on; Sales shows "Ticket page" not the raw `ticket_picker`). Fix the selector to the new structure WITHOUT weakening any assertion, rerun once.
- **blocked-external**: needs Stripe test keys or a Mercado Pago sandbox.

Never skip, `test.fixme`, or invert a test to make it pass.

## Write

1. Rewrite `docs/plans/program/scenario-matrix.md` from the results: one row per case × role with status, run date, host commit, evidence path. Replace the developer's stale "not started / implementing" statuses entirely.
2. File the run under `docs/plans/program/evidence/cases-run/<YYYY-MM-DD>/`: per-spec log, traces/screenshots of failures, and a `README.md` with the counts (passed / failed-app / failed-fixture / failed-spec / blocked) and the D-ids filed. Rows the run leaves on the fixture workspace are accepted; list them.
3. Commit on `work/cases-run` (message ending `Co-Authored-By: Cursor <noreply@cursor.com>` or your own attribution), push the branch, open a PR to `main` titled "qa: case-study suite run <date>". Do not merge.

## Report back

Counts; every failed-app defect with its D-id and one sentence; every fixture drift; every spec you edited; the host commit; anything you could not run and why.
