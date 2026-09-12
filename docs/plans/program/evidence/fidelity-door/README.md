# fidelity-door: the Door mode (Tickets) and the Events destination, drawn as the boards

Builder `fid-door`, branch `work/fid-door` off `program/fidelity`, 2026-09-11.

Every `<Board>.board.png` here is the board's own HTML rendered with Chromium at
the board's viewport (POS boards 1194x834, workspace boards 1440x900). Every
`<Board>.live.png` is the branch running locally (`npm run dev` on the isolated
env, `web/.env.capacity-isolated.local`, signed in as the fixture owner through
`/api/dev/signin`, tenant host `qa-journeys.local` through the local host
proxy), at the same viewport, on the fixture workspace's OWN rows. The board's
sample data (Rooftop Jazz, Tomás, $400) is illustrative; the live shots show
"QA Night", "Prove class ..." and $0.00 tiers because that is what the fixture
holds. Nothing in production was written or read.

The Door mode's screens are the counter's own frame (`PosFrame`, `PosHeader`,
`PosSheet`, `CollectSheet`, `ReceiptsScreen`, `IssuesScreen`, `pos-classes`)
so Door and Counter look like one product. Copy is in three languages under
`dashboard.pos.door.*` and `dashboard.events.*` (`web/messages/{en,es,fr}.json`).

## POS boards (1194x834)

| Board | Live | Verdict | What differs and why |
|---|---|---|---|
| `POSGateReady` (G01) | `POSGateReady.live.png` | matched | The board has no visible field; a keyboard-wedge scanner needs a focused input, so the one field under the hero ("Or type the code from the ticket") is drawn compact with its Admit button. |
| `POSGateAdmitted` (G02) | `POSGateAdmitted.live.png` | matched | Detail is the engine's sentence ("In. Welcome." / "In. 2 of 4 through the door."); the holder's name is shown when the tap knew it (manual admit); a scan does not carry the holder. `Redeem meal` disabled with its sentence (D-POS-54). |
| `POSGateAlready` (G03) | `POSGateAlready.live.png` | matched | `Let in anyway · manager` disabled: `check_in` has no override (D-POS-54). |
| `POSGateWrong` (G04) | not shot | matched by code, no fixture row | The fixture has no ticket for another night of the same event to scan; `wrongNightDated` renders "Wrong night · This ticket is for {date}" and `Exchange date · box office` disabled (D-POS-54). Same hero component as G03 with the coral/red tone from `doorVerdict`. |
| `POSGatePending` (G05) | none | **not wired** | The engine has no "refund requested" state on an admission (D-POS-54); a refunded ticket scans as G07. Not faked. |
| `G07_GateCancelled` | not shot | matched by code | `refunded` / `cancelled` verdicts render the red hero with `Look up the order` wired to the Lookup rail. No refunded ticket exists on the fixture night. |
| `G08_GateManualAdmit` | `G08_GateManualAdmit.live.png`, `G08_GateManualAdmit.after.live.png` | matched | Left column (search, order card with per-ticket pills, the note) and right panel (Right / Entrance / Counts / After facts; Reason and Authorized by drawn disabled with their sentences, no column; footer Cancel / `Admit <name> · counts once` wired to `admitAtDoor`). The `.after` shot is the Admitted hero the tap produced, with the holder's name. |
| `POSBoxOffice` (G06) | `POSBoxOffice.live.png` | matched | Tiles are the session's tiers with `n left` from `capacity_remaining_public`; Recent card is this till's scans; basket is the draft order (`posDoorOpenTicketSale`, `posDoorAddTicketLine`, `posUpdateLine`, `posRemoveLine`, re-read by `posDoorReadSale`); Charge is `Continue · N tickets` because seats are held at cash time (D-POS-55). `Buyer (optional)` opens the attendees step. |
| `E01_ChooseEvent` | `E01_ChooseEvent.live.png` | matched | Events on sale grouped from tonight's list, dates on the right, Continue · date. "Presale", "RSVP" pills need columns the row lacks; every event reads On sale. |
| `E02_TicketsQty` | `E02_TicketsQty.live.png` | partially | Quantities are the basket's steppers on the right (G06's layout) rather than on the tier rows; "Early bird / phase ended" needs price phases (not built, D-POS-56). |
| `E03_Seats` | none | **partial** | Seat chips on Event › Venue (`admissionHoldSeats`). Not the public checkout map. |
| `E04_Attendees` | `E04_Attendees.live.png` | matched | Buyer card + one row per ticket; names go on the minted rows in line order (`attendeeNames`). The 18+ confirmation has no column. |
| `E05_HoldExpired` | none | **partial** | Hold expiry is returned on `admissionHoldSeats` and reaped in `expire-orders`. No dedicated expired-hold sheet. |
| `E06_Issued` | `E06_Issued.live.png` | matched | Print / Text / Resend disabled with their sentences (D-POS-55); the signed code is the ticket; receipt link is the real `/r/<code>`. |
| `E07_IssuePending` | not shot | matched by code | Renders when a paid collect minted no row; `Try issuing again` is `resumeExceptionAction("mint_missing_admissions")` re-read through `posDoorIssuedTickets`. Could not be forced on the fixture without breaking the mint. |
| `E08_CustomerTicket` (390x844) | none | **partial** | Public `/ticket/[code]` (D-POS-77): transfer, resend email, lookup. |
| `E09_TicketLookup` | `E09_TicketLookup.live.png` | matched | Grouped by order; `Admit <ref> · <name>` is `admitAtDoor`; `Resend all tickets` disabled (D-POS-55). |
| `E10_Transfer` | `E10_Transfer.live.png` | **partial** | Drawn as a 600px sheet over the lookup. Transfer is `ticketTransfer` when the row has a signed code. `Cancel & refund` is `refundOrderAtDesk(cancel_ticket)`. `Name it` is `posDoorNameTicket` (E13). |
| `E11_Exchange` | none | **partial** | Door Change sheet: `admissionExchange` to another night of the same event. Price-up returns `price_up_needs_payment`. |
| `E12_Comp` | none | **partial** | Event Day tab: `admissionComp`. Not a till tile. |
| `E13_NameTicket` (390x844) | in `E10_Transfer.live.png` | matched (as the Name card) | The name form lives on E10's fourth card. |
| `E14_MultiDay` | none | **partial** | CreateEvent Pass model writes `eventSeriesUpsert`. Nights still come from Sessions. |
| `E15_Delivery` | `E15_Delivery.live.png` | **partial** | Email and print call `admissionDeliver`. SMS and wallet stay `channel_unavailable`. |
| Door rail: Receipts / Issues | `Receipts.live.png`, `Issues.live.png` | matched | Receipts are the door's own paid sales (`listPaidPosSales` with `sourcePage: "door"`); Issues is the counter's own sentence (D-POS-28). |

