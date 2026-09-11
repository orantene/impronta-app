# host-door: the Door journey, proven on the deployed QA host — end to end

**Host.** `https://staging-qa-journeys.tulala.digital`, deployment
`dpl_AFy1h9L5qCPVpYApVq1NH3jPn34m` (`tulala-h0ucfuf44`), confirmed
`readyState: READY` via the Vercel API and serving commit
`867e0ecc2582990c2054aceb63ba55910f4f18c7` — read directly off the root
HTML with the bypass header (the commit sha appears verbatim in the page,
matching both the standing brief and this worktree's `git log`). Database:
Supabase branch `qa-journeys` (`fxlankepwnvelxjrahwk`). Production was
never read from or written to.

**Spec.** `web/e2e/journeys/pos-door.spec.ts`, the same spec
`docs/plans/program/evidence/pos-door/README.md` proved on a local build of
the branch.

## Run 1 — failed on a missing environment variable (not application code)

```
PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital JOURNEYS_B_ORIGIN=https://staging-qa-journeys-b.tulala.digital PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 \
  npx playwright test e2e/journeys/pos-door.spec.ts --project=chromium --workers=1 --reporter=line --trace=on
```
`runs/run1.txt`: `1 failed`, `2 passed`, `2 did not run`, `EXIT=1`.

Test 3 ("box office: a ticket is sold for cash through the till and issued
with its code") timed out waiting for a ticket code. The rendered panel
showed the sentence "No code could be signed on this server; find the
guest by name at the gate" — `getSecret()` in
`src/lib/sessions/admission-token.ts` and `src/lib/guest-cookie.ts` returns
null when `GUEST_COOKIE_SECRET` is unset, and the spec correctly refused to
match a missing code. Tests 4 and 5 (the two gate-admission tests) never
ran because they depend on the code test 3 was to mint. See
`traces/box-office-timeout.trace.zip` for the failing run.

This was a deployment-configuration gap, not an application defect: the
code correctly refused to fabricate a ticket code without a secret, and
said so in a sentence rather than crashing or issuing a forgeable one. The
money path underneath it (order created, paid via cash, receipt issued)
still worked, confirmed independently against the database at the time
(see the original run-1 finding preserved below).

## The fix: `GUEST_COOKIE_SECRET` set branch-scoped, redeploy triggered

Setting a Vercel project's environment variables is outside application
code and outside what this session's tools could do directly; it was set
externally (branch-scoped, for `program/journeys-2026-09`) and a redeploy
was triggered — same commit `867e0ecc2582990c2054aceb63ba55910f4f18c7`,
new deployment `dpl_AFy1h9L5qCPVpYApVq1NH3jPn34m`. Confirmed `READY` via
`GET /v13/deployments/<url>?teamId=team_otRX11wclvw89c5ls7A7UsZd` before
re-running, and confirmed the host actually served it (the commit sha
appears in the served HTML; the bypass header round-trip returns a real
200, not the SSO gate).

## Run 2 — green, all five tests, on the same commit with the secret set

```
PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital JOURNEYS_B_ORIGIN=https://staging-qa-journeys-b.tulala.digital PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 \
  npx playwright test e2e/journeys/pos-door.spec.ts --project=chromium --workers=1 --reporter=line --trace=on
```
`runs/run2.txt`: `5 passed (1.3m)`, `EXIT=0`.

| # | Test | Result |
|---|---|---|
| 1 | "Door mode is switched on in Settings, and the night exists through the interface" | passed |
| 2 | "a drawer is open at the counter, so the door's cash has somewhere to go" | passed |
| 3 | "box office: a ticket is sold for cash through the till and issued with its code" | **passed** (was: timeout) |
| 4 | "gate: the code admits once, is refused the second time, and nonsense is not a ticket" | **passed** (was: did not run) |
| 5 | "gate: a walk-up pays cash at the door and walks in" | **passed** (was: did not run) |

No assertion was weakened and no code was changed to reach this result —
the only change between run 1 and run 2 was the environment variable.

## The rows agree

Read back independently with `scripts/host-a-query.mjs` after run 2
(`sql/04-admissions-run2.json`, `sql/05-orders-run2.json`):

- **Admission `76c4a901…`** ("Door holder 1789095751664"): `status: valid`,
  `admitted_count: 1` — the box-office-sold ticket, scanned once at the
  gate in test 4. Its order, `58e91bd9…`, is `paid`, `$20.00`,
  `source_page: door`, receipt code `knj1w1hnpg488gidtqdu`.
- **Admission `e9453988…`** ("Door walk-up 1789095751664"): `status:
  valid`, `admitted_count: 1` — the walk-up in test 5, paid cash and
  admitted immediately. Its order, `510a5295…`, is `paid`, `$20.00`,
  `source_page: door`, receipt code `mjyv6782kxsxe1az28cy`.

Both `admitted_count: 1` values are the direct, independently-queried
confirmation of what tests 4 and 5 asserted through the interface: the
first scan admits, and a walk-up's cash sale mints an already-admitted
ticket. Test 4's own second-scan refusal and nonsense-code refusal are
proven by the passing assertion plus the unchanged `admitted_count: 1`
(a second successful admit would read `2`).

## Screenshots (journey order)

1. `01-settings-door-on.png` — Settings > Point of sale > Door switched on.
2. `02-door-gate-sessions.png` — Tonight's events, the created night listed.
3. `03-box-office-sale-open.png` — the box office sale panel, Entry tier.
4. `04-box-office-issued.png` — the issued panel with a real signed code
   (`adm1.…`), not the "no code could be signed" sentence from run 1.
5. `05-gate-admitted.png` — the gate admitting the code the first time.
6. `06-gate-already-admitted.png` — the refusal sentence on the second scan
   of the same code.
7. `07-gate-forged.png` — the refusal sentence on a nonsense code.
8. `08-gate-walkup-admitted.png` — a walk-up paying cash and being admitted
   immediately.

## Traces

- `traces/box-office-timeout.trace.zip` — run 1's failing test (env gap).
- `traces/box-office-issued.trace.zip` — run 2's ticket sale, code issued.
- `traces/gate-admission.trace.zip` — run 2's scan-once / refuse-twice /
  refuse-forged test.
- `traces/gate-walkup.trace.zip` — run 2's walk-up cash-and-admit test.

## Rows left on the fixture workspace (declared, not cleaned up)

Run 1 left one event ("Door night 1789093891227"), its session/pool, one
paid order ($20, `9b990a52…`) and its admission (`cf160738…`, never
admitted since no code existed to scan). Run 2 reused that same event and
added two more paid orders ($20 each, `58e91bd9…` and `510a5295…`) and
their admissions (`76c4a901…`, `e9453988…`, both now `admitted_count: 1`),
plus used the counter's open shift. Per the brief, accepted and declared,
not reverted.

## What is proven, and what is not

**Proven on the deployed host, end to end:** the platform's Door
switch-on flow through Settings, event/session/tier creation through the
Events and Sessions screens, the box office's real money path (order
created, paid via cash, receipt issued, admission minted, a real signed
ticket code produced), and the gate's full scan behavior — a first scan
admits, a repeat scan of the same code is refused, a nonsense code is
refused, and a walk-up pays cash at the door and is admitted immediately —
all with the database independently agreeing.

**Not proven here:** the deployment-configuration gap this run surfaced
(`GUEST_COOKIE_SECRET` unset) has been fixed at the environment level for
this branch's deployment; that fix is external to this repository (a
Vercel project environment variable) and is not itself represented in this
commit. Anyone standing up a new preview/branch deployment of this project
needs the same variable set, or will reproduce run 1's exact gap.
