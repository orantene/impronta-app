# fidelity-polish9: the second pass on the Calendar and the mobile workspace

**Group.** The Calendar page (WS006, the Resources view, at 1440x900) and
the workspace on a phone (the MW boards, 390x844, plus the till at 390 as
`POSHandheld`). Each folder holds `board.png` (the board rendered at its
viewport, copied from `fidelity-appts2/Calendar/` and `fidelity-mobile/`)
and `after.png` (this branch on a local `next dev` at port 3188, proxied as
the registered host `qa-journeys.local` on 3189 against the isolated
database `qa-journeys`, signed in as the fixture owner through
`/api/dev/signin`, the dev-only identity banner hidden; the phone frames
are Playwright's iPhone 14 descriptor at 390x844, device scale 2). The first
pass's frames (`fidelity-appts2/Calendar/after.png`, `fidelity-mobile/*.live.png`)
are the "before".

**Branch.** `work/fid-polish9` off `origin/main` (`80337cb15`). Production
was never read or written; `npm run db:push` was never run; nothing was
written on any tenant (every frame is a read, the sheets were opened and
never continued).

**Messages.** No MW board draws the Messages screen (MW26/MW27 only carry a
Messages tab on the professional's bar), so nothing in this group was
skipped for the Messages redesign; nothing under
`web/src/components/admin/pos/messages/**` was touched.

## Method

Board and live at the same viewport, element by element, the differences
listed before anything changed, then fixed in the screen's components with
the wiring untouched, then measured back. The kit rules polish3 to polish8
landed apply: 1.2 line-height, 22px day titles, the board's segmented
control, chips as selects, 16px gutters, sheets not modals, no horizontal
scroll, day-first dates (`formatDayFirst`, one helper for every screen that
prints a civil date) and 24h clocks.

## Calendar (WS006, 1440x900)

`Calendar/board.png` · `Calendar/after.png` (today, one session) ·
`Calendar/after.busy.png` (six days back, the fixture's appointments and
holds).

| # | Before (first pass) | After |
|---|---|---|
| 1 | A `Calendar` page title with `New booking`, a four-tile status strip (Confirmed · Submitted · In progress · Expired) and a month card whose own header carried the month, a browser-zone pill, Week · Month · Agenda · Day · Resources buttons and prev · today · next; the Resources view then drew a second day-nav row of its own. | The board's header: prev / next (34px squares), `Tue 8 Sep` at 22px over `America/Mexico_City · <workspace>` (the venue's zone, read from the appointments reader; the workspace stands for the location, D-POS-71), the views as the kit's segmented control (Day · Week · Agenda · Resources · Month; Week disabled with its sentence), `+ Add` as the primary (opens the booking drawer). One header for every view: prev/next move the day (or the month on Month), `Today` appears only when the shown day is not today. The desktop opens on Resources, as the board draws it; the phone still opens on the agenda (MW13). The status strip is drawn only under Month, whose counts it describes. |
| 2 | Filters on one row, the legend on a second. | The board's one row: the five chips left, the legend right. |
| 3 | The timeline card ended with its last row. | The card fills the viewport as the board draws it (`min-h calc(100vh - 250px)`; 650px at 900), rows and header unchanged (30px header, 54px rows, 38px blocks, 180px name column, 120px hours). |
| 4 | Footer on 13px over two lines, `Hold on Massage at 09:00`. | The board's one 12px line: `⚠ Hold expires 18:00 · <title>` when the hold carries an expiry (`talent_holds.expires_at`, now on the calendar event), `Hold on <title> at <start>` when it does not, `+N more`, then the drag sentence. |
| 5 | The `next` chevron drew as a 4px sliver (the kit button's `px-[14px]` won over `px-0` and squeezed the svg). | A dedicated 34px square nav button class. |
| 6 | The month grid's weekday header started on `Sat` for any browser west of Greenwich (a UTC midnight read in local time) while the padding cells were Sunday-first: every day sat under the wrong name. | Formatted in UTC; the header starts on `Sun`. |
| 7 | Agenda and Day rows said `11:30 AM` and `2026-09-17 · scheduled`; a session read its raw status. | `11:30` (24h on the row's zone), `Thu 17 Sep · Session`. |

Still differs: the fixture's bookings name no serving person, so every
block sits on `Nobody assigned` (the board's Ana Torres · Nail tech rows need
a served-by and a role the row does not carry); `Rooms & stations` stays
disabled with its sentence; the board's `Find a compatible station` link and
drag-to-reschedule are not built (D-POS-120); the header sits 6px higher
than the board's (the page's own top padding).

## Mobile (390x844)

| Board | What changed | Still differs |
|---|---|---|
| MW00_MobileNav | `More` on the bar is the active tab while a page that lives in the sheet is open (Projects, Orders, Catalog, Issues...), as MW09 / MW17 / MW21 draw it; it used to light only while the sheet was open. | The chips are the registry's (Messages, Preparation, Discounts, Pitches beside the board's); the Search · Notifications · Open POS row and Send feedback stay (first pass). |
| MW01_WorkspaceSwitch | Nothing; `after.png` is this branch. | One workspace, one location (D-POS-71). |
| MW02_OwnerToday | The subline reads day-first, `Thu 17 Sep · 0 arrivals today · 15 things need you` (was `Thursday, Sep 17`); the eyebrow reads the board's `NEEDS YOU` (`needsYou.titleShort`; the desktop card keeps `Needs you now`). | The greeting names the fixture (`QA`); the queue rows carry their action as a third line. |
| MW03_IssueDetail | Nothing; `after.png` is the sheet, `after.list.png` the list. | The sheet's facts are the queue's, not the board's Mercado Pago sample. |
| MW05_Search | The overlay sits under the 52px top bar (`top-[52px]` below 720px), as the board draws it; it used to cover the bar. | The results are what the reader returns for `qa`. |
| MW09_ProjectsList | The phone's chips carry no count (the title pill does) and lead with `Needs action`, the board's order; the search field stays on the desktop (global search covers projects on the phone). | The default filter is still `Active` (the route's default cannot depend on the viewport). |
| MW13_Agenda | The phone is titled by the day, `Thu 17 Sep`, over `<workspace> · N appointments · N sessions` counted on the venue clock (the desktop keeps `Appointments & Classes` and its sentence). The Calendar page's header (above) is the phone's too: the tabs take their own scrolling row, `+ Add` stays in the Create menu; the agenda rows read `12:15 · Gel manicure` / `Thu 17 Sep · Booking`. | The board's per-professional chips (Dani · Ana L. · Vale · Rooms) have no filter on the reader; the booking-hours proposals banner is live data the board does not draw. |
| MW14_Appointment | Nothing; `after.png` is the sheet. | Move it and the slot grid are D-POS-2. |
| MW17_OrdersQueue | The channel prints in words (`Counter`, `Instant book`, `Guest QR`; the same map Sales uses) on the phone rows and the desktop table; the intro sentence and the totals' scope note are desktop-only (the board's subline is the location, which this page cannot name, D-POS-71). | The chips are the engine's buckets (All · In progress · Awaiting payment · Paid), not New · Preparing · Ready · Done (no preparation state on an order, D-POS-68); the totals card stays (the board has none). |
| MW21_CatalogFind | The phone draws the board's strip: the segments alone (the Type · Location · Channel · Incomplete chips stacked under them are desktop-only), `Import` and `Create item` stay on the desktop (the note says so), and the note sits under the list as the board draws it, not above it. | No search field on this list (the board's is the global search's job on the phone); the rows' second line is the engine's `type · price · availability · channels`. |
| MW24_LayoutOnMobile | Nothing. | The Tables page keeps its cards with `Seat party · Open tab`; the board's floor map, rows and block/unblock are D-POS-3. |
| MW25_TicketsOnMobile | Nothing; `after.list.png` is the events list. | As the first pass. |
| MW35_Notification | Nothing; `after.png` is the bell's sheet. | The hub's groups, not the board's filter chips. |
| POSHandheld | Nothing; `after.png` is the counter at 390. | As the first pass. |
| MW04, MW06-MW08, MW10-MW12, MW15, MW16, MW18-MW20, MW22, MW23, MW26-MW34, MW36, MW37 | Not re-shot this pass: MW06/MW07/MW10/MW22 matched or were partial for reasons that did not move (D-POS-27, D-POS-41, the item essentials card); the rest are not wired (D-POS-68, D-POS-69, D-POS-70) or write (MW04, MW11, MW12, MW15, MW16, MW23). | As `fidelity-mobile/README.md`. |

## Copy (en, es, fr)

Added: `dashboard.adminCalendar.resources.holdExpiresAt`,
`dashboard.overviewBoard.needsYou.titleShort`,
`dashboard.adminAppointments.board.phone.{appointmentsOne,appointmentsOther,sessionsOne,sessionsOther}`.
`npm run verify:ui-messages` exit 0.

## Gates (real exit codes)

See `gates.txt` beside this file.

No selector a Playwright case reads was renamed: `appointment-state`,
`appointment-state-phone`, `calendar-timeline`, `calendar-resources`,
`data-calendar-lane`, `data-calendar-block`, `data-mobile-sheet`,
`data-tulala-mobile-workspace-pill`, `appointments-generate`,
`appointments-new-series`. New: `calendar-page`, `calendar-title`,
`calendar-add`, `calendar-filters`, `calendar-footer`.

## Environment notes

The first pass's two findings repeated: the dev server's "approaching the
used memory threshold, restarting" left every route answering 404 until
`.next` was removed and the server started fresh (once this pass), and cold
route compiles ran 4 to 8 minutes under the machine's load (14 to 16), so
several frames were re-shot with selector waits.
