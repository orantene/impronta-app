# fidelity-counter: the POINT OF SALE COUNTER family, board by board

**Group.** The tablet counter (1194x834) and its portrait sibling (834x1194):
`POSCounter` and the 30 boards that open from it. Boards live at
`tulala-canvas/v3/<Board>.dc.html`; `board.png` in each folder is that HTML
rendered at the board's viewport, `live.png` is the running app at the same
viewport (local `next dev` on the isolated QA database `qa-journeys`,
signed in as the fixture owner, the dev-only identity banner removed from
the shot so the frame is the board's 834px; the shell's own 56px top bar
stays because the counter is entered through its Workspace/Counter switch).

**Branch.** `work/fid-counter` off `program/fidelity`. Nothing was pushed;
production was never read or written; `npm run db:push` was never run.

**What changed.** `web/src/components/admin/pos/**` is the board's screen
set (rail, header, sell surface, basket, sheets, dialogs, collect, drawer,
receipts, issues, devices, connection, scan) over the existing readers and
actions; `pos-client.tsx` wires it. `PosFrame` keeps its data-driven rail
(`POS_MODE_META.counter.destinations`, now `sell · orders · receipts · shifts
· issues`). `CustomerPanel`, `ShiftBar` and `counter-panels.tsx` were
deleted, replaced by the sheets and the Cash screen. One reader was added
(`listPaidPosSales`, beside `listOpenPosSales`) for the Receipts screen. The
POS chrome is bound to the admin palette in `globals.css` (the muddy-grey
defect on tenant hosts), and its `h1` is capped there because the
storefront's unlayered `h1` rule beat every utility on the 19px header.

## Per board

| Board | Verdict | What differs and why |
|---|---|---|
| POSCounter | matched | Rail, header, search-or-scan, chips, 4-up tiles with badges, basket with Customer · Booking · Here/To go, totals, Charge, Hold · Send, Saved hh:mm. The fixture's catalog is what the workspace sells (long QA titles at $0.00); `Favorites` is disabled with its sentence (D-POS-31); `Options` / `N left` / `Sold out` badges have no source data on this fixture, `Pick session` and `Approval` render. |
| POSCounterES | matched | The same screen with the `locale=es` cookie; every string from `messages/es.json`. |
| POSCounterPortrait | partially | Rail hidden, `Counter ▾` chip with the destinations menu, 3-up tiles, basket as a bottom sheet with `Basket · N items`, Total, Charge, Hold · Send. The board's header search/scan icons stay as the inline search bar; the sheet does not collapse. |
| POSCounterOffline | partially | `Offline · cash only` chip, `Card · offline`, the footer sentence. Honest divergence: Charge is disabled and the footer says nothing can be saved, because nothing is queued on the device (D-POS-5, D-POS-29); the board's `Cash $95` and `will sync` would be a promise the engine cannot keep. |
| POSEmptySale | matched | Bag icon, `Nothing in this sale yet`, the sentence, `Held sales · N` (real count of open drafts), disabled `Charge`. |
| POSLineEdit | partially | Quantity stepper (live, saved on `Save changes`), `Duplicate`, `Remove line`, line total, `Unsaved changes`. Options, notes, Served by, Line discount disabled with sentences (D-POS-16); price locked (D-POS-17). |
| POSCustomAmount | not wired | Sheet, fields, amount box, keypad and note render from the last tile; `Continue` opens the approval dialog. No engine path for a free-text line (D-POS-20). |
| POSManagerApproval | not wired | Card, PIN dots, the status sentence, PIN pad; `Approve` disabled with the sentence (D-POS-20). |
| POSDiscount | partially | Tabs, code field, eligible lines, Before/Discount/After, the refusal alert; `Enter a code` is live (`posReprice`). Manual and Comp disabled with sentences (D-POS-19). |
| POSHoldSale | partially | Dialog, subtitle with sale ref · total · items, `Back · Discard sale · Hold sale` live. `Name it` disabled with its sentence (D-POS-21). |
| POSHoldExpired | partially, no live shot | Dialog wired to the engine's `capacityGone` refusal on a session line (D-POS-22); could not be triggered on the fixture (no class place lapses during a run). `live.png` is the counter it opens over. |
| POSCustomer | matched | Search box, hits with initials and contact line, `New customer “q”`, `No customer (walk-in)`, the cashier note. Balance-due pills have no reader. |
| POSCustomerCreate | partially | Name · Phone · Email, the duplicate alert with `Use existing` / `It's a different person`, `Save & add to sale`. Language and offers disabled with sentences (D-POS-18). |
| POSCustomerCreateKeyboard | partially | Same sheet with the email field focused; the on-screen keyboard is the tablet OS's, not the app's. |
| POSCustomerAttachFailed | partially, no live shot | View built and unit-tested (`PosScreens.smoke.test.tsx`); reached only when a picked row vanished between render and tap, which the fixture did not produce. `live.png` is the create view. |
| POSLinkBooking | not wired | Sheet, `Show paid bookings`, `AFTER LINKING` card, `Keep separate` live; `Link only` / `Link & pay` disabled (D-POS-23). |
| POSCashTender | matched | Summary card ending `To collect`, `HOW` tiles (cash · card · link · pass · transfer · two methods), quick tenders (`Exact` + three round figures), `Customer gives`, keypad, `Change to give`, `Cash received · give $X`. Card/pass/transfer/split tiles carry their unavailability sentences. |
| POSCashTenderES | matched | The same in Spanish. |
| POSCashShort | matched | Coral `Still short $X`, `Take $X · rest by card` (disabled, D-POS-24) and `Confirm cash` disabled. |
| POSCashDone | partially | `Drawer open`, the change figure, `Received … recorded as cash`, the note, `Done · receipt`. `Open drawer` disabled (D-POS-25). `live-after-done.png` is the paid screen it leads to. |
| POSCashOpen | partially | Drawer / Responsible (disabled, one per workspace), `Starting cash · counted` with keypad, `Open drawer · start with $X` (live: `openShift`), `ONCE IT'S OPEN` tiles disabled. No `YESTERDAY` card: there is no reader for the last closed shift. |
| POSCashClose | partially | Denomination steppers feeding `Counted` (typed total also accepted), `Started with`, `I confirm this count`, `Back · Close drawer` (live: `closeShift`). Expected cash is blind and appears in the result (`live-closed.png`); `What happened` disabled (D-POS-26). |
| POSCashShort | see above | |
| POSCashMovements | partially | Movement tiles and the hand-over card disabled with sentences, the list says why it is empty, `Close drawer & count` live (D-POS-26). |
| POSReceipts | partially | Search, `Today · Yesterday · This week`, rows with time · #code · customer · summary · amount from `listPaidPosSales`; a row opens `/r/<code>`. `Cash · Card · Refunds` disabled (D-POS-27). |
| POSIssues | not wired | Frame with disabled filters and one sentence (D-POS-28). |
| POSIssueDetail | not wired | No rows exist to open; `live.png` is the Issues screen. |
| POSLock | not wired | `Lock` on the rail disabled with its sentence (D-POS-31); `live.png` is the counter showing it. |
| POSDevices | partially | Six device cards from real facts (reader from `reportTerminalAvailability`, scanner listening, display as a window, printers and drawer not set up), `WHILE THE READER IS OFF`, `INTERNET`. Reached from the cashier chip's menu. |
| POSScan | matched | Scan glyph, `Scan a code`, filter (narrow options disabled, D-POS-30), `TYPE IT INSTEAD` with keypad and `ABC`, `Look up` (live: `posResolveScanCode` + `posAddLine`). |
| POSScanProduct | matched | The bottom-left toast `Added · House pizza · $18.00` / `Scanner ready for the next code` with `Undo` (live: `posRemoveLine`). |
| POSConnection | matched | Connected/offline card with `Try again`, `YOU CAN` rows from the real state, `CARD READER`, `WAITING TO SYNC` says nothing is queued (D-POS-29). `live-offline.png` is the same screen with the browser offline. |

