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
| POSCustomAmount | **matched** (re-verified 2026-09-11, wire-pos-money) | Sheet, `What is it?`, Reason, `Report as` (still disabled, D-POS-20), amount box, keypad, the `Over your $50.00 limit · a manager will approve on the next step` / `Within your limit` note from the workspace's own limit, `Cancel · Continue · ask a manager` (or `Add to sale` under the limit). `Continue` is `posAddCustomLine` (`kind=custom`, idempotency key derived from sale · version · amount); a line over the limit lands locked (`Needs approval` pill on the basket, a tap reopens the dialog). `live.png` is the sheet at $650.00 over a $50.00 limit. |
| POSManagerApproval | **matched** (re-verified 2026-09-11, wire-pos-money) | `Manager approval` / `Custom amount $650.00 · cashier · over $50.00 limit`, the item / amount / reason card, `Who approves` (one tile per manager holding a register PIN; a sentence and the door to People when none does), the PIN dots (4 to 6), the PIN pad, `Cancel · Approve` (`posApproveCustomAmount` with the picked approver, D-POS-83). Every refusal is the engine's sentence in the red alert; `live.png` is the dialog after a wrong PIN (`That PIN is not right.`); `live-approved.png` is the basket once the right PIN unlocked the line. Differs: the approvers row makes the dialog scroll at 834px, the item card sits above the fold. |
| POSDiscount | partially | Tabs, code field, eligible lines, Before/Discount/After, the refusal alert; `Enter a code` is live (`posReprice`). Manual and Comp disabled with sentences (D-POS-19). |
| POSHoldSale | partially | Dialog, subtitle with sale ref · total · items, `Back · Discard sale · Hold sale` live. `Name it` disabled with its sentence (D-POS-21). |
| POSHoldExpired | partially, no live shot | Dialog wired to the engine's `capacityGone` refusal on a session line (D-POS-22); could not be triggered on the fixture (no class place lapses during a run). `live.png` is the counter it opens over. |
| POSCustomer | matched | Search box, hits with initials and contact line, `New customer “q”`, `No customer (walk-in)`, the cashier note. Balance-due pills have no reader. |
| POSCustomerCreate | partially | Name · Phone · Email, the duplicate alert with `Use existing` / `It's a different person`, `Save & add to sale`. Language and offers disabled with sentences (D-POS-18). |
| POSCustomerCreateKeyboard | partially | Same sheet with the email field focused; the on-screen keyboard is the tablet OS's, not the app's. |
| POSCustomerAttachFailed | partially, no live shot | View built and unit-tested (`PosScreens.smoke.test.tsx`); reached only when a picked row vanished between render and tap, which the fixture did not produce. `live.png` is the create view. |
| POSLinkBooking | **matched** (re-verified 2026-09-11, wire-pos-money) | `Link a booking` / `{customer} · choose what this payment is for`, one radio row per booking of the attached customer with its balance line (`Balance $50.00 due at visit · this sale's 1 items become extras on the booking`; a ticket reads `Nothing to collect · N guests`), `Show paid bookings`, `AFTER LINKING` (booking balance · this sale · charge), `Keep separate · Link only · Link & pay $x`. Rows are `posBookingCandidates` (the customer's `agency_bookings` and `admissions`; `talent_bookings` carry no customer and are never offered; the sale's own `POS sale` shell is excluded); the two forest actions are `posLinkBooking`, and the basket line then carries `Linked · Gel manicure`. With no customer attached the sheet says so and offers the customer sheet. `live.png` is Laura Méndez's Gel manicure booked on the Front desk. |
| POSCashTender | matched | Summary card ending `To collect`, `HOW` tiles (cash · card · link · pass · transfer · two methods), quick tenders (`Exact` + three round figures), `Customer gives`, keypad, `Change to give`, `Cash received · give $X`. Card/pass/transfer/split tiles carry their unavailability sentences. |
| POSCashTenderES | matched | The same in Spanish. |
| POSCashShort | matched | Coral `Still short $X`, `Take $X · rest by card` (disabled, D-POS-24) and `Confirm cash` disabled. |
| POSCashDone | partially | `Drawer open`, the change figure, `Received … recorded as cash`, the note, `Done · receipt`. `Open drawer` disabled (D-POS-25). `live-after-done.png` is the paid screen it leads to. |
| POSCashOpen | partially | Drawer / Responsible (disabled, one per workspace), `Starting cash · counted` with keypad, `Open drawer · start with $X` (live: `openShift`), `ONCE IT'S OPEN` tiles disabled. No `YESTERDAY` card: there is no reader for the last closed shift. |
| POSCashClose | **wired, frame owed** (2026-09-11, wire-pos-money) | Denomination steppers feeding `Counted`, the right card with `Started with` and the shift's own movement sums (`Drop to safe −$300.00` beside the float), `Should be in the drawer` (blind until the close, as before), `Handed over to {name} · recorded with this count` when the movements screen chose one, `What happened` (live: `closeShift`'s `closeNote`), `I confirm this count`, `Back · Close drawer` (`closeShift` with `handedOverTo` and the note, D-POS-86). |
| POSCashShort | see above | |
| POSCashMovements | **wired, frame owed** (2026-09-11, wire-pos-money) | `Add cash · Take cash out · Drop to safe` open the movement dialog (amount keypad, reason; `posRecordShiftMovement`); the list is the shift's `pos_shift_movements` rows with time · kind · reason · signed amount; `Open drawer (no sale)` stays disabled (no drawer device, D-POS-28). `HAND THE DRAWER TO SOMEONE`: `New responsible` from the workspace's people, `We counted it together`, `Hand over to {name}` (carried into the close, D-POS-86), `Close drawer & count`. Differs: the board's list mixes cash sales into the movements; the engine's list is movements only, and cash sales are the close card's own figure. |
| POSReceipts | partially | Search, `Today · Yesterday · This week`, rows with time · #code · customer · summary · amount from `listPaidPosSales`; a row opens `/r/<code>`. `Cash · Card · Refunds` disabled (D-POS-27). |
| POSIssues | not wired | Frame with disabled filters and one sentence (D-POS-28). |
| POSIssueDetail | not wired | No rows exist to open; `live.png` is the Issues screen. |
| POSLock | **matched** (re-verified 2026-09-11, wire-pos-money) | `Lock` on the rail is `posLockTill` (the device key lives in `localStorage`, `pos.deviceKey`; a locked tablet stays locked across a reload through `posCurrentDeviceSession`). The screen: the lock glyph, `Who's on the register?`, `The drawer stays {name}'s until it's handed over`, one tile per person holding a register PIN (initials · name · role), the PIN dots, the pad, `Unlock`, and the wrong-PIN line under it (`That PIN is not right.` from the engine). The cashier chip's menu gains `Switch operator`, the same card as `posSwitchOperator`; the chip then names the operator the session says. `live.png` is the lock after a wrong PIN. Differs: `Unlock` is a button (a PIN is 4 to 6 digits, so four dots are not an answer), and only people with a PIN are tiles. |
| POSDevices | partially | Six device cards from real facts (reader from `reportTerminalAvailability`, scanner listening, display as a window, printers and drawer not set up), `WHILE THE READER IS OFF`, `INTERNET`, plus a `pos_devices` registry panel (`posDeviceRegister` / `posDevicesList`). Reached from the cashier chip's menu. Pair also lives on Settings › POS (W20). |
| POSScan | matched | Scan glyph, `Scan a code`, filter (narrow options disabled, D-POS-30), `TYPE IT INSTEAD` with keypad and `ABC`, `Look up` (live: `posResolveScanCode` + `posAddLine`). |
| POSScanProduct | matched | The bottom-left toast `Added · House pizza · $18.00` / `Scanner ready for the next code` with `Undo` (live: `posRemoveLine`). |
| POSConnection | **partial** | Connected/offline card with `Try again`. `WAITING TO SYNC` replays queued `cash_collect` rows through `posOutboxApply`. CollectSheet is not the enqueue writer on this pass. |

