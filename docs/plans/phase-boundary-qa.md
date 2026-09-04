# Phase-boundary QA list — the owner clicks this ONCE

**Status:** seeded by the CEO 2026-09-04. This file did not exist; managers were being told to
"batch QA" with nowhere to batch it to.

## The rule
Managers do **not** ask the owner for click-verification per slice. Every item that genuinely needs a
human with a browser or a phone goes here, with **exact steps and the exact thing that would falsify
it**. The owner runs this list once at the phase boundary. A slice ships on tests and CI; it is
**not called finished** until its line here is ticked.

Write items so someone who has never seen the code can execute them. One line per item:
`| area | what to do | what proves it | what would falsify it |`

## Items

| Area | Do this | Proves | Falsified by |
|---|---|---|---|
| Events E8 | Buy a ticket, open the receipt on a **real iPhone** (Safari or installed PWA), scan the QR with the door tool | Camera scan works on the device the owner described | Anything green from the iOS Simulator or desktop Chrome — the Simulator **has no camera** and proves nothing |
| Events E8 | Scan the **same** QR a second time | Goes red, "already scanned" | Green twice |
| Events E8 | Refund a ticket, then scan it | Goes red **with the reason** | Admits, or red with no reason |
| Events E8 | Sell one admission at the door as **cash** | Admission recorded, seat consumed, **zero commission**, stated plainly in the UI | A fee appears, or the seat is not held |
| Commerce | Platform Admin → Commerce → Commission: change the take, the fixed floor and the buyer/seller split, save, then run one real checkout | The saved value actually reaches a live charge | The page saves but the charge uses the old number |
| Tenant pages | Open a `/w/<slug>` tenant page **in a browser** and interact | The hydration SEV-1 is really closed | An error card after a correct-looking server render — no curl, smoke test or crawler can see this |
| Reservations | Book a table end to end as a guest, then check it in at the host stand | One scanner, one RPC, works on a table | A second scanner exists |
| Reservations | On El Paisa's **hand-composed** page, book: party, date, time, name, email | The `reserve_table` island renders and reserves on a REAL page | The island is "complete and callable" but was never rendered — five recorded instances of *documented as wired, resolves to nothing* |
| Reservations | Tap the party stepper fast, 2 → 6, and watch the times | The list shown matches the party finally selected | Times for a party you are no longer booking — a slow response landing after a fast one |
| Reservations | Tap **Reserve** twice quickly | One booking, not two | Two bookings, or a dead button that does nothing on retry after a refusal |
| Reservations | Force a capacity refusal | Copy says **"Nothing was booked"** in en and es | Any wording that leaves a guest unsure whether they double-booked |
| Reservations | Settings → Reservations: set party 1–8 and card-on-file from 6, save, reload | Both numbers survive; unchecked card-on-file reads **"never"**, not 0 | A workspace with no venue renders an empty form instead of saying so |
| Sessions | Create a series, then open the workspace **Calendar** | Occurrences appear, labelled as sessions rather than blank | A session renders unlabelled and indistinguishable from an inquiry |
| Sessions | Schedule a class into a spring-forward gap at a venue with another class on that instant | Refusal **names what it collided with** — "Salsa at this venue. Move one of them." | A refusal a human cannot distinguish from a different refusal |
| Cross-area | On a **non-UTC** venue, put a class at 20:00 in Cancún and a show at 01:00 in Madrid | Each lands on its own local day column | Either lands a day out — `_data-bridge/calendar.ts:27` slices the UTC date for orders, bookings and holds |

## Owner-hands items (not clicks — these need an account or a bank)
Kept separate so the QA pass is not blocked behind them.

- MX + SPF for `tulala.digital` on the existing impronta.group Google Workspace, and who reads that mailbox. **Every prospect emailing hello@ bounces today.**
- Bank ···4702 re-verification.
- Subscribe `refund.failed` and `refund.updated` in Stripe.
- Set `STRIPE_ALLOW_LIVE_PAYOUTS=false`.
- Stripe Tax head office.
- **The card-mix answer:** will these eleven businesses' customers pay mostly with Mexican cards or
  mostly foreign — above or below ~2/3? Unsure defaults to staying put, which is safe.
