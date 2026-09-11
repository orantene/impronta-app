# host-events-presale: the public event page sells a ticket, on the deployed QA host

Proved by agent `host-b`, 2026-09-11, against `https://staging-qa-journeys.tulala.digital`
(Vercel deployment `tulala-5e3o227vw`), confirmed serving commit `867e0ecc2`
(`sentry-release=867e0ecc2582990c2054aceb63ba55910f4f18c7` — same check as
`docs/plans/program/evidence/host-classes/README.md`). Database: Supabase
branch `fxlankepwnvelxjrahwk` (qa-journeys). Production `pluhdapdnuiulvxmyspd`
was never read from or written to.

## Spec reused, and the fix it needed

`e2e/cases/C12-event-venue.spec.ts`, test `C12-CUS ticket: /events/qa-night
General admission → receipt and DB agree`. Opens the fixture event's public
page (`/events/qa-night`), picks the night and the "General admission" tier
on the ticket-picker block (`[data-ticket-picker=root]`), fills name +
email, buys — no sign-in, guest checkout, the fixture tier is $0 (the
"cash/mock" path this fixture ships: no real payment provider needed to
prove the presale mechanics; the same block also offers paid tiers via
Stripe elsewhere, not exercised here per the local proofs' own scope). The
order lands `paid`, an `admissions` row and a `committed`
`capacity_allocations` row are minted.

**Run 1 failed** (`run1.log`, exit 1): `getByText("ticket_picker")` on
`/admin/sales` timed out. The DB assertions immediately before it had all
passed (order paid, `total_cents 0`, admission + allocation present) — the
failure was purely the Sales-list UI check. The page snapshot on failure
showed the row WAS there: `"Order 5FE08A21 Ticket page C12 guest Free paid"`.
The Sales list now renders the channel's humanised label ("Ticket page")
instead of the raw `source_channel` value (`ticket_picker`); this spec's
three UI assertions (lines 74, 135, 220) still checked for the raw string.
This is a real difference between what the spec was written against and
what `main` ships today (a copy/label change), not a defect in the running
application — the row, customer, amount and status were all correct.

**Fix applied** (this branch, `e2e/cases/C12-event-venue.spec.ts`): the three
`getByText("ticket_picker")` UI assertions were changed to
`getByText("Ticket page")`, matching the rendered label. The two DB
assertions that check `sourceChannel` (the raw column, read straight from
Supabase) were left untouched — they are correct and unaffected. A comment
was added at the top of the file dating and explaining the change. This is
not a weakened test: it asserts the same fact (this order's channel is
shown, correctly, on the Sales list) with the string that is actually
correct today.

**Run 2 passed** (`run2.log`, exit 0, 12.7s) with the fix in place — see
below.

## Command and exit code

```
PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital \
JOURNEYS_B_ORIGIN=https://staging-qa-journeys-b.tulala.digital \
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 \
npx playwright test e2e/cases/C12-event-venue.spec.ts -g "C12-CUS ticket" --project=chromium --workers=1 --reporter=line --trace=on
```
Run 1: exit 1 (label mismatch, see above). Run 2 (after the fix): exit 0 —
**1 passed (12.7s)**.

## What was proven

A guest with no account buys a General admission ticket for "QA Night" from
its public page; the ticket picker returns a receipt URL (`/r/<code>`); the
order is `paid` for $0.00, `source_channel = ticket_picker`,
`session_id` = the night's session, with a real `admissionId` and a
`committed` `allocationId`. Staff sign-in afterward and see the order on
`/admin/sales`, correctly labeled "Ticket page", customer "C12 guest",
"Free", "paid" — no "could not load" error, no false "overdue".

Screenshot: `screenshots/c12-cus-sales.png` (the Sales list showing the row).

SQL ground truth (`sql-after-journey.json`, service role, never printed):
order `998e3e5d-8f1b-4eba-a907-41b6e0f5aeee`, `status paid`,
`total_cents 0`, `source_channel ticket_picker`, receipt code
`hgzy7kxkzbdvrjdq3trp`; admission `483b4469-3cb9-4150-8206-2c062a7d40ef`,
`status valid`, `session_id` = QA Night's session, `holder_name "C12 guest"`,
`holder_email` the run's marker; allocation `d8da73e4-15de-4420-a892-48fd69adefae`
on the night's pool, `state committed`, `units 1`.

## Difference between local and host

Yes — see "Spec reused, and the fix it needed" above: a Sales-list label
change (`ticket_picker` → "Ticket page") post-dates this spec's last
verified run and was only surfaced by running against the current deployed
commit. Fixed in the test, not the application (the application's behaviour
is correct). No application code was changed.

## Fixture state left behind

One `paid` $0.00 `ticket_picker` order, one `admissions` row, one `committed`
`capacity_allocations` row on the QA Night session's General-admission pool.
Nothing was deleted.

## Not done, and known

- Only the guest-purchase test (`C12-CUS ticket`) was run; the spec's other
  tests (door admission, a second guest filling the night) are a different
  proof (door/admission operations) and out of scope for "events presale".
- A genuinely paid (non-$0) tier through Stripe was not exercised — this
  fixture's night sells at $0, which is the existing mock/no-payment-required
  path; card payment on the public ticket picker is unproven here.
