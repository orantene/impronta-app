# host-classes: POS mode `classes` (Front desk) proven on the deployed QA host

Proved by agent `host-b`, 2026-09-11, against `https://staging-qa-journeys.tulala.digital`
(Vercel deployment `tulala-5e3o227vw`), confirmed serving commit `867e0ecc2`
(`sentry-release=867e0ecc2582990c2054aceb63ba55910f4f18c7`, read from the
response body of `GET /` through the Vercel Authentication bypass header;
matches `git rev-parse origin/program/journeys-2026-09` = `867e0ecc2` in this
worktree). Database: Supabase branch `fxlankepwnvelxjrahwk` (qa-journeys).
Production `pluhdapdnuiulvxmyspd` was never read from or written to; no
migration; `npm run db:push` was never run.

This closes the gap the local-only `docs/plans/program/evidence/pos-classes/`
run left open ("Not proven on the deployed QA host" — its item 1): the same
spec, run 9 locally, is run here again against the real Vercel build.

## Mode switch

`agencies.settings.pos.locations.default.modes` on the fixture tenant already
carried `classes` (and `projects`, `floor`, `counter`, `door`) before this run
started — the shared settings blob other agents' runs left on. No settings
action was needed this run; the spec's own first test still walks Settings →
Point of sale → Front desk → the top-bar switch to prove the door lights up,
independent of what the stored blob already held.

## Command and exit code

```
PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital \
JOURNEYS_B_ORIGIN=https://staging-qa-journeys-b.tulala.digital \
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 \
npx playwright test e2e/journeys/pos-classes.spec.ts --project=chromium --workers=1 --reporter=line --trace=on
```
Exit 0 — **6 passed (2.2m)**, run 1, no retries, no fixes needed. Full log:
`run1.log`.

## What was proven

The same story as the local proof (`docs/plans/program/evidence/pos-classes/README.md`):
Settings → Front desk on → top-bar switch → `/admin/pos?mode=classes`; a
walk-in booked onto a free appointment slot and paid in cash through the
Counter; check-in, with a second (stale) desk correctly refused in words; a
reschedule refused for a person-conflict, then moved; a class night created
through the interface, a walk-in seat sold for cash, attendance marked
present; the night filled, a name joined the waitlist, an offer refused while
full, a seat opened by raising capacity through the interface, the place
offered and accepted, and the roster showing the waitlist admission.

Screenshots (`screenshots/`, 16 files) — full page, matching the local proof's
figures 1–6: `settings-classes-on.png`, `classes-today.png`,
`walkin-booked.png`, `walkin-paid.png`, `checked-in.png`,
`checkin-stale-refused.png`, `move-person-busy.png`, `moved.png`,
`sessions-empty-roster.png`, `seat-paid.png`, `attendance-marked.png`,
`waitlist-joined.png`, `walkin-full-night-not-offered.png`,
`promote-refused-full.png`, `promoted.png`, `roster-with-waitlist-place.png`.

SQL ground truth (`sql-after-journey.json`, read with the local proof's own
`docs/plans/program/evidence/pos-classes/sql/read-rows.mjs`, stamp
`1789093158157`, service role, never printed): 4 `agency_bookings` this run
wrote (`walkin-1789093158157` → `in_progress`, `walkin-two-1789093158157` →
`confirmed`, `seat-one-1789093158157` and `seat-two-1789093158157` →
`confirmed`), 4 `orders` (two `paid` 5000/500, one `pending_payment` 5000, one
`paid` 500), 2 `admissions` (`seat-one` valid/admitted_count 1,
`seat-two` valid/admitted_count 0 — the waitlist admission is the third seat
and carries no order line, matching the local proof's finding that a
promoted waitlist place is a held seat with no ticket), 1
`session_waitlist_entries` row (`Ana Espera 1789093158157`, `accepted`).
`agency.settings.pos.locations.default.modes` includes `classes`.

## Difference between local and host

None found. No application fix was needed this run — the host behaved
identically to the local dev-server proof from `docs/plans/program/evidence/pos-classes/`.

## Fixture state left behind

Same shape as every earlier run of this spec: two walk-in appointment
bookings (one `in_progress`, one `confirmed`, never collected past their
first cash payment where the story collects), a class-night event
`POS class 1789093158157`, three seats sold/held on it. Nothing was deleted.

## Not done, and known (unchanged from the local proof)

Items 2–7 of `docs/plans/program/evidence/pos-classes/README.md#not-done-and-known`
still apply unchanged (top-bar switch label lag, multi-tier nights, walk-in
slot zone behaviour, "sold: unknown" on the Events page, fixture bookings
accumulating). Item 1 ("not proven on the deployed QA host") is now closed by
this run.
