# host-floor: the Tables (floor) journey, proven on the deployed QA host

**Host.** `https://staging-qa-journeys.tulala.digital`, deployment
`tulala-5e3o227vw`, confirmed serving commit `867e0ecc2582990c2054aceb63ba55910f4f18c7`
via the `sentry-release` marker (see `docs/plans/program/evidence/host-counter/README.md`
for how it was read). Database: Supabase branch `qa-journeys`
(`fxlankepwnvelxjrahwk`). Production was never read from or written to.

**Spec.** `web/e2e/cases/POS-floor-mode.spec.ts`, the same spec
`docs/plans/program/evidence/pos-floor/README.md` proved on a local build of
the branch (that proof could not reach the deployed host because the branch
was not pushed at the time). The spec switches Tables AND Counter on itself
through the app's own Settings screen at the start of its run (its own
`beforeEach`/first steps), exactly as the brief requires — no hand-editing.

## Run 1 — failed, and why (a cross-agent race on the shared fixture, not a defect)

```
PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital JOURNEYS_B_ORIGIN=https://staging-qa-journeys-b.tulala.digital PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 \
  npx playwright test e2e/cases/POS-floor-mode.spec.ts --project=chromium --workers=1 --reporter=line --trace=on
```
`runs/run1.txt`: `1 failed`, `EXIT=1`, at line 219:

```
Locator: locator('li[data-floor-table="T5"]')
Expected pattern: not /needs reset/i
Received string: "T5Free Needs reset vacated 20:26"
```

**Investigation.** "Mark ready" was clicked on T5 (already Free + Needs
reset, per the previous step) and the card never lost the "Needs reset"
badge across 34 polls over 30 seconds. `tablesResetTable` →
`resetTable()` (`src/lib/visits/commands.ts:549`) refuses with
`already_open` when a NEW visit has been opened on the space since it went
free — by design, so a table someone just reseated is not silently wiped.
`ps aux` at the moment of the failure showed a concurrent process:

```
node .../wt-host-b/web/node_modules/.bin/playwright test e2e/cases/C06-restaurant.spec.ts -g "C06-CUS reservation" --project=chromium --workers=1 --reporter=line --trace=on
```

`web/e2e/cases/C06-restaurant.spec.ts` runs a reservation journey against
the SAME `qa-journeys` fixture tenant this spec uses, from a sibling
worktree (`host-b`, a concurrently-running proof agent on this same host
task). Its reservation step seats a party on a free table, which — if it
landed on T5 in the window between this spec's "End visit" and "Mark
ready" clicks — would make `resetTable` refuse `already_open`, exactly
reproducing "the click did nothing" with no error surfaced to this spec
(the spec does not assert on the button's return value, only on the DOM
settling). This is the same class of finding `pos-enable`'s README records
("Shared fixture — a genuine cross-agent race, not a defect"): two agents
writing to the same tenant's tables at the same time. **No application
code was touched for this** — `resetTable`'s refusal is correct behavior,
protecting a table someone just reseated.

## Run 2 — green, after the conflicting process finished

Confirmed `ps aux` showed no other `playwright`/`next dev` process running
before retrying.

```
PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital JOURNEYS_B_ORIGIN=https://staging-qa-journeys-b.tulala.digital PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 \
  npx playwright test e2e/cases/POS-floor-mode.spec.ts --project=chromium --workers=1 --reporter=line --trace=on
```
`runs/run2.txt`: `1 passed (57.5s)`, `EXIT=0`.

## The rows agree

The spec's own assertions read the database directly (`_floor-db.ts`) at
every step and all passed. Independently re-read after the run with
`scripts/host-a-query.mjs` (`sql/02-visits.json`):

- Visit `2abc0cc0…`: space T2, `joined_space_id` T3, party 4, `service_kind
  table`, opened 02:30:06Z, closed 02:30:11Z — the joined pair from the
  "four at a two-top" refusal-then-join step.
- Visit `9501d09b…`: space T5, party 2, `service_kind table`, opened
  02:29:35Z, closed 02:29:56Z — the walk-in seated, moved from T4, checked
  out, and ended.

`sql/01-spaces.json` shows `needs_reset_at` null on T2/T3/T4/T5 after the
run, because the spec's own teardown (`releaseFloorProof`) hands the four
proof tables back directly — matching the pattern the local `pos-floor`
proof already documented, not a claim that "Mark ready" was exercised
without also being independently asserted mid-run (it was, at
`POS-floor-mode.spec.ts:219,225`, which is exactly the assertion that
failed in run 1 and passed in run 2).

## Screenshots (journey order, `screenshots/`)

`00-settings-floor-on.png` through `15-joined-ended.png` — Settings
turning Tables + Counter on, entering the floor, seating T4, the kitchen's
refusal on an empty check, opening/sending to kitchen, moving to T5, the
engine's refusal on an unpaid check, collecting and ending the visit,
marking T4/T5 ready, the four-at-a-two-top refusal and its join offer, and
the joined visit ending. Same sequence as `pos-floor`'s local proof,
reproduced here against the deployed host.

## Trace

`traces/POS-floor-mode.run2.trace.zip` — the full passing run.

## Rows left on the fixture workspace (declared, not cleaned up)

The spec's own teardown releases the four proof tables (T2-T5) back to
Free/no-reset after every run, per its existing design (`_floor-db.ts`).
Closed visits and their orders/tickets from this run remain in the
database, same as every other proof on this shared fixture.

## What is proven, and what is not

**Proven on the deployed host:** switching Tables on through Settings,
seating a walk-in, the kitchen's refusal on an empty check, opening the
check into the counter and adding an item, sending to the kitchen, moving
a party, the engine's refusal on an unpaid check, collecting and ending a
visit, marking tables ready, and the four-at-a-two-top refusal with its
join offer — all through the real screens, with the database agreeing at
every step.

**Not proven here:** French rendering in a browser (English/Spanish only
serve; French proven as strings only, per `pos-floor`'s own README), the
top-bar pill's device-remembered-mode label (a known, reported, untouched
defect from `pos-floor`), and a held table's reservation-seat path (the
fixture had no held tables during this run).

**A durable note for future agents on this host task:** this fixture
tenant (`qa-journeys`) is shared by every concurrently-running proof, and
table state (not just `agencies.settings.pos`) is now also a race surface.
Check `ps aux` for other `playwright`/`next dev` processes before
attributing a floor/tables failure to a code defect.