## Not wired (every one is a disabled control with a one-sentence reason in en, es and fr)

Favorites chip · Lock · location chip menu · Options / notes / Served by /
Line discount on a line · price change · Language and offers on a new
customer · Manual discount / Comp · Custom amount and Approve · Name a held
sale · Hold it again · Link a booking (Link only, Link & pay) · Bank
transfer · Two methods · Take partial cash · Open drawer (device) · cash
movements, hand-over, close note, drawer/responsible choice · Receipts
method filter · Issues and its filters · Scan narrowing · Devices: reconnect
reader, test print, open drawer. Decisions D-POS-15 to D-POS-31 in
`docs/plans/program/pos/decisions.md`.

## Gates (private lane, 2026-09-11, real exit codes)

| Gate | Exit |
|---|---|
| `TSC_QUEUE_LOCK=… npm run typecheck` | 0 |
| `npm run lint` | 0 |
| `npm run test:design-system` | 0 (99 pass) |
| `npm run test:tenant-isolation` | 0 |
| `npm run test:size-ratchet` | 0 (after acting on the `auth.getUser()` error the unchecked-read guard flagged) |
| `npm run test:phase1-i18n` | 0 |
| Playwright `POS-counter-cash-sale.spec.ts` (4 tests), `pos-scanner.spec.ts`, `pos-customer-display.spec.ts` | 0 for every test on the final runs (`pw8`: 5 of 6 green; the sixth, "a sale changed underneath the operator", failed on a tile tap landing before hydration on a fresh second tab and passed on `pw9` once the tap waits for the tile to be live; no assertion changed) |

Run against the local dev server on `qa-journeys` behind a host proxy
(`localhost:3151` presenting `qa-journeys.local`, with `x-forwarded-host`
set to the browser's own origin so server actions accept the request). A
first combined run of every counter-touching case spec (C06, C26, VENUE,
POS-floor-mode as well) hit the dev server's known stale-`.next` 404 state
after 13 minutes (the prove-counter README documents it); those four sibling
specs had their selectors updated to the new structure (no assertion
weakened) but were not re-run green here after the server restart, and are
reported as such.

Selectors changed, never weakened: the shift open/close now goes through
`Close drawer & count`; the second unit through the line editor; the buyer's
name through the customer sheet; the paid screen through the drawer dialog;
`Discard sale` through the hold dialog; `Send N items` replaces the prep
destination select (a check opened from the floor sends a table ticket, `To
go` a pickup with its `Ready at` time), and the sign a ticket went is the
action reading `Send again`.