## Not wired (every one is a disabled control with a one-sentence reason in en, es and fr)

Favorites chip · location chip menu · Options / notes / Served by /
Line discount on a line · price change · Language and offers on a new
customer · Manual discount / Comp · `Report as` on a custom amount · Name a
held sale · Hold it again · Bank transfer · Two methods · Take partial cash ·
Open drawer (device) · drawer/responsible choice at opening · Receipts
method filter · Issues and its filters · Scan narrowing · Devices: reconnect
reader, test print, open drawer. Decisions D-POS-15 to D-POS-31 in
`docs/plans/program/pos/decisions.md`.

## Package 1 wiring (2026-09-11, wire-pos-money)

Frames owed (rows marked "frame owed"): the machine crashed mid-capture and the coordinator's load rule forbade a dev server afterwards; those verdicts rest on the code, the unit lanes and the flows already driven live before the crash (the counter's custom amount, approval, tip, booking link, payment link and lock; the display's tip; B03). They are owed a fresh `live.png` on the next run.

Engine package 1 (`docs/plans/program/engine/pos-money.md`) turned these
controls on, screens only, over its actions: custom amount + manager
approval (`admin/pos/actions.ts`), lock / switch operator, link a booking,
tip, payment link, cash movements (`lib/server-actions/pos-engine.ts`,
never re-exported through `actions.ts`). Every refusal a person meets is a
`dashboard.pos.engine.refusal.*` sentence (en / es / fr; `not_allowed` and
`no_customer` added). New on the counter beyond the boards above: the
basket's `Tip` row and sheet (`posSetTip`, `TipSheet.live.png`), the collect
screen's `Payment link` tab (`createPaymentLink`, `POSCollect-link-tab.live.png`,
`POSCollect-link-sent.live.png`), the cashier chip's `Switch operator`
(frame owed), the movement dialog (frame owed); the People PIN block and
the Settings limit are `PeopleRegisterPin.live.png` and
`SettingsCustomAmountLimit.live.png`. The register PIN is set on People › Access
(`admin/people/PersonRegisterPin.tsx`) and the custom-amount limit under
Settings › Roles & limits (`components/admin/settings/custom-amount-limit.tsx`),
D-POS-87. Decisions D-POS-82 to D-POS-90.

`POSCollectAnotherWay` (M26) stays not wired: no RPC records an authorised
alternate collection (D-POS-85).

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
