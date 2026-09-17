# fidelity-polish6: the second pass on Tables, Reservations and Kitchen

**Group.** The till's Tables mode (POSLiveFloor, POSFloorTimeline,
POSFloorList, POSTableActions, POSTableChange, POSMoveParty, POSMergeChecks,
POSChangeServer, POSDeparted, POSSeatParty, POSWalkIn, R01_NewReservation),
the kitchen station (POSKitchen) and the workspace's Live Floor (LiveFloor).
Each folder holds `board.png` (the board rendered at its viewport, 1194x834
for the till and the station, 1440x900 for the workspace, copied from
`fidelity-tables/`) and `after.png` (this branch on a local `next dev` at
port 3178, proxied as the registered host `qa-journeys.local` on 3179
against the isolated database `qa-journeys`, signed in as the fixture owner
through `/api/dev/signin`, the dev-only identity banner hidden). The first
pass's `<Board>.live.png` in `fidelity-tables/` is the "before".

**Branch.** `work/fid-polish6` off `origin/main` (`314e6d8be`). Production
was never read or written; `npm run db:push` was never run; nothing was
written to the isolated database either (every frame is a read: the sheets
were opened and closed, no Seat / Move / Confirm was pressed).

## Method

Board and live at the same viewport, element by element, the differences
listed before anything changed (grid, spacing, type, colour, borders,
copy, states, the open sheets), then fixed in the screen's components with
the wiring untouched, then measured back. The kit rules polish3 to polish5
landed are applied: 1.2 line-height, the board's block pill for a list
cell, the kit's chevron over a native select, day-first dates, sheets on
the 600px frame under the 64px header.

## What changed, shared

