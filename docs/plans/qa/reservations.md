# QA — Reservations

New rows go here. Rows already in [`../phase-boundary-qa.md`](../phase-boundary-qa.md) stay valid
and were deliberately not moved — see [README](README.md).

## The row that gates the others

The shared list's highest-value Reservations row is the one that opens the reserve block on **El
Paisa's hand-composed page** and books a table end to end. Its falsifier is the important part:

> The island is "complete and callable" but was never rendered — five recorded instances of
> *documented as wired, resolves to nothing*

That row cannot be run until a person has placed the reserve block on El Paisa's page **through the
builder**. Writing the row directly would prove the block renders when the row exists, which is not
the thing in doubt. The ruling stands that this is built on El Paisa, a real prospect, and that
nobody touches Impronta's live site to test it.

## New rows

### El Paisa guest booking — run these the hour the slug exists

Venue `b0a18aee-4d0f-4a65-90e8-da9a1b74f726`, **America/Argentina/Buenos_Aires** (Glew, Buenos
Aires — corrected 2026-09-05 from a copied Cancún zone). Every time below is the **guest's** clock,
which is the venue's, not the tester's. Derived from the seeded rows, not from intent: lunch 13:00
+180min with a 75min turn for a party of 1–2 gives a last seating of 14:45; dinner 19:00 +240min
gives 21:30. Pools hold **4** two-tops and **6** four-tops. Rules: parties 1–4, 60-day horizon,
60-minute minimum notice.

| Do this | Proves | Falsified by |
|---|---|---|
| Open the `reserve` page, party of **2**, pick today or any day in the next 60 | Lunch offers exactly **13:00, 13:30, 14:00, 14:30**; dinner offers **19:00 … 21:30** in 30-min steps | Any time after 14:30 at lunch or 21:30 at dinner — the last seating must leave a whole 75-minute turn inside the window. A 15:00 slot means the turn is being added to the wall clock instead of the instant |
| Same, party of **4** | Same window bounds, but the turn is 90 minutes, so dinner's last seating is **21:30** and lunch's is **14:30** | A four-top offered a time a two-top is not, or vice versa, on a day with no bookings |
| Ask for a party of **5** | Refusal reads "For a party that size, message us and we will sort it out" — a **real** refusal, `party_size_max` is 4 | A generic failure, an empty grid, or "fully booked". An empty list cannot say which of three things went wrong, and that is the bug this copy exists to prevent |
| Ask for a time **inside 60 minutes** from now, Buenos Aires clock | Not offered at all | Offered. Min-notice is enforced against the instant, not the label |
| Book **five** two-tops at the same time (party of 1 or 2 each) | The **fifth** is refused **sold out** — that pool holds 4 units | A fifth booking succeeding. That is oversell, and it is the one failure that costs a real table |
| After that fifth refusal, ask for a party of **3** at the same time | Still offered — four-tops are a **separate pool** with 6 units | A four-top refused because the two-tops are full. The bands are parentless on purpose; a shared parent would double-count the room |
| Pick **any** date in the next 60 days | Times are offered every weekday | **"We are closed that day" is a BUG, not a policy** — all seven weekdays are seeded active. This is the single most likely symptom of a window that failed to resolve |
| Ask for a date **61+ days** out | Refused as beyond the booking horizon | Offered. `horizon_days` is 60 |
| **Set the testing machine's timezone to something far from Argentina** (e.g. Asia/Tokyo or America/Los_Angeles), reload, repeat row 1 | The **same** local times appear — 13:00 lunch, 19:00 dinner. The strip asks the venue what today is | Different times, or a date strip whose "Today" is the tester's today rather than the venue's. This is the regression #1696 fixed; before it, the strip was built from `new Date()` in the browser |
| Load the page in **Spanish** | Every guest-facing sentence is Spanish — the refusals, the labels, the placeholders, the confirmation | Any English sentence. Before #1696 the whole block was English-only with no locale prop |
| Complete a booking end to end with an email and no account | Confirmation says **nothing was charged** before it mentions a card at all; a row appears on the host stand at `/elpaisa/admin/reservations` | A charge, a card prompt, or a booking that confirms to the guest and does not appear on the host stand. Those are two different records of one fact and they must agree |
| Double-tap **Reserve** on a slow connection | **One** booking, not two — the client order key makes the second call idempotent | Two allocations for one guest |
| After booking, look at the host stand | The reservation shows with the right party size and time **in Buenos Aires**, counters move off zero | The board shows a count the guest's confirmation contradicts |

### What a REAL refusal looks like, so a broken one is distinguishable

The engine names its refusals rather than returning an empty list, and the block turns each into its
own sentence. If any of these appears when it should not, the refusal is real and the **rules** are
wrong; if a **generic** failure appears instead of one of these, the refusal path itself is broken:

- "That party is smaller than we take online" / "For a party that size, message us"
- "We have no table that size" — no band fits, which is different from full
- "Fully booked that day" — bands fit, nothing left
- "Too late to book that online" — inside the notice
- "That is further ahead than we take bookings" — past the horizon
- "We are closed that day" — no window resolves. **On El Paisa this is always a bug.**
- "We could not reach the book just now. Nothing was booked." — a FAULT, ours, and it must never be
  worded as an absence. Telling a guest to pick another time when the engine was unreachable sends
  them hunting for a problem that is not theirs.

## Measured 2026-09-05: the reserve block is on ZERO pages, platform-wide

Read-only against production. This is the falsifier from the shared list's own Reservations row,
observed rather than predicted.

| Tenant | Pages | Published | Pages carrying the reserve block |
|---|---|---|---|
| `impronta` | 40 | 36 | **0** |
| `zero-test-studio` | 3 | 3 | **0** |
| `elpaisa` | **0** | **0** | **0** |

**The booking engine is built, tested, shipped — and nothing on the internet renders it.** That is
the sixth recorded instance of *documented as wired, resolves to nothing*, and it is the exact
outcome the QA row was written to catch:

> The island is "complete and callable" but was never rendered

### El Paisa moved, but not as far as it looks

The tenant now **exists**, which it did not when this was last checked, and it is seeded for
reservations: `takes_reservations = true`, one venue, one service rule, two service windows,
timezone `America/Argentina/Buenos_Aires`.

**It has no website.** Not an unfinished page — zero rows in `cms_pages`. So "a person places the
reserve block through the builder" is not the next step; a page has to exist first.

### Why this is not a staging problem

The three areas share one shape right now:

- **Events** — public pages live, no purchase path, so nothing is sellable.
- **Reservations** — engine live, on no page, so nothing is bookable.
- **Sessions** — no series exists, so nothing is scheduled.

Each is an engine without a door. Treating this as "seed some data so QA can run" gets a fixture and
leaves the product where it is. **Building El Paisa's page with the reserve block on it is the
staging tenant, the QA fixture and a real prospect's real site at once** — one piece of work that
closes all three, and the only part a person must do is the part the QA row exists to prove.

Constraints already ruled, unchanged: build on El Paisa, never on Impronta's live site; place the
block **through the builder**, never by writing the row — writing it proves the block renders when
the row exists, which is not the thing in doubt.
