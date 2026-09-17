# fidelity-polish7: the second pass on the Door and Events

**Group.** The till's Door mode (POSGateReady, POSGateAdmitted,
POSGateAlready, POSGateForged, G08_GateManualAdmit, POSBoxOffice,
E01_ChooseEvent, E02_TicketsQty, E04_Attendees, E06_Issued,
E09_TicketLookup, E10_Transfer, E15_Delivery), the guest's ticket page
(E08_CustomerTicket at 390) and the workspace's Events destination
(W16_EventsList, EventDetail, W17_EventVenueSeating, W18_EventDaySettings,
CreateEvent). Each folder holds `board.png` (the board rendered at its
viewport, 1194x834 for the till, 390x844 for the ticket page, 1440x900 for
the workspace, copied from `fidelity-door/`) and `after.png` (this branch on
a local `next dev` at port 3180, proxied as the registered host
`qa-journeys.local` on 3181 against the isolated database `qa-journeys`,
signed in as the fixture owner through `/api/dev/signin`, the dev-only
identity banner hidden). The first pass's `<Board>.live.png` in
`fidelity-door/` is the "before". `POSGateForged/board.png` is the
`POSGateWrong` board: the same red hero, the fixture has no ticket for
another night of the same event.

**Branch.** `work/fid-polish7` off `origin/main` (`a55a6e58e`). Production
was never read or written; `npm run db:push` was never run. The isolated
database took the writes the frames needed, each through the screens or the
wiring specs' own seeders, and each undone after the frames: one night on
the fixture event QA Night (`seedEventNight` from `e2e/cases/_wire-seed.ts`,
given the event's `offering_id` the way the fixture's own nights carry it,
because the seeder leaves it null and the box office refuses a night without
one), three cash sales at the box office (four tickets for `Tomás Navarro`,
`fid-door-tomas@impronta.test`, $0.00 each: the fixture's General admission
tier is free), three admits at the gate (two scans, one by hand). Cleanup:
the admissions, allocations, lines, transactions and orders of that address,
then the night's pools and session.

## Method

Board and live at the same viewport, element by element, the differences
listed before anything changed (grid, spacing, type, colour, borders, copy,
states, the verdict cards), then fixed in the screen's components with the
wiring untouched, then measured back. The kit rules polish3 to polish6
landed are applied: 1.2 line-height, the board's block pill for a list cell,
the kit's chevron over a native select, day-first dates, 26px page titles,
24px KPI figures, 16px row menus. The Events group draws its kit pieces from
`events/events-ui.tsx` beside `catalog-ui` rather than inside it: the
Catalog's own second pass (polish5, open) lands the same pieces there, and
two open branches editing one file is a merge conflict for nothing.

## What changed, shared

| # | Before | After |
|---|---|---|
| 1 | Dates read `Fri, Sep 11` (en-US) on every door screen and in the Events list, chips and tab titles. | Day-first as the boards print it: `Fri 11 Sep`, `Wed 16 Sep 22:00` (`venueClock`, `whenLabel`); en-GB would say `Sept`, so the parts are reassembled, not the locale swapped. es/fr unchanged. |
| 2 | A ticket's tier printed the engine's whole line label (`QA Night ticket · General admission`, or `Door night X · Door night X · Entry`) in the basket, the attendee rows, the issued cards, the lookup rows, G08's Right row. | `tierWord`: the leading segments that are (or begin with) the event's or the night's name are dropped; `General admission #1`, `Right · General admission`, `2 general admission · order #6608`. |
| 3 | `1 tickets`, `1 nights`, `Continue · 1 tickets`. | One sentence per count (`byCount`): `1 ticket`, `1 night`, `Continue · 1 ticket`, in en/es/fr. |
| 4 | The hero's glyph was a typed `✓` / `✕` / `!` at 72px; the Recent card's too; the notes carried a ring. | The board's stroked check, cross and triangle (lucide), the note's triangle, the change sheet's check. |
| 5 | The scan field under the hero was 48px with the shell's 2px focus outline (a dark double ring on every frame), placeholder `Or type the code from the ticket`. | 44px, hairline, brand border on focus, no outline; the placeholder is the field's label, `Scan or type a ticket code` (which is also what WIRE-3.9 types into; the old placeholder never matched it). |
| 6 | The verdict named nobody after a scan (`In. Welcome.`). | `Tomás Navarro · General admission · In. Welcome.`: the row the code names, read off the token's payload for the screen only (`admissionIdOfCode`), from the list the door already holds. The engine still decides; a code naming no row on the list prints no name. |
| 7 | The header over the box office stayed `Box office · <event>` on E04 and E06. | E04 reads `Who is coming · 2 tickets · Wed 16 Sep`; E06 reads `Paid · 2 tickets issued · Tomás Navarro · $0.00 · cash · 19:47` (`BoxStage`, told by the box office as it moves; forgotten on every rail change). |

## Per board

