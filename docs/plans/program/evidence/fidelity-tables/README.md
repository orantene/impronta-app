# fidelity-tables: Tables, Reservations and Kitchen, against the boards

Group: TABLES, RESERVATIONS and KITCHEN. POS boards at 1194x834 (T01 to T08,
T12 to T17, T21 to T24, T26, K09, R01 to R06), workspace boards at 1440x900
(LiveFloor, W12, W13, W14, W15, W23, W24), guest boards at 390x844 (Q01 to
Q07). Every `*.board.png` is the board's HTML rendered at that viewport;
every `*.live.png` is this branch's local PRODUCTION build (`next build` +
`next start` on port 3200, behind
the repo's own `scripts/local-host-proxy.mjs` on 3201 presenting the
registered host `qa-journeys.local`, the browser resolving that host to the
proxy; isolated database `qa-journeys`), signed in through `/api/dev/signin`
as the fixture owner, at the same viewport, with the dev-only identity banner
hidden. The rail, top bar and POS frame are the shell group's and the counter
group's (`PosFrame`, `PosHeader`, `PosSheet`, `PosDialog`); this group skins
what sits inside them.

Where the board's sample data says Casa Nube, Pérez · 3 or $640, the live
frame says what the fixture workspace holds on 2026-09-11: six tables
(T1 to T5, B1) with no rooms over them, one dinner window 12:00 to 22:00,
three C06 bookings for tonight, the visit another proof left open on T1, and
the pickup tickets other journeys left on the kitchen board. Nothing was
written to production; the e2e journeys write to the isolated fixture tenant
and release what they seat.

## One board, two doors

The till's Tables mode (`admin/pos?mode=floor`) and the workspace's
Reservations destination (`admin/reservations`) draw ONE component,
`web/src/components/admin/floor/FloorBoard.tsx`, over the same readers
(`listFloor`, `loadHostStand`, `listBoard`) and the same writers (the Spaces
page's `tablesSeatParty` / `tablesMoveVisit` / `tablesCloseVisit` /
`tablesResetTable`, the host stand's `reservationsTakeWalkIn`, the counter's
`posSubmitPrep`, and the website booking block's own availability reader and
`createReservation` behind a staff guard, `floorLoadReserveTimes` /
`floorCreateReservation`). No second engine, no second list of tables. The
old `HostStandBoard` (a table of rows) is deleted; the old floor sheet inside
`floor-client.tsx` is replaced by the board's card, sheets and dialogs.

## Boards

