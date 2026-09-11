# fidelity-polish2: the exacting second pass on Appointments & Classes

**Group.** Workspace: `W39_SessionsList`, `W40_SeriesList` (1440x900).
Front desk (1194x834): `POSAppointments` (B01), `POSAddExtra` (B02),
`POSWalkInBooking` (B04), `POSClassCheckin` (B05), `POSClassReleasedPlace`
(B06), `A09_Reschedule`, `A01_Service` to `A06_Confirmed`. Left as the
previous pass found them, with the reason below: `NewAppointment`,
`Calendar`.

Each folder holds `board.png` (the board's HTML rendered at its viewport),
`before.png` and `after.png` (this branch, local `next dev` on `qa-journeys`,
the isolated database, signed in as the fixture owner, the dev-only identity
banner hidden). `before.png` for W39, B01 and B05 was shot on this branch's
parent (`program/fidelity`, after fid-polish1's till chrome); for the others it
is fidelity-appts's live frame, the last time the screen was drawn (the
till chrome above it has since lost the identity bar, D-POS-69). Nothing was
written on any tenant by the screenshots; the Playwright case writes to the
fixture workspace as it always has.

**Branch.** `work/fid-polish2` off `program/fidelity` (`f244f6aab`). Nothing
pushed; production never read or written; `npm run db:push` never run.

## Method

As fid-polish1: board and live rendered at the same viewport and measured
element by element (`getBoundingClientRect` + computed font, line-height,
padding, radius, colour) with a throwaway script
(`web/.fid-polish2-tools/inventory.mjs`, `diff.mjs`; not committed), then
compared text by text. Every difference found is listed; each is fixed here or
named under "What remains" with its reason.

## W39_SessionsList: the difference list

| # | Difference (before) | Now |
|---|---|---|
| 1 | Line-height 1.65 inherited from the admin body: table rows 43px vs the board's 33, day headings 33 vs 28, the header row 34 vs 29, pills 22 vs 17, segmented chips 30 vs 25, facts rows 34 vs 29, participant rows 33 vs 29, buttons' labels 21px tall. | **Fixed.** `leading-[1.2]` on the page; every one of those measures the board's height now (`inv/W39.after.json`). |
| 2 | The state pill was a 72px chip inside a wrapper span; the board's pill is the grid cell itself, stretched to the 140px column (`Scheduled` 840,405 140x17). | **Fixed.** `StatePill` is the grid child (`justify-start`); measured 140x17 at the board's x. |
| 3 | The two header actions sat at the top of the title block (`items-start`, y=76); the board centres them on the title + subtitle (y=90). | **Fixed** (`items-center`). |
| 4 | With the panel open the left column was padded 24px; the board keeps 28px. | **Fixed.** |
| 5 | The toolbar's gap was 6px; the board's 8px. Filter chips drew the label muted and the value medium; the board draws `Location: Centro` in one ink, one weight. | **Fixed.** |
| 6 | The four panel actions rendered at 13px because a size baked into the button base beat the 12.5px override; `Cancel session…` lost its red when disabled. | **Fixed.** `ActionButton size="sm"`; the danger tone keeps its red at half opacity, as the board draws a red label. |
| 7 | The facts card was padded 6px vertically; the board 12px (first label 18px below the card's top). | **Fixed.** |
| 8 | `Full` pill tone: checked, the `admin-amber` token IS the board's slate (#52606D on 10%); no change. | Matched. |

Unchanged and already matched: the breadcrumb, title, tabs with counts, Week /
Day / List with the arrows and range, Location / Room / Instructor / Needs
attention, the grouped table with its row menu, the sweep's refusals above it
(no board block; a missing class is the commonest reason to open this page,
settled in fidelity-appts), the panel (title, subtitle, facts, PARTICIPANTS,
CHANGE SCOPE, the four actions, Open check-in on the POS). **Verdict:
matched**; the words are the fixture's (`Prove class …`, `QA Floor`).

Not changed on purpose: the page still scrolls as a column rather than clipping
at the viewport as the board's mock does (`overflow:hidden` on a 900px frame);
the one-off night form under the table is the classes journey's write and
stays reachable.

## W40_SeriesList: the difference list

| # | Difference (before) | Now |
|---|---|---|
| 1 | Title read `Appointments & Classes`; the board titles the tab `Series` and offers `Templates` beside `+ New series`. | **Fixed.** Per-view title; `Templates` drawn disabled with its reason (no series templates exist), in en/es/fr. |
| 2 | Column grid `1.5fr 1.6fr 110 120 120 1.3fr 150 24`; the board's is `1.5fr 1.2fr 110 120 120 1.2fr 130 24`. | **Fixed.** |
| 3 | Rows padded 9px; the board 10px. Pill 69px wide inline; the board's is the cell (130x17). | **Fixed.** |
| 4 | Explainer cards padded 16px with a 14px title and 16px between them; the board 14/16px, a 13px title, 14px gap, 8px inside. | **Fixed.** |
| 5 | Line-height, as W39. | **Fixed.** |

**Verdict: matched.**

## POSAppointments (B01): the difference list

| # | Difference (before) | Now |
|---|---|---|
| 1 | The rail had no `Lock` and no `Workspace` row; the board's rail ends with both (as the counter's now does, D-POS-69). | **Fixed.** `PosFrame` gets the counter's `lock` (disabled, D-POS-15) and `workspace` door; the MODE chip is labelled with the mode's own name and opens M33 through the shell's provider, as on the counter. |
| 2 | Header: title 22px, subtitle 14px, 44px pills with a 15px label and an indigo avatar; a separate `Reload` button. The board: 64px header, 19px/600 title, 13px subtitle, 40px pills with a 14px label, 1.5px borders, a brand-soft 28px avatar, no reload. | **Fixed.** The day arrows and a ↻ reload sit inside the subtitle line (the board draws no control for them; the till still needs a way to page the day and re-read it). |
| 3 | The list was 340px wide; the board 360. Tabs were the small 13px segmented; the board's `Today · Due 2 · Done 6` is 15px on 10/16 and `Appts · Classes` 14px on 8/12. Rows: a 64px time column at 15px, a 15px name, a 13px second line, a 12px pill on 3/10, 12px vertical padding. The board: 46px mono time at 14px, 15.5px name, 13.5px line, 11px pill on 2/8, 14px padding, 12px gap. | **Fixed**, every one. The two chip groups wrap onto two rows in 360px (the board overflows its own column here). |
| 4 | Walk-in / Book: 44px, no icons, 10px gap; the board 48px with a plus and a calendar icon, 8px gap, 12/14 padding. | **Fixed.** |
| 5 | Detail pane: 16px padding, a round 48px indigo avatar, a 22px/600 title; the board: 18/24 padding, a 52px radius-14 brand-soft avatar, 20px/700 title, 14px line, chips at 13.5px on 5/11. | **Fixed.** |
| 6 | Grid `1fr 260px`; the board `minmax(0,1.25fr) minmax(300px,1fr)` with 14px gap; cards radius 14; the board's 16. | **Fixed.** |
| 7 | Every sale line sat under BOOKED; the board splits BOOKED from ADDED TODAY, with `Added` (coral) and `Product` (slate) chips and a 14.5px second line. | **Fixed** by the rule in D-POS-70 (a line linked to the booking or carrying the booking's own service was booked; the rest was added at the desk; a product offering is retail). `POSAppointments/after.png` predates this rule: it shows the fixture's one `Massage` line under ADDED TODAY, which the earlier `bookingId`-only rule got wrong (no line of an instant booking carries a `booking_id`); under the committed rule that line files under BOOKED. Not reshot: the dev server was stopped on the coordinator's instruction before a new frame could be taken. |
| 8 | Line rows: 36px quantity box 600, 16px title, 17px/600 price, 10/14 padding; the board: quantity 700, 16.5px/700 price, 13/16 padding, the section header 12.5px on 10/16 with `.06em`. | **Fixed.** |
| 9 | Add service / Product / Use a pass: 44px 15px radius-12 px-16, no icons; the board 44px 14px radius-11 px-14 with plus / tag / pass icons, 8px gap, 12/16 padding. | **Fixed.** |
| 10 | Totals card: `Services · Paid so far · Balance due`, 6px vertical padding; the board `Services · Retail · Deposit paid · Balance due` in a 14/16 card, the balance 30px/700 at `-.025em`. | **Fixed.** `Retail` is the product lines' sum; `Paid so far` keeps its honest name (the till knows what was paid, not that it was a deposit on a date). |
| 11 | Collect 56px radius-12; the board 60px radius-14 at 17px. The pair under it 44px at 13px; the board 48px at 15px. | **Fixed.** |
| 12 | WHO DID WHAT card padded 12px with a 13px dim line; the board 14/16. | **Fixed** (still disabled: a line is not attributed to a person, D-POS-19). |

**Verdict: matched** (structure, order, controls, copy); the board's `Deposit
paid $405` chip is not drawn (the till knows paid-so-far, not the deposit's
date) and `Rebook` stays disabled, as before.

## POSAddExtra (B02): the difference list

| # | Difference (before) | Now |
|---|---|---|
| 1 | Sheet header 24px padding with a 20px/600 title; the board 18/22/16 with 20px/700 at `-.01em`, the subtitle 3px under. Body 24px; the board 22. Footer 24/16; the board 22/14 with a 48px Cancel and a 56px radius-14 confirm. | **Fixed** (`PosSheet`, shared by B02, B04 and A09). |
| 2 | Search: a 48px field; the board a 52px radius-14 field with a search icon. Rows: radius 12 with 12/14 padding, a 16px title, `+$x · product` line, minutes right; the board radius 14 with 14/16 padding, 1.5px border, the right-hand column a coloured verdict (`Fits during processing` / `Dani is busy …` / `No time needed`). | **Fixed.** The verdict is the truth this engine has: `No time needed` (slate) for an untimed item, `Time not re-planned` (coral) for a timed one (D-POS-19). |
| 3 | The facts card read `Who · New balance`; the board `New end time · Who · New balance`. | **Fixed.** `New end time` reads the booking's end unchanged, or the D-POS-19 sentence when a timed extra is picked. |

**Verdict: matched**; the time recheck itself stays not wired (no re-plan writer).

## POSWalkInBooking (B04): the difference list

| # | Difference (before) | Now |
|---|---|---|
| 1 | Field labels 14px/600 ink; the board 14px/600 muted with a 13.5px dim hint. Fields 48px radius-12 1px; the board 52px radius-12 1.5px at 16px. | **Fixed** (`POS_FIELD`, `POS_LABEL`, `POS_HINT`). |
| 2 | Free-time rows: `110px 1fr` grid, mono 18px time, radius 12, 12/14 padding, 8px apart; the board: a 96px 16px/700 time (`Now · 13:05` on the first for a walk-in), 16px person, 14px range, radius 14, 14/16 padding, 1.5px border, 10px apart. | **Fixed.** |
| 3 | Footer: Cancel 44px, `Book …` 56px at 17px; the board 48px and 56px at 16px radius 14. | **Fixed.** |

**Verdict: matched.** The `An appointment / A seat in a session` switch above
the form is the engine's (a seat is the same sheet's second kind) and has no
board equivalent; kept.

## POSClassCheckin (B05): the difference list

| # | Difference (before) | Now |
|---|---|---|
| 1 | The check-in sat in the right pane beside the day list; the board fills the content area with it, names the class in the 64px header (`Pilates Reformer · 11:30` / `Studio A · Vale · starts in 6 min`) and puts the three chips in a 46px strip under the header. | **Fixed.** The list steps aside while a class is open; the header reads `{class} · {time}` over `{venue} · starts in N min`; `CheckinStrip` draws the chips at the board's 14px on 7/11. The rail's `Sessions` row is the way back (D-POS-70). |
| 2 | Search 48px; the board 52px with an icon. Tabs 13px; the board 15px on 10/16. | **Fixed.** |
| 3 | Roster rows: `24px 1fr 96px 104px`, 16px name, 12px pill, 40px actions; the board `36px 1.3fr 1.1fr 120px 140px 110px`, 15px name, a 14px note column, 13.5px chip on 5/11, 44px radius-11 full-width action, 12/16 padding. | **Fixed** (without the 120px position column: positions are not tracked, D-POS-19). |
| 4 | Right column 240px, no border, 10px gap, buttons at 14px px-10; the board 360px with a left border, 18px padding, 12px gap, 48px full-width buttons with icons (scan, plus, person), the facts card 12/14. | **Fixed.** |
| 5 | The problem notice and `Close check-in` were 13px; the board 14px/500 on 12/14 and a 48px button. | **Fixed.** |

**Verdict: matched.** `Scan a pass`, `Undo`, `Fix`, `Substitute instructor`,
`Close check-in` stay disabled with their reasons (D-POS-19); on the fixture
nothing is `Can't attend yet`, so the coral notice does not draw.

## POSClassReleasedPlace (B06): the difference list

| # | Difference (before) | Now |
|---|---|---|
| 1 | Dialog centred vertically, radius 20, 22/18 padding; the board sits 48px from the top, 560 wide, radius 20 with a 30/80 shadow, the same head as a sheet. | **Fixed** (`PosDialog`). |
| 2 | Choices: 1px border, 12/14 padding, 18px radio, 15px title, 13px hint; the board 1.5px, 14/16, a 22px radio (7px ring when chosen), 16px title, 14px hint at 1.4. | **Fixed** (`PosChoice`). |
| 3 | No footnote; the board ends with the refund note. | **Fixed** with the true sentence (no refund rule is set; a paid place keeps its payment until refunded from the sale), in en/es/fr. |
| 4 | Confirm 56px at 17px; the board 56px at 16px radius 14. | **Fixed.** |

`after.png` here shows the check-in without the dialog: on the fixture no
session has both a free place and somebody waiting at the time of the
screenshot (the dialog needs both; twelve rows were opened looking for one).
fidelity-appts's `POSClassReleasedPlace.live.png` shows the dialog on the
same component before this pass.

## A09_Reschedule: the difference list

| # | Difference (before) | Now |
|---|---|---|
| 1 | "Move it" opened an inline card with one `datetime-local` field and `Move it / Cancel`; the board is a 600px sheet: `Move Laura's booking` / `Her 13:00 stays until the new time is confirmed`, day chips, the free times as 4-up cards (`12:30` over `Dani · Chair 2`), the facts `New · Price · Deposit · Policy · Old slot`, `Keep Thu 13:00` and `Move to Sat 12:30`. | **Fixed.** `MoveSheet` over `classesMoveSlots` (new: the booking's person through the order's offering or the inquiry's mirror, then the walk-in's own `freeStartsForPerson`), day chips for the day shown and the next two, cards `hh:mm` over `{person} · free`, the facts from the sale (`Unchanged · $50.00`, `Nothing paid yet` / `$x stays`), `Policy` says no rule is modelled, `Old slot` states the engine's rule; `Keep Fri, Sep 11, 09:45` closes, `Move to …` runs the proven `rescheduleAppointment` with the window the operator saw. |
| 2 | No hand-typed time in the board. | Kept as `Another time` under the cards: a time outside the person's hours is the operator's call and the engine's refusal names who is busy (the journey's "person busy" case runs through it). |

**Verdict: matched.** A booking with nobody behind it says so in a sentence
(`bookingNoPerson`, three languages) and still takes a typed time.

## A01_Service to A06_Confirmed: the New booking flow

| Board | Verdict | What the screen does |
|---|---|---|
| A01_Service | **matched** in structure (screenshot) | The `Book` door opens a full-screen flow with the five-step strip; step 1 lists the till's timed services as check cards (title, `N min · person`, price) with a search, and THIS BOOKING on the right (line, customer time, total, deposit) with `Continue · people & place`. Differs: one service per booking (the note under the list says so); no add-ons. |
| A02_PeoplePlace | **partial**, unclicked | The service's person as the one `Guaranteed` card, the venue as the place, NEEDED with People (the person for the whole service), Rooms (not tracked), Buffers (the person's hours decide). No second professional, no chair or room. |
| A03_Time | **matched** in structure (screenshot) | Five day chips, the free times as 4-up cards (start over start–end), `Choose hh:mm`. No Morning / Afternoon / Any filter and no itinerary card (a single service has a single block). |
| A04_Details | **partial**, unclicked | Customer name, email, phone; `Who is it for` reads the customer; Notes and Reminders drawn disabled with their sentences. No intake forms. |
| A05_ReviewDeposit | **partial**, unclicked | The line, When, With, Customer, Pay (cash at the visit or now), the note that confirming holds the person's time; `Confirm booking · cash at the visit`. No deposit by card at booking (the website's Stripe path takes deposits); no Save draft / Hold 15 min. |
| A06_Confirmed | built to the board, unclicked | `Booked for {when}`, the line, `Booking: confirmed` and `Balance due` / `Paid` chips, WHERE THIS NOW LIVES (Calendar: today's list at hh:mm; Sales: a sale with $x due; Customer: by the contact given), `Collect $x now`, `Done · back to Today`, `Book another`. No confirmation by SMS or email from the till (said on the screen). |

`A01_Service/after.png` and `A03_Time/after.png` are this branch (the
fixture's `Gel manicure` with `QA Journeys Talent`, the day chips through Sat
12). **A02, A04, A05 and A06 were NOT clicked**: the machine was asked to stop
taking screenshots before those steps were reached, so their verdicts above
are from the code and the typecheck, not from a screen. The next builder
should walk the flow to Confirmed on the fixture before calling those four
matched; the booking write it ends in (`bookWalkInAppointment`) is the one
the Walk-in sheet exercises in the journey's second test.

## NewAppointment, Calendar

Not changed in this pass. `NewAppointment` (the workspace's service-first
form with participants, add-ons, compatible times and the itinerary review)
and the Calendar's resource timeline are workspace builds outside what this
pass could reach after the Front desk; the previous verdicts stand
(fidelity-appts: partial). The Front desk's A01 to A06 flow is the built
booking path.

## Not wired (each drawn disabled with a one-sentence reason in en/es/fr)

Workspace: Templates (new), Generate sessions, + New series, Room and
Instructor filters, Substitute instructor, Move participant, Cancel session,
the two series scopes. Front desk: Use a pass, Who did what, Send payment
link, Rebook, Undo, Fix, Scan a pass, Substitute instructor, Close check-in,
seat positions, the time recheck on an extra; in the booking flow: a second
service, another professional, a chair or room, intake forms, notes,
per-booking reminders, a card deposit, a confirmation message. Recorded as
D-POS-70 in `docs/plans/program/pos/decisions.md` (D-POS-18/19 unchanged).

## Copy

Every new sentence is in `web/messages/{en,es,fr}.json`:
`dashboard.adminAppointments.board.templates*`,
`dashboard.pos.classes.refusal.bookingNoPerson`,
`dashboard.pos.classes.board.{extra.newEndTime, extra.endUnchanged,
extra.timeNotReplannedShort, opened.policyNote, sheet.nowAt, move.*,
booking.*}` (the last two through `classes-copy-flows.ts`, walked by
`classes-copy.static.test.ts` in the three languages). No em dashes.

## Playwright

`e2e/journeys/pos-classes.spec.ts`: the move steps now click the sheet's
`Move to …` button (was `Move it`) and still type the time into
`[data-pos-classes-move-input]`; every assertion is unchanged. Three runs
against this branch's dev server (`--workers=1`, isolated database), all
under the machine's load of 9 to 12 with three other dev servers up:

- run 1: test 1 failed at its own 5 s check that the workspace sidebar is
  gone after the switch (the POS page took 12.6 s to render); 5 did not run.
- run 2: the dev server hit Next's memory threshold and restarted mid-run;
  test 1 timed out on the Settings page's cold compile (91 s).
- run 3 (`runs/pw-pos-classes-run3.txt`): **4 passed** (the switch, the
  walk-in booked and paid, the check-in with the stale refusal, **the move
  refused naming who is busy and the move onto a free time**, i.e. the A09
  sheet end to end); test 5 timed out waiting 300 s for the Events page's
  `Title` field (the events chunk's cold compile), test 6 did not run.

Neither failure is on a Front desk fact; no timeout was raised and no
assertion weakened. `classes-and-waitlist.spec.ts` was not run: the
coordinator asked for one spec and no further load on the machine; its hooks
(`[data-testid=schedule-nights] tr`, `session-open-waitlist`, the seats cell,
the state pill words) are untouched by this pass.

## Gates (private lane, 2026-09-11, real exit codes; `runs/`)

| Gate | Exit |
|---|---|
| `TSC_QUEUE_LOCK=… npm run typecheck` (`runs/typecheck-2.txt`, `/tmp/tulala-tsc.log` line for this checkout) | 0 (twice: after the Front desk, after the booking flow) |
| `npm run lint` | 0 |
| `npm run test:design-system` | 0 (108 pass) |
| `npm run test:tenant-isolation` | 0 (612 pass) |
| `npm run test:size-ratchet` | 0 (173 pass) |
| `npm run test:phase1-i18n` | 0 (20 pass) |
| `npm run verify:ui-messages` | 0 |
| `npm run verify:server-actions` | 0 |
| touched unit/static tests (`classes-copy.static`, `refusals`, `pos-page-wire.static`, `day`, `appointments-classes-model`, `appointments-surface.static`; `runs/unit-touched.txt`) | 0 (47 pass) |
| `pos-classes.spec.ts` | 1 (4 passed, 1 timed out on the Events page's cold compile, 1 did not run; above) |