| Board | What changed | Still differs |
|---|---|---|
| POSGateReady | The scan field (#5); the hero's glyph ring; the header's `Wed 16 Sep · doors 22:00 · CST`. | The board has no field at all; a wedge scanner needs a focused input, so one stays, quieter. The rail carries a sixth row, Messages (shell group). `· CST` where the board says `· Main entrance` (rule 5: the clock's owner is named). |
| POSGateAdmitted | The check is the board's stroke (#4); the sentence names the holder and the tier (#6); `Redeem meal` stays disabled with its sentence (D-POS-54). | `1 of 4 in his group · 1 meal included` needs a party and a benefit the ticket does not carry. |
| POSGateAlready | The cross is the board's stroke; the same hero geometry. | `Let in anyway · manager` disabled (no override, D-POS-54); the sentence is the engine's count (`1 of 1 came in on this ticket earlier`), the board's `scanned at 19:31 at this entrance` needs a scan log. |
| POSGateForged | The red hero for a code that does not check out. | Shot against the `POSGateWrong` board: no ticket for another night exists on the fixture event; `wrongNightDated` renders the same hero with `This ticket is for {date}` (unchanged). |
| G08_GateManualAdmit | The lookup column's order line in the singular; the triangle on the note; `Right · General admission` (#2); the footer note at 13px on 220px so a long name wraps to three lines, not seven. `after-lookup.png` is the column before the tap, `after-admitted.png` the hero the tap produced. | Reason and Authorized by drawn disabled with their sentences (no column); the board's `Valid · not scanned` is `Valid` (the row's state word); each ticket row keeps its own Admit (the board taps the row). |
| POSBoxOffice | The two chips carry the board's glyphs (ticket, drawer); the Recent card's glyphs are strokes (#4); the basket line prints the tier (#2); `Continue · 1 ticket` (#3). | The fixture's night has two tiers (the board six); `Back` stays on the chip strip (the board has none; the header's cashier menu is the other way back). `Fees · Included` and the hold sentence under Continue are the live's (seats are held at cash time, D-POS-55). |
| E01_ChooseEvent | Subtitle `Pick the event and the date`; `1 night · Wed 16 Sep`; day-first dates on both columns and the Continue button. | Every event reads `On sale` (Presale / RSVP need columns the row lacks); the fixture lists its 48-case events. |
| E02_TicketsQty | The tier's word on the basket line (#2); the singular (#3). | Quantities stay the basket's steppers (G06's layout) rather than on the tier rows; no price phases (D-POS-56). |
| E04_Attendees | The header (#7); `General admission #1` / `#2` (#2); the basket card's line (#2). `after-collect.png` is the counter's collect surface inside the door. | The buyer card keeps its three inputs (wired) where the board shows a card with Change; no `Held · 9:41 left` chip (seats are held at cash time); the 18+ confirmation has no column. |
| E06_Issued | The header (#7); the hero is the board's `2 tickets issued` at 30px with `Wed 16 Sep · 2 general admission · order #6608` under it; `Sent by email` is green when the sale had an address (the mint sends the ticket mail, #2002), grey with its sentence when it had none; **`Resend email` is wired** (`admissionDeliver`, once per ticket, to the buyer's address) with its answer under the row; Print and Text keep their glyphs and their sentences; the issued cards print the tier (#2). | The signed code stays on each card (the board shows only the reference): at a till with no printer the code IS the ticket. The receipt link stays. |
| E09_TicketLookup | The search field loses the browser's search chrome and the shell outline; `1 ticket` (#3); the right column's ticket card is the board's two lines (name and pill, then reference · tier and Change · Delivery); **`Resend all tickets` is wired**: the ticket mail again for every valid ticket on the order, to the holder's address or the order's contact (the engine picks, as the sale did), answered in words. | `Change · Delivery` on each card (the board opens E10 from the row); the board's `not tonight` group needs an order on another night. |
| E10_Transfer | The board's four cards: a 44px glyph tile (arrow, calendar, cross, person) beside the title; the exchange night under the kit's chevron; the footnote carries the board's check. | The transfer and exchange forms stay open inside their cards (WIRE-3.x drive them on open); the sheet is the 600px sheet over the lookup, not the board's full-width four-up. |
| E15_Delivery | `1 ticket` (#3); the e-mail row says `the order's contact` when no ticket carries an address and its Resend is enabled (the engine falls back to the order's contact, as the sale's own mail did); every row answers in words (`Sent again.` / `Not sent: no address…`). | SMS and wallet stay `Not available`. |
| E08_CustomerTicket (390) | Rebuilt as the board: a white header with the back chevron to the event, `Your ticket` and the event; the QR in a bordered 190px box with `Show this at the door · brightness up` and the `Valid` + tier pills; the facts card (Name · When `Wed 16 Sep · doors 22:00` · Where · Order `#D144 · 1 ticket`) read on the venue's clock (the venue's zone, else the workspace's; the platform's fallback prints no date); `Add to Wallet` disabled with its sentence, `Transfer` scrolls to the transfer card; the transfer note. The admin palette and font bind on the page (the storefront's serif h1 no longer inflates the title). `after-transfer.png` is the fold below. | The transfer, resend and lookup forms stay rendered under the fold (WIRE-3.9 drives them by their labels and test ids); the code is behind a `Ticket code` disclosure rather than gone; the board's `Also · Sushi workshop` needs a linked add-on. |
| W16_EventsList | 26px title; segments at the board's height; the table on the board's columns with a 33px head and 40px rows (`DenseHead` / `DenseRow`, the row menu 16px); one line per row (`QA Night · Wed 16 Sep`; the night count is the row's title); State as the block pill; day-first dates. | Venue, Sold, Left and Door alloc. print a dash with the reason (per night, D-POS-56); Templates, Import, Calendar and the filters disabled with their sentences; the fixture's 35 upcoming rows are its 48-case events. |
| EventDetail | 24px title; KPI figures 24px (`Stat`); the tickets table on the dense kit with the phase as words (`On sale`, the board's `Standard (Early bird ended)`) and Channel as the block pill; the row menu 16px; the pool note carries the triangle; the sub-nav at 190px with 8px rows. Sold and Remaining now read from the night's pools (#2002). | Price phases / Packages / Allocations sub-tabs have no column (their sentence stays under the strip); Holds active a dash; the board's two-line ticket names come from its narrow columns. |
| W17_EventVenueSeating | 26px title; Space, Layout and Dining under the kit's chevron; the table on the dense kit; the note is the board's indigo with the triangle (it was coral). | Space, Blocked interval and Dining disabled with their sentences (no writer); Save disabled until a layout is picked; the fixture has no layout, so the seat chips are empty. |
| W18_EventDaySettings | 26px title; every rule's select under the kit's chevron; `Open POS · Tickets` in the board's slate with the scan glyph; the readiness strip sits under the two rule cards (the comp card, #2002, moved below it). | Every rule is disabled with the engine's fixed answer (D-POS-57); Save disabled; the board's `Drawer 2 float · Not opened` tile needs a drawer reader. The tab sits inside the event's own header (the board is a page with a breadcrumb). |
| CreateEvent | 26px title; the stepper's discs (done: soft check; active: dark; the rest bare numbers); Sales model, Format and Visibility under the kit's chevron; the venue card at 68px; the form on a 14px rhythm. | Every field without a column stays disabled with its sentence (D-POS-56), which makes the hints two lines where the board's are one and pushes `Continue to dates` below the fold at 900; Pass series is a row the board lacks (wired, kept). |

## Copy (en, es, fr)

Changed: `dashboard.pos.door.gate.scanPlaceholder`,
`dashboard.pos.door.lookup.resendAllReason`,
`dashboard.pos.door.issued.resendReason`,
`dashboard.pos.door.delivery.emailNone`. Added: `header.boxPickSubtitle`,
`header.leftTonightOne`, `lookup.orderLineOne`, `lookup.ticketsOfOne`,
`lookup.resendAllNone`, `lookup.resendAllDone`, `box.continueTicketOne`,
`box.eventNightOne`, `attendees.subtitleOne`, `issued.hero`,
`issued.heroOne`, `issued.heroDetail`, `issued.resendDone`,
`issued.resendFailed`, `issued.sentByEmailNone`, `delivery.subtitleOne`,
`delivery.sent`, `delivery.notSent` (all under `dashboard.pos.door`), and
`dashboard.visit.ticket.{showDoor, valid, used, notValid, name, when, where,
order, orderTickets, orderTicketOne, wallet, walletReason, transferNote,
unnamed, doors, code, resendDone}`. `npm run verify:ui-messages` exit 0.

## One engine rule touched

`admissionDeliver` (`lib/venues/event-holds.ts`) refused an e-mail resend
when the ADMISSION carried no `holder_email`, while the sale's own ticket
mail (`deliverTicketForAdmission`) falls back to the order's contact: a
box-office sale names the buyer on the order, not on each ticket, so every
resend from the door refused on exactly the tickets the till sells. The
pre-check is gone; the delivery path picks the address the way it always
did, and answers `channel_unavailable` only when nobody has one. The
`ticket-delivery-hooks` static pin (the forced call shape) is unchanged.

## Gates (real exit codes)

See the PR description for the run this branch was gated on.

No selector the Playwright cases use was renamed (`#door-scan`,
`data-door-*`, `[data-door-verdict]`, `door-transfer-*`, `door-exchange-*`,
`door-deliver-*`, `ticket-transfer`, `ticket-resend`, `ticket-lookup`, the
`New holder name` / `New holder email` / `Last four of the receipt` labels,
`events-*`). `[data-door-change]` and its `Delivery` sibling keep their
order. New: `[data-door-resend]`, `[data-door-resend-all]`,
`[data-ticket-page]`, `[data-ticket-state]`.
