# host-guest-reservations: the public reservation block, as a guest, on the deployed QA host

Proved by agent `host-b`, 2026-09-11, against `https://staging-qa-journeys.tulala.digital`
(Vercel deployment `tulala-5e3o227vw`), confirmed serving commit `867e0ecc2`
(`sentry-release=867e0ecc2582990c2054aceb63ba55910f4f18c7` — same check as
`docs/plans/program/evidence/host-classes/README.md`). Database: Supabase
branch `fxlankepwnvelxjrahwk` (qa-journeys). Production `pluhdapdnuiulvxmyspd`
was never read from or written to.

## Spec reused

`e2e/cases/C06-restaurant.spec.ts`, test `C06-CUS reservation: storefront
reserve_table → hold → Sales and DB agree`. This is the mode's `reserve_table`
builder block (`[data-builder-node-kind='reserve_table']`, "Reserve a table")
on the fixture tenant's public storefront — exactly "the public reservation
block on the fixture tenant". The test opens the storefront with no sign-in
at all, picks a time slot, fills name + email, submits, then signs in as
staff separately only to read the Sales list — the reservation itself is
made entirely as a guest with no account.

No new spec was authored: this one already proves the exact journey asked
for, including the platform defect it exists to guard (a $0 reservation used
to carry a 15-minute payment deadline and silently expire; this spec asserts
`hold_expires_at` is null and the allocation is `committed`, not merely held).

## Command and exit code

```
PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital \
JOURNEYS_B_ORIGIN=https://staging-qa-journeys-b.tulala.digital \
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 \
npx playwright test e2e/cases/C06-restaurant.spec.ts -g "C06-CUS reservation" --project=chromium --workers=1 --reporter=line --trace=on
```
Exit 0 — **1 passed (16.0s)**, run 1, no fix needed. Only the one test was
selected with `-g` to keep this run to one spec, one case, as the brief asks.
Full log: `run1.log`.

## What was proven

A guest opens the fixture tenant's storefront with no session, sees "Reserve
a table" (`reserve_table` builder block), picks the first bookable time slot,
fills Name ("C06 diner") and Email (a fresh timestamped marker), and submits.
The block responds "you are booked" / "nothing to pay" with no payment step
(the table itself is free). A staff sign-in afterward shows the reservation
on `/admin/sales`.

Screenshot: `screenshots/c06-cus-reservation.png` (the confirmed-booked state
of the storefront block).

SQL ground truth, in two parts because the spec's own `afterEach` releases
the table immediately after every run (documented in the spec: "a confirmed
reservation now COMMITS its table, so without this the suite eats one of the
Two-to-four tops per run"):

1. **During the run, proven by the passing assertions themselves** (not
   re-derived here — that would be checking the test against itself): order
   `status = paid`, `total_cents = 0`, `source_channel = reservation`,
   `admissionId` truthy, `party_size = 2`, `hold_expires_at = null`,
   allocation state `committed`.
2. **After the run's own cleanup** (`sql-after-journey.json`, service role,
   never printed), read moments after the process exited: order
   `8d9f6711-4a53-4d8c-a9a4-7a0f8204112d`, `source_channel reservation`,
   `total_cents 0`, `receipt_code 8jwwd9ki4nbyt5aq3sfw`, now `status
   cancelled` — the fixture's own release-the-table cleanup, run by the
   spec's `afterEach`, not a defect. Its `order_lines` row and the
   `admissions` row it minted are both real and still readable: admission
   `a542b2e6-ab1a-43dc-897b-471cc6795cfb`, `holder_name "C06 diner"`,
   `holder_email` the run's marker email, `party_size 2`,
   `starts_at 2026-09-11T18:00:00Z`. The admission itself was not deleted by
   the cleanup, only the table's allocation was released for reuse.

## Difference between local and host

None found. No fix was needed.

## Fixture state left behind

One `orders` row (`cancelled`, by the spec's own designed cleanup) and one
`admissions` row from the guest reservation. The table hold itself was
released so later runs (this proof's and others') are not starved of the
fixture's small pool of two-to-four-top tables. Nothing was deleted.

## Not done, and known

- Only the reservation test was run from `C06-restaurant.spec.ts` (the spec
  has other tests for the menu-ordering and reserve-then-order journeys,
  which are a different area and out of scope here).
- Spanish/French storefront copy was not opened in a browser.