## Workspace boards (1440x900)

| Board | Live | Verdict | What differs and why |
|---|---|---|---|
| `W16_EventsList` | `W16_EventsList.live.png` | partially | Heading, segments with counts, List/Calendar, filters, Used-in line and the seven columns match. Venue, Sold, Left and Door alloc. print a dash with the reason (per night; not on the row) (D-POS-56). Templates, Import, Calendar, the filters are disabled with their sentence. |
| `CreateEvent` | `CreateEvent.live.png` | partially | Essentials step: name, sales model and doors offset write (`createEvent`); every other field has no column and is disabled with its sentence; Dates preview and Readiness say what exists; steps 3 to 5 point at the Sessions page and the event's tabs (D-POS-56). |
| `EventDetail` | `EventDetail.live.png` | matched | Header with date chips, zone, state, Preview / Share (disabled) / Open event day; ten-row sub-nav; Tickets & Offers with the four figures from the night's pools, the seven-column table, Add ticket type (`addTier`), row menu → inline editor (`updateTier`), Ticket settings, Venue commitment (disabled). Price phases / Packages / Allocations sub-tabs have no column. |
| `W17_EventVenueSeating` | `W17_EventVenueSeating.live.png` | **partial** | Layout select and Save are `eventSeatMapUpsert`. Change venue, blocked interval and dining stay disabled. Seat hold is E03 on this tab. |
| `W18_EventDaySettings` | `W18_EventDaySettings.live.png` | partially | Every rule is drawn disabled with the engine's fixed answer (D-POS-57); Save disabled; `Open POS · Tickets` wired; Readiness derived from rows. |

Not touched: the public checkout (E01-E06 on the tenant site), the canonical
`/admin/events/door` page (the workspace's Live check-in, still on raw
Tailwind), and the Tables / Reservations / Kitchen files.