| # | Before | After |
|---|---|---|
| 1 | The Floor · Timeline · List switch sat in a row over the timeline and the list, 60px under the header, with the map's Live dot and the Walk-in bar beneath both. | On the timeline and the list the switch is in the till's header (`PosHeader`'s `meta` slot, `FloorViewSwitch`) and the Live dot and the action bar belong to the map alone, as the three boards draw it. |
| 2 | A seated duration was raw minutes everywhere (`7361 min · late`). | `floorDuration`: `18 min` under an hour, `2h 10 min` past it (`POSDeparted`: "2h 10 min"), on the tile, the card's pill, the list, the Seated tab, the departed dialog, the overrun note and the `Over by` pill. |
| 3 | Option cards carried a check glyph in a ring. | The board's radio (`RadioDot`: 20px ring, filled forest with a white dot); the reset checklist keeps a square `CheckMark`. |
| 4 | Card menu rows ended in an arrow; no rule between the actions and the menu. | The board's chevron; a hairline over the menu. |
| 5 | The overrun note was gated to `xl:` (1280px) and never showed at the till's 1194. | Drawn from 1100px: the clock glyph, a 1px coral border, radius 8, at the foot of the side column (`POSLiveFloor`); on the workspace, one full-width coral line under the groups (`LiveFloor`). |
| 6 | `floor-copy.ts` crossed the 800-line cap with the new sentences. | The reservation sentences moved to `floor-copy-reservation.ts` (as the engine's did), byte-equal keys. |

## Per board

| Board | What changed | Still differs |
|---|---|---|
| POSLiveFloor | The overrun note (#5); durations (#2); the Walk-in bar stays under the map. | The floor plan is the fixture's (no active layout: tiles grouped by kind, no walls, bar, entrance, restrooms, terrace column, event holds); the rail carries a sixth row, Messages, since the Messages inbox joined the till (shell group); the location chip has no chevron (`PosHeader`, counter group); `Pause online bookings` is disabled (no writer, D-POS). |
| POSFloorTimeline | The switch in the header, no Live dot, no action bar (#1); the last tick label (`22:00`) sits inside the card instead of cut at its edge (the track ends 36px short); card radius 10. | The fixture's one visit is five days old, so its seated block is clipped to the window's start and its `over` block starts there; the board's held / reset / event rows need parties the fixture does not have tonight. |
| POSFloorList | The switch in the header (#1); the board's rows: 55px under a 40px head, the state a 24px block pill filling its column (label left, 11px inset), the board's column widths, the chevron 40px; a free table with nothing booked is the map's, not a row (the board lists what has something on it), and an empty list says every table is free (`list.allFree`); SERVER reads the visit's server when one is recorded; a walk-in with no name reads `Walk-in`, not blank. | `Over by 121h 32` is the fixture's stale visit; the subtitle keeps `1 of 6 tables seated` (one sentence for the three views). |
| POSTableActions | Chevrons and the hairline (#4); the who line drops the dash when no server is recorded; `1 guest` in the singular; `Split the check` on a table without a check says `No check on this table yet` instead of claiming the splitter is not built (it is, WIRE-1.9). | The card keeps its close button (the board draws none; a host on a tablet needs a way to put the card away without a keyboard); `Extend time` stays disabled with its sentence (no writer); the three `Fire …` rows are the fire-by-course engine's (WIRE-3.5), which the board does not draw; `Open order · Add items · Collect` need a check, which the fixture's T1 visit has none. |
| POSTableChange | Already the board's three cards; unchanged. | `Choose a table to join` stays disabled: a join is decided at seating (D-POS-82). |
| POSMoveParty | Opens with the first free table that fits already picked (the board's `Move to P1`); the facts card gains the board's `Next on <table>` row from the book (`Nothing until 22:00` from tonight's service, else the next party's name and time). | `Why` is a disabled field with its sentence (a reason is not recorded on a move); the board's `$640 check · 2 kitchen tickets · nut allergy note` needs a check on the visit. |
| POSMergeChecks | Unchanged (already the board's layout; the radio was already a dot). | The fixture has one open visit, so the list says no other table has a check and the confirm stays disabled. |
| POSChangeServer | Opens with a hand already picked, the first person who is not the table's current server (the board's `Give T05 to Ana`). | The fixture's two people carry the workspace's names; `0 tables` each; tips read the honest `Stay on the sale · not split by server`. |
| POSDeparted | The dialog is the board's 560px; the radio is the board's (#3); the subtitle's duration reads `123h 38 min` the board's way (#2). | The three options are disabled with their reasons because the fixture's visit has no check (the board's case is a bill still open); `Free the table` is the board's primary without the `· keep bill open` suffix for the same reason. |
| POSSeatParty | The board's radio (#3); `Seat 1 guest at T2` in the singular; the server field's sentence is the truth now that a visit records a server (`Given from the table's card once the party is seated`). | The server is not picked here (the seat writer takes none; the card's `Change server` does); `No-show` appears only for a booking; the fixture has no arriving party, so the frame is a walk-in seat. |
| POSWalkIn | RIGHT NOW offers the two tightest tables that fit, smallest first, each with its `Free now` line, so the waitlist card stays on the screen as the board draws it; the board's words `Waitlist` / `Add to waitlist`. | The mobile hint says no text is sent (no phone sender); the needs checkboxes stay disabled with their sentence (not stored); no `about 20 min` estimate (nothing computes one); `Pacing OK` has no reader. |
| R01_NewReservation | The board's one row, Date · Time · Duration · Party, with the kit's chevron over native selects for the date (day-first, `Thu 17 Sep`) and the time (`Pick a time`), the venue's turn as a read-only Duration (`1 h 30 min · party of 2`), then Customer · Occasion (not taken, said in its title); the Date select names the read while it runs instead of an empty row; the time chips under AVAILABILITY are 36px. | The sheet is a 600px sheet, not the board's full-screen two-column form; WHERE is a sentence (no table preference is stored); MONEY is one fact row (the fixture's rules ask no deposit); no `Send as a request` (no writer). |
| POSKitchen | The board's header: 68px, the flame in a coral ring, the station's name at the chrome's 19px with its moment under it, and Preparing · Queued · Ready with Recall on the same row at the right; the page binds `data-tulala-pos-chrome` so the storefront's unlayered h1 rule no longer inflates the title to 32px; a line's `New` pill sits beside its name; the Recall sentence is said once under the grid with the zone note. | The station sits inside the workspace shell (rail + top bar), so the grid is 2-up in the 900px column, not the board's 3-up; the fixture's tickets are days old (`9698:43`) and all queued, so every top bar is coral and no `Ready` / `Cancelled` line is in the frame; `Kitchen` alone (the tickets name no other station). |
| LiveFloor | The workspace's denser room: 84x56 tiles with a 14px code, a 12px legend, the groups on the surface with no frame, the overrun as one coral line under them (`compact`); the title at the kit's 26px over a 13px line, the header row on a hairline, the actions at 36px; the column 300px. | The board's right column (the tapped table as a panel) stays the till's popover; the page sits in the shell's 1200px column, not edge to edge; the board's `Arrivals / Waitlist` tab words stay `Arriving / Waiting` (the Playwright cases read them). |

Not re-read on this pass: the Q0x guest pages (390x844), the R02/R03
states, K09 (the fixture has no amendment tonight; the banner's code is
unchanged), POSTableReset, POSSplitCheck, POSJoinTables, POSExtend and the
W1x workspace boards.

## Copy (en, es, fr)

Added: `dashboard.pos.floor.board.list.allFree`, `popover.guestsOne`,
`popover.splitNoCheck`, `seat.confirmOne`, `move.{nextOn,nextNothingUntil,
nextNothing}`, `reservation.{duration,durationValue,durationReason,
occasion,occasionReason}`. Changed: `walkIn.waitlist` (`Waitlist`),
`walkIn.addToWaitlist` (`Add to waitlist`), `seat.serverReason` (the truth
since WIRE-1.8). `npm run verify:ui-messages` exit 0.

## Gates (real exit codes)

| Gate | Exit |
|---|---|
| `npm run typecheck` (the machine-wide tsc queue; dev server stopped) | 0 |
| `npm run lint` | 0 (after the `floor-copy.ts` split: `max-lines` 800) |
| `npm run verify:ui-messages` | 0 |
| `tsx --test floor-client.render.test.tsx restaurant-screens.render.test.ts visits/floor.test.ts visits/page-wire.static.test.ts venues/guest-pages-wire.static.test.ts venues/engine-refusals.static.test.ts preparation/tickets.test.ts i18n/message-key-usage.static.test.ts i18n/message-catalog-duplicate-keys.static.test.ts quality/file-size-ratchet.static.test.ts` | 0 (120 pass) |

No selector the Playwright cases read was renamed (`data-floor-*`,
`data-pos-sheet`, `data-pos-dialog`, `data-prep-*`, the tab names, the
`Seat N guests at X` label for N ≥ 2). One new attribute:
`data-floor-reserve-date` / `data-floor-reserve-time` on the reservation
selects (the chip's `data-floor-reserve-slot` moved onto the `<option>`).
