# host-counter: the Counter journey, proven on the deployed QA host

**Host.** `https://staging-qa-journeys.tulala.digital`, deployment
`tulala-5e3o227vw`, confirmed serving commit `867e0ecc2582990c2054aceb63ba55910f4f18c7`
via the `sentry-release` marker read off `/` with the bypass header (matches
the commit named in the standing brief and this worktree's own `git log`).
Database: Supabase branch `qa-journeys` (`fxlankepwnvelxjrahwk`), same one
every prior proof used. Production (`pluhdapdnuiulvxmyspd`) was never read
from or written to; `npm run db:push` was never run.

**Spec.** `web/e2e/cases/POS-counter-cash-sale.spec.ts`, the same spec
`docs/plans/program/evidence/prove-counter/README.md` proved locally
(section 4 of that README: it could not reach the deployed host because the
branch tip did not build at the time). The switch that gates the mode
(`platform_settings.workspace_pos_enabled`) was already `true` on this
database from `pos-enable`'s proof; confirmed by query, not assumed.

## What was switched on, and how

The fixture workspace's `agencies.settings.pos.locations.default.modes`
already carried all five modes (`floor`, `counter`, `door`, `classes`,
`projects`) from the cumulative local proofs on this shared database. The
spec's own `beforeEach`-adjacent setup does not touch Settings for this
spec (unlike `pos-floor`/`pos-door`, which switch modes on themselves); the
counter journey assumes the platform switch only, which was already on.
Nothing was hand-written; every mode currently on was turned on earlier
through the app's own settings screen by a different proof, verified live:

```
select settings->'pos' from agencies where slug='qa-journeys';
-- modes: ["floor","counter","door","classes","projects"]
```

## Run 1 — failed, and why (a host difference, not a defect)

```
PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital JOURNEYS_B_ORIGIN=https://staging-qa-journeys-b.tulala.digital PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 \
  npx playwright test e2e/cases/POS-counter-cash-sale.spec.ts --project=chromium --workers=1 --reporter=line --trace=on
```
`runs/run1.txt`, 1 failed / 3 did not run, `EXIT=0` (Playwright's own exit
code was folded by the shell pipe in that run; the failing test is the
signal — see `runs/run3.txt` below for a clean, unpiped exit code on the
fixed run).

**Cause.** `enterCounterFromTopBar` clicked the top-bar switch's pos-half
button and asserted an immediate navigation to `?mode=counter`. That was
true when this spec was last proven locally against a workspace with only
`counter` enabled. On THIS database, the workspace now has five modes on
(above), and `PosModeSwitch` (`src/components/admin/shell/internal/page-modules/PosModeSwitch.tsx:163-169`)
is written so that when more than one mode is available, the first click
opens the mode menu instead of navigating — by design, so a person can
choose. `web/e2e/journeys/pos-door.spec.ts`'s own `enterDoorFromTopBar`
already handles this (open the switch, then click the named mode from the
menu if it appears); the counter spec's helper had not been updated to
match since the workspace it was last proven against had only one mode.

**This is not an application defect.** The component's own doc comment says
the menu-first behavior is intentional for a multi-mode workspace. It is a
test-helper gap surfaced only because this shared fixture now carries more
modes than it did when the spec was last proven.

**Fix**, in `web/e2e/cases/POS-counter-cash-sale.spec.ts`
(`enterCounterFromTopBar`): after clicking the switch, check whether the
mode menu opened; if it did, click the "Counter" menu item (mirroring
`pos-door.spec.ts`'s `enterDoorFromTopBar`); if the workspace has only
Counter on, the original click already navigated and no menu appears, so
the old path still works unmodified. No assertion was weakened — the test
still requires the same end state (`?mode=counter`, the POS chrome, no
workspace sidebar).

## Run 3 — green, with a clean exit code

```
PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital JOURNEYS_B_ORIGIN=https://staging-qa-journeys-b.tulala.digital PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 \
  npx playwright test e2e/cases/POS-counter-cash-sale.spec.ts --project=chromium --workers=1 --reporter=line --trace=on
```
`runs/run3.txt`: `4 passed (1.7m)`, `EXIT=0`.

## The rows agree

The spec's own assertions read the database directly (`_isolated-db.ts`,
`isolatedService`) and all four tests passed, so every in-spec DB assertion
already succeeded. Read back again after the run, independently, with
`scripts/host-a-query.mjs` against `DATABASE_URL` from
`.env.capacity-isolated.local`:

| Order | Status | Total | Channel | Paid via | Tendered | Change | Shift |
|---|---|---|---|---|---|---|---|
| `16f1ce55…` | paid | $42.50 (4250¢) | pos | cash | $50.00 | $7.50 | `96a32a62…` |
| `65ecf2e7…` | paid | $18.00 | pos | cash | $18.00 | $0 | `96a32a62…` (refusal 1: "already collected") |
| `831d8925…` | paid | $12.00 | pos | cash | $12.00 | $0 | `96a32a62…` (refusal 3, recovered) |
| `e45da1a9…` | draft | $24.50 | pos | — | — | — | refusal 2: "changed underneath", never paid |

`$42.50 tendered $50.00, change $7.50` matches the paid screen in
`screenshots/02-paid.png` exactly. Full rows: `sql/01-orders.json`,
`sql/02-transactions.json`.

## Screenshots (journey order)

1. `01-switch-entry-chrome.png` — entered via the top bar, full-width POS
   chrome, no workspace sidebar.
2. `02-paid.png` — Amount collected $42.50, Change given $7.50.
3. `03-receipt.png` — the `/r/<code>` receipt, opened anonymously, resolves.
4. `04-refusal-already-collected.png` — "This sale is no longer open..."
5. `05-refusal-changed-underneath.png` — "This sale changed while you had it
   open..."
6. `06-refusal-needs-name.png` — "This item needs the customer's name..."
7. `07-needs-name-recovered.png` — recovered and paid after typing the name.

## Traces

`traces/*.trace.zip`, one per test, from the passing run (`--trace=on`).

## Rows left on the fixture workspace (declared, not cleaned up)

This run added four orders (`16f1ce55…` paid $42.50, `65ecf2e7…` paid
$18.00, `831d8925…` paid $12.00, `e45da1a9…` draft $24.50, all
`source_channel: pos`), their transactions, and opened/used shift
`96a32a62…`. Per the brief, accepted and declared, not reverted.

## What is proven, and what is not

**Proven on the deployed host, with the fix:** the counter is reachable
through the top bar's own switch (now correctly handling a multi-mode
workspace), a shift opens, two different items sum correctly, cash is
collected with change, the paid screen and the receipt both resolve, and
all three refusals (already collected, changed underneath, needs a name)
are driven from the interface, shown as sentences with the engine's own
vocabulary absent, and agree with the database.

**Not proven here:** card/link/pass tendering, print/email receipt buttons,
Spanish or French rendering of the refusal sentences (proven as strings in
the catalogue only, per `prove-counter`'s own README), and the platform
switch still has no product control (documented already in `pos-enable`).