## Not wired (each drawn disabled with a sentence in en/es/fr)

- Gate: Redeem meal, Let in anyway · manager, Exchange date · box office; manual admit's Reason and Authorized by (D-POS-54).
- Box office / issued: Print tickets, Text link, Resend email, Sent by email pill, Give a paper confirmation (D-POS-55).
- Lookup: Resend all tickets. SMS and wallet delivery stay unavailable.
- Events: Templates, Import, Calendar view, Venue and Sales filters, Share, Add price phase, Add package, Price phases / Packages / Allocations sub-tabs, Change venue, Blocked interval, Dining, W18's fourteen rules and Save, CreateEvent's non-essential fields and steps 3-5 (D-POS-56, D-POS-57).

Extra live shots: `POSGateForged.live.png` (a code that does not check out, the
red hero), `POSGatePickEvent.live.png` (the night picker before a gate is
open), `E04_Collect.live.png` (the counter's collect surface inside the door),
`EventDetail.overview.live.png` (the Overview tab with Publish / Cancel).

## Gates (this branch, `web/`, each exit code the command's own)

| Command | Exit |
|---|---|
| `TSC_QUEUE_LOCK=/tmp/tulala-tsc.fid-door.lock TSC_QUEUE_TICKETS=/tmp/tulala-tsc.fid-door.tickets npm run typecheck` | 0 (`TSC PASS`, verdict file `/tmp/tulala-tsc.4029040c.last`) |
| `npm run lint` | 0 |
| `npm run test:design-system` | 0 (fail 0) |
| `npm run test:tenant-isolation` | 0 (fail 0) |
| `npm run test:size-ratchet` | 0 (fail 0) |
| `npm run test:phase1-i18n` | 0 (fail 0) |
| `npm run test:ai-guardrails` (the help corpus test that names `EventsPage.tsx`'s path) | 0 |
| `npm run test:events`, `npm run test:sessions` | 0, 0 |
| `tsx --test src/lib/pos/door-model.test.ts`, `.../events/events-model.test.ts` | 0 (6 pass), 0 (8 pass) |
| `npx playwright test e2e/journeys/pos-door.spec.ts` (local dev, isolated DB) | 0 on run 9 (5 passed, 3.2 min; `playwright-pos-door.run9.log`). Runs 1-8 failed on dev-server churn outside the door (Fast Refresh remounts, a dev sign-in 404 after the server degraded, the Sessions event select, the counter's Cash rail before hydration) and on three selector updates to the new structure; none on a door assertion once the spec reached it. |
| `npx playwright test e2e/cases/C12-event-venue.spec.ts e2e/cases/SELL-catalog-events-spaces-discounts.spec.ts` | 1 on run 11 (`playwright-C12-SELL.run11.log`): 4 passed including `C12-OP door` (the canonical `/admin/events/door`) and SELL's Events step (`02-events.png`, "QA Night" visible on the new list); the two failures are outside this group: `C12-DIFF` on the PUBLIC ticket picker's pay-at-door hold (`[data-ticket-picker=held]`, untouched) and SELL's step 3 on `/admin/spaces` (Tables, another builder's area) after the Events step had passed. |

Selector updates in `pos-door.spec.ts` (structure, never a weaker assertion):
the rail's `Box office` is `Sell tickets`; the box office is E01 → E02 → E04 →
cash (`data-door-event`, `data-door-session`, `data-door-continue-date`,
`data-door-tier`, `data-door-total`, `data-door-continue`, `data-door-review`,
the counter's `Cash received`); the gate's count is the header chip `0 of 1 in`
/ `1 of 1 in`; the guest list is behind `Look up by name`; the scanner presses
Enter in `#door-scan`; verdicts assert the headline AND the sentence
(`Admitted` + `In. Welcome.`, `Already used` + `already admitted`, `Not a
ticket` + `not a valid ticket`); the walk-up scene sells at the box office and
scans at the gate (same DB assertions: two paid orders, two cash transactions
stamped with the drawer, two admissions each admitted once, two committed
seats). The Events scene creates through W16 → CreateEvent → EventDetail and
asserts the honest `noNight` state after publishing with no night. The counter's
`Shifts` rail is `Cash` on `program/fidelity`, and its open-drawer state is
`[data-pos-close-and-count]`.