| Board | Verdict | Live frame | What differs, and why |
|---|---|---|---|
| POSLiveFloor (T01, the Floor view) | **matched** (partial on geometry) | `POSLiveFloor.live.png` | Header `Floor` + `Dinner 12:00–22:00 · 1 of 6 tables seated · 0 arriving · 0 waiting`, the Live dot, location and cashier chips; rail Floor · Orders · Prep · Receipts · Issues with the open-check count; left column Arriving N / Waiting N / Seated N from tonight's book (`loadHostStand`) and the occupied tables; legend Free / Arriving / Held-late / Seated / Needs reset / Blocked; Floor · Timeline · List switch; tiles named by code with the board's one line (`Free · 4`, `Pérez 3 · 18 min`, `Walk-in hold · 4`, `Needs reset`, `Blocked`), the joined pair as one tile `T2+T3`; the overrun note (`T1 1557 min over · Suggest a free table after reset`) when a party is past its turn; Walk-in · New reservation · Pause online bookings under the map. Differs: the floor plan has no coordinates (W13 is not built), so tiles are grouped by room (`spaces.parent_id`), else by kind (Tables, Booths, Cabanas), in a flowing grid rather than at drawn positions; no walls, bar, entrance or restrooms; no event holds (Rooftop T1); no per-table server. |
| POSFloorTimeline (T02) | **matched** | `POSFloorTimeline.live.png` | Header `Floor · timeline` + `Dinner 12:00–22:00 · now 04:30`; the full-width grid with ticks across tonight's service (hourly over five hours, half-hourly under), one row per primary table, blocks for a seated visit (`n · booked to HH:MM`), its overrun (`over`), a held or booked party (`name · n · HH:MM`), a vacated table (`reset`); the now line; the board's footer sentence. Differs: a visit opened before the window starts is clipped to the window's edge (the fixture's T1 visit is a day old). |
| POSFloorList (T03) | **matched** | `POSFloorList.live.png` | Header `Floor · list`; the full-width table TABLE · STATE · PARTY · SEATED · SERVER · UNPAID · NEXT · › with the board's pills (Seated, Over by N, Arriving, Held, Needs reset, Blocked, Free), the check's total in its own currency, the next booking on that table from the book, the chevron opens the card. SERVER is always `—` (a visit records no server). |
| POSTableActions (T04) | **matched** | `POSTableActions.live.png` | The 320px card beside the tapped tile: code + state pill (`Seated · 18 min`, `Free · seats 2–4`, `Held`, `Needs reset`, `Blocked`), the who line (name · guests · server · `$x unpaid`), chips for the kitchen's step, a joined pair, a bar tab, the party; `Open order` (the counter's basket on this check), `Add items`, `Collect $x`; rows Send to kitchen, Move or join tables, Change server (disabled: a visit records no server), Extend time (disabled: the turn comes from the rules), Party left, Split the check (disabled). A free or held table gets `Seat party` and, when vacated, `Mark ready`; `Block table` is disabled (Spaces). |
| POSSeatParty (T05) | **matched** | `POSSeatParty.live.png` | `Seat {name} · {n}` / `Seat a party at T4`; ASSIGNED (the tapped or held table, fit or not, marked when it does not fit so the engine answers) and ALSO FITS (every other free table and every free pair the combination rules allow); Guests here now with `of N`; Server (disabled: not recorded); the note; Not here yet · No-show (disabled: the grace sweep stamps it) · `Seat N guests at X`. |
| POSAfterSeat (T06) · POSAfterMove (T14) | **matched** | `POSAfterSeat.live.png`, `POSAfterMove.live.png` | The map after the write, re-read from the rows: T4 seated (`2 · 0 min`), then the party moved to T1 with T4 reading `Needs reset` and T1's card open. |
| POSWalkIn (T07) | **matched** | `POSWalkIn.live.png` | Party size with Common 2 · 4 · 6, Name, Mobile (disabled: no text is sent), needs (disabled: not stored), RIGHT NOW with every free table that fits and `Seat now`, the waiting list with parties ahead and `Add to waiting list` (`reservationsTakeWalkIn`). |
| POSWaitlistOffer (T08) | **partial** | `POSWaitlistOffer.live.png` | `Waiting · 1`, each party with its time and minutes waited (a walk-in with no name is on the list as `Walk-in · 2`: the host stand's writer no longer refuses an empty name, as the board's `Optional` says), `Seat now` (opens T05 for that party), `Add party`. Not wired: `Offer table` by text and `Remove` (no writer; said on the card), the 10-minute hold and the `Text sent` pill (no offers are modelled). |
| POSTableOrder (T09) | **not wired** | (the counter) | The check IS the counter's basket (`Open order`); seats, courses and firing are not modelled. |
| POSSplitCheck (T18) | **wired, frame owed** (2026-09-11, wire-pos-money) | (none yet; `POSSplitCheck.board.png` added) | `Checks · T4 · Walk-in` / `$24.50 in items · tick items, then move them`; the table's checks side by side (`Check A · Unpaid`, its lines with a checkbox each, Items · Remaining), `N items selected · $x`, `Move selected to a new check` (`visitSplitCheck`: a new draft on the same visit, D-POS-77), `Collect check A · $x` (the counter). The card then reads `2 checks · $24.50` with a door per check (`POSTableActions-two-checks.live.png`). Not built: `By seat`, `Evenly`, `Amounts` (not modelled, said on the sheet); a check with a payment refuses (`lines_paid`). |
| POSTableChange (T12) | **wired, frame owed** (2026-09-11, wire-pos-money) | `POSTableChange.live.png` | The three cards: Move (the engine's `visit_transfer`, D-POS-69), Join (disabled: a join is decided at seating, the transfer cannot add a second table), Merge (opens T16, `visit_merge_checks`). |
| POSMoveParty (T13) | **wired, frame owed** (2026-09-11, wire-pos-money) | `POSMoveParty.live.png` | `T4 › Move`, the grid of tables with Free / Too small / Too large / Occupied / Needs reset / Held / Blocked, `Goes with them` ($x check · n kitchen ticket), `T4 after · Needs reset`, `Why` (disabled: not stored), `Back · Move to T6`. The move is `visitTransfer` with `expectedVersion` = the version the floor read (a stale board is refused as `conflict`) and an operation key derived from visit · version · destination; the origin table's reset mark is written by the tables action wrapper. |
| POSJoinTables (T15) | **partial** (unchanged 2026-09-11) | `POSSeatParty.live.png` | A pair is offered on the seat sheet (`T2 + T3 · joined · seats 3–4`) and seats one visit across both (the proven `joinedSpaceId`); joining a second table to an already seated party stays disabled with its reason: `visit_transfer` moves a visit between spaces and cannot set `joined_space_id` (D-POS-69). |
| POSMergeChecks (T16) | **wired, frame owed** (2026-09-11, wire-pos-money) | (none yet) | `T4 › Merge` · `Merge another check into T4` / `One bill for two tables`; one radio row per other seated table with an open check (`T5 · Walk-in · 2 · $12.00`, its items move here and its own check closes), the facts card (responsible, `T4 check`, `+ T5 check`, `One check`, deposits / payments: a check with a payment is refused), `Back · Merge · one check for … · $x`. `visitMergeChecks`; refusals `lines_paid` / `conflict` / `not_open` are the engine's sentences. Differs: the board's `Same party · confirmed` line and the grey ineligible rows are not drawn (the engine decides eligibility at the write). |
| POSChangeServer (T17) | **wired, frame owed** (2026-09-11, wire-pos-money) | (none yet) | `Change server · T4` / `Walk-in · 3 · currently nobody`, one tile per person of the workspace (initials · name · `n tables` tonight · `current`), the facts card (`From now on · {name} serves T4`, tips stay on the sale, drawer unchanged), `Back · Give T4 to {name}`. `visitChangeServer` (`visits.server_user_id`); the card and list then read `Served by {name}`. The fixture has two people. |
| POSExtend (T22) | **not wired** | `POSTableActions.live.png` | Disabled row on the card with its sentence (no turn-time writer). |
| POSGuestQROrder (T21) | **not wired** | (Q01) | No guest ordering engine. |
| POSDeparted (T23) | **partial** | `POSDeparted.live.png` | `Party left T1 · bill still open` / `$x unpaid · n min`; `Free the table` is `tablesCloseVisit`, refused in words while the check is unpaid (the e2e asserts the sentence); Keep the bill open, They paid another way, Walk-out are disabled over their reasons. |
| POSTableReset (T24) | **matched** | `POSTableReset.live.png` | `T5 · needs reset` / `Party left HH:MM` (venue clock), the three checks (a reminder, not a record), the note, Not yet · `T5 is ready` (`tablesResetTable`). |
| POSKitchen (T26) | **matched** | `POSKitchen.live.png` | `Kitchen` (+ the station's name when it is not the default), `Fri 11 Sep · 04:49 · 0 preparing · 8 queued · 0 ready`, tabs Preparing · Queued · Ready as filters, Recall (disabled: handed-off tickets are not kept); cards with the coloured top edge, code (`T5`, `#D3E3`) · kind · guests, the mm:ss timer ticking from the send, `n× line` with `New` on what this revision added, the promise time, the footer pill (`Fired HH:MM`, `Preparing`, `Ready`) and ONE action (`Start`, `Mark ready`, `Confirm handoff`). Differs: no `avg 11 min`; no per-line cancel or modifiers (a snapshot line has label and units); the board sits inside the workspace shell because the destination lives there. |
| K09_KitchenAmendment | **matched** | `K09_KitchenAmendment.live.png` (the VENUE journey's own frame, 1280px wide, full page) | An amended ticket: coral edge, `Amended. Acknowledge again. Revision 2`, `New` only on the changed lines (`addedLineIds`, diffed against the previous snapshot on the server), `Acknowledge change`; the banner under the grid `T4 · ticket amended · revision 2 · acknowledge it again` with `Got it`. |
| R01_NewReservation | **matched** (partial on the form) | `R01_NewReservation.live.png` | The staff sheet on the website block's own rules: the open days, party, customer / email / phone, AVAILABILITY with the block's times for this party on this date, WHERE (said: a preference is not stored), MONEY (the deposit the rules ask, or none), `Confirm` / `Confirm · collect $x deposit` (`createReservation` with the staff member as actor). Not on the sheet, said: occasion, note, prepay a menu, duration (the rules' turn). |
| R02_Unavailable | **matched** | `R02_Unavailable.live.png` | A date the venue does not serve or a party no band fits answers with the block's own refusal and the other days stay pickable; a time refused at confirm (`time_not_offered`, `sold_out`) is a sentence in the sheet. |
| R03_Confirmed | **partial** | `R03_Confirmed.live.png` (a real booking taken on the fixture tenant for the next day, `Fidelity Tables · 2 · 12:00`) | The done state: the tick, `Reserved · 12:00 · name · n`, Confirmed and Deposit chips, `Collect $x at the counter` opening the reservation's order on the till. No SMS / confirmation-link line (the website's email path is not re-sent from the till). |
| R04_CustomerManage · R05_Amend | **not wired** | (none) | No customer manage-my-reservation page and no amend writer exist. |
| R06_LayoutsShareCapacity | **not wired** | (none) | No layouts. |
| LiveFloor (WS059, the Reservations destination) | **matched** (partial on the right panel) | `LiveFloor.live.png`, `LiveFloor-waiting.live.png` (the e2e's frame with a walk-in on the list) | `Live Floor` / `QA Floor · Dinner 12:00–22:00`, the Live dot, Walk-in · New reservation · Pause online bookings on the header row, then the same board (column, legend, map, Timeline, List). Not built: the right-hand party detail panel (reservation state, deposit, notes, guest requests, Message, Mark no-show); a party's facts are on the seat sheet it opens. |
| W12_SpacesResources | **not wired** here | `W12_SpacesResources.live.png` (the Spaces page as it is) | The Spaces page keeps its card list and its own actions (five e2e journeys drive it); the resources table with USES · BOOKABLE · STATE is not built in this pass. |
| W13_LayoutEditor | **not wired** | (none) | No layout table; the map has no coordinates. |
| W14_ServicePeriods | **not wired** here | `W14_ServicePeriods.live.png` (Settings › Reservations as it is) | The rules and windows editor exists under Settings; the board's two-column layout and the money terms table are not built in this pass. |
| W15_PrepStations | **not wired** | (none) | No stations table; every ticket is `station = kitchen`. |
| W23_LocationsZones · W24_BookingPolicies | **not wired** | (none) | No zones or per-type policy table. |
| Q01_TableQR | **matched** | `Q01_TableQR.live.png` (a party of one seated at T1 for the frame, then released) | The venue, `Table T1 · your visit`, `Welcome to table T1`, the intro, Your visit (`Started HH:MM · n guests`), Server (`Ask any member of staff`: not recorded), `Start ordering` disabled over its sentence, the identity note, the two chips. |
| Q05_PayAtTable | **partial** | `Q01_TableQR.live.png` (the bill under the welcome card) | `Your bill · Table T1 · n guests`, the lines with quantity and price, the total in the check's own currency; `Pay all · $x` and `Pay my share` disabled over one sentence. No service line (nothing computes it). |
| Q02 · Q03 · Q04 · Q06 · Q07 | **not wired** | (none) | No guest ordering or guest payment engine (D-POS-49). |

## Readers and writers behind the screens (nothing is mocked)

- `lib/visits/floor.ts::listFloor` now also returns `parentId` / `parentName`
  (the room over a table), `blocked` (`spaces.status = out_of_service`, read
  as well as active) and `openedAtIso`; `floorSummary` counts a blocked
  table out of the total.
- `lib/preparation/tickets.ts` views now carry `partySize`, `submittedAt`,
  `acknowledgedAt`, `readyAt` and `addedLineIds` (the previous revision's
  snapshot diffed, pure `addedLines`).
- `lib/visits/qr.ts::loadOpenVisitByToken` now returns the table's code, the
  visit's start and party.
- `admin/reservations/floor-book.ts::loadFloorBook`: tonight's book through
  `loadHostStand` (the host stand's own reader), the service window with its
  label, the rules' three switches.
- `admin/pos/floor-screen.tsx::loadFloorBoardData`: everything the board
  draws, read once; shared by the POS route and the Reservations page.
- `admin/pos/floor-actions.ts`: `floorLoadReserveTimes` (the booking block's
  `loadReserveAvailability` + the rules' deposit) and `floorCreateReservation`
  (`findOfferedTime` + `createReservation`, staff as actor, upsize allowed
  for staff).
- `PosHeader` gained the optional `live` dot; `POS_MODE_META.floor.destinations`
  is the board's rail.

## Not wired (each drawn disabled with a one-sentence reason in en/es/fr)

Card: Extend time, Block table. Chooser: Join tables (for a seated party,
D-POS-69). Seat sheet: Server, No-show.
Walk-in: mobile, the three needs. Waiting list: Offer table, Remove. Move:
Why. Party left: Keep the bill open, They paid another way, Walk-out.
Floor: Pause online bookings. Reservation: table preference, note, occasion.
Kitchen: Recall. Guest page: Start ordering, Pay all, Pay my share. Tables
mode rail: Receipts (one sentence), Issues (the counter's sentence, D-POS-28).
Recorded as D-POS-47, D-POS-48, D-POS-49 and D-POS-50 in
`docs/plans/program/pos/decisions.md`.

## Package 1 wiring (2026-09-11, wire-pos-money)

Frames owed (rows marked "frame owed"): the machine crashed mid-capture and the coordinator's load rule forbade a dev server afterwards; those verdicts rest on the code, the unit lanes and the flows already driven live before the crash (the counter's custom amount, approval, tip, booking link, payment link and lock; the display's tip; B03). They are owed a fresh `live.png` on the next run.

The floor read (`lib/visits/floor.ts`) no longer assumes one order per visit:
it keeps every open check (`orderIds`, `checks` with their totals, summed
`orderTotalCents`), drops cancelled orders (a merge leaves one on the source
visit), and carries `visits.server_user_id`. `FloorBoardData` gains
`servers` (the workspace's people, `listPosStaff`) and `FloorActions` gains
`mergeChecks`, `changeServer`, `splitCheck`, `loadCheckLines`; `moveVisit`
now requires `expectedVersion` and an operation key. Both surfaces (the
Tables mode and the workspace's Live Floor) call the engine's four RPCs
through `admin/tables/actions.ts`. New copy under
`dashboard.pos.floor.board.{merge,server,split,popover}` in three languages
(`components/admin/floor/floor-copy-engine.ts`); engine refusals
`space_occupied`, `lines_paid`, `conflict` join the board's refusal table.
T08 (a restaurant party waitlist with a table hold) is unchanged: the
engine's `waitlist_offers` is the session hold (D-POS-68, D-POS-76), wired on
the Front desk (see `fidelity-appts`). Decisions D-POS-69, D-POS-77.

## Copy

Every new sentence is in `web/messages/{en,es,fr}.json` under
`dashboard.pos.floor.board.*` (through `components/admin/floor/floor-copy.ts`,
whose render test walks the refusals and every disabled control's reason in
the three languages), `dashboard.preparation.*` (the station's words) and
`dashboard.visit.*` (the guest page; French gained the rows it never had).
Dead rows the old floor sheet and the old host stand read were deleted
(`dashboard.pos.floor.{title,summary,emptySeated,tapHint,sheetHeading,guests,
seatHere,seatAcross,joinOffer,noJoinOptions,openCheck,movePartyHeading,
endVisit,rail.seating}`, `dashboard.reservationsDesk.*` except the page's
three cards and the refusals).

## Playwright

- `e2e/cases/POS-floor-mode.spec.ts`: the same journey (seat, refused
  kitchen send, counter, send, move, refused end, collect, end, reset, the
  join a refusal offers) through the board's doors: the tile opens the card
  (`[data-floor-sheet]`), the card's `Seat party` opens the seat sheet
  (`Seat 2 guests at T4`), `Send to kitchen` and `Move or join tables` are
  the card's rows, the move goes through the chooser and the move sheet
  (`Move to T5`), `Party left` opens the dialog whose `Free the table` the
  engine refuses in the asserted sentence, `Mark ready` opens the reset
  dialog (`Party left HH:MM` in the venue's hour, `T5 is ready`); the joined
  pair is asserted as one tile `T2+T3` and the joined half's reset from the
  row. Every fact asserted before (rows read back after every write, the
  refusal sentences, the venue's hour) is still asserted; the one dropped
  line is the zone note sentence, which the boards do not carry (the venue's
  hour is asserted on the vacated time instead). New: the rail's five rows,
  the panel's tabs, the disabled join / merge / departed options.
- `e2e/cases/VENUE-table-service.spec.ts`: the desk is the Live Floor: the
  walk-in goes through T07 (`[data-floor-walk-in]`, the party stepper, RIGHT
  NOW never offers a two-top to three, `Add to waiting list`), lands on the
  Waiting tab, is seated through T08 → T05 (`Seat 3 guests at T4`), and the
  Seated tab shows the party at T4; the kitchen is T26 (`Kitchen`, the
  Queued / Preparing tabs, `Start`, `New` on the added line, `Acknowledge
  change`, the K09 banner).
- `e2e/cases/VENUE-refusals-in-words.spec.ts`: the station's words come from
  the catalogue as before (`acknowledge` = Start, `statusAcknowledged` =
  Preparing, the tabs); the refusal banner is `p[role="alert"]`.
- `e2e/cases/C26-jesus-frozen-pizza-from-home.spec.ts`: Start → Mark ready →
  Confirm handoff across the three tabs, on the NEWEST pickup card (other
  journeys leave older ones; the sibling spec already reads `.last()` for the
  same reason).
- `e2e/cases/C07-bar.spec.ts`: the guest page's heading is `Welcome to table
  T1`; `This visit has ended` is unchanged.
- Runs against this branch's local production build: see `runs.md` beside
  this file for each spec's real exit code and the log path. `C07-bar`'s two
  tab tests fail on the untouched Spaces page's card (a pre-existing drift
  since `675d575f1`), before they reach the guest page this group changed.
