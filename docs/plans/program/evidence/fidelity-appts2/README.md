# fidelity-appts2: Appointments & Classes wired to Package 2, the Book door walked to Confirmed, the drawer and the Calendar's appointments bits

**Group.** Workspace (1440x900): `W39_SessionsList`, `W40_SeriesList`,
`W10_ClassesSchedule` (the series editor + Generate sessions),
`NewAppointment` (WS007), `Calendar` (WS006, the Resources view). Front desk
(1194x834): `A02_PeoplePlace` to `A06_Confirmed` on the Book door.

Each folder holds `board.png` (the board's HTML rendered at its viewport),
`before.png` (the screen as fidelity-polish2 / fidelity-appts left it) and
`after.png` (this branch: local `next dev` on port 3180 proxied as the
registered host `qa-journeys.local` on 3181, the isolated database
`qa-journeys`, signed in through `/api/dev/signin` as the fixture owner, the
dev-only identity banner hidden). Extra `after-*.png` frames show the forms
open and the outcomes. Every number on every frame is a reader's; the words
are the fixture's (`fid-appts2 Stretch`, `fid-appts2 Boxing`, `Gel manicure`,
`QA Journeys Talent`, `QA Floor`).

**Branch.** `work/fid-appts2` off `program/fidelity` (`9073e6e70`). Nothing
pushed; production never read or written; `npm run db:push` never run.

## What this pass wired (the spec: `docs/plans/program/engine/scheduling-appts-wiring.md`)

| Control | Action | Proven on the isolated tenant |
|---|---|---|
| Generate sessions (W39/W40 header card, W10 button) | `generateSessionsForSeriesAction({ seriesId, untilDate })` | `Pilates Reformer` through +28 d: "0 sessions created, 8 already existed" (idempotent); `fid-appts2 Stretch`: "8 sessions created, 0 already existed"; `fid-appts2 Yoga`: 4; `fid-appts2 Boxing`: 5 (`W10_ClassesSchedule/after-new-series-generated.png`). |
| + New series, a series row's Edit (pencil) | `upsertSessionSeriesAction` through the W10 editor (`SeriesEditor.tsx`): title, weekdays, local time, duration, seats, starts/ends on, room (the workspace's venues from `loadSchedule.venues`), instructor (the shell's team list), drop-in item (the catalog), active | Three series created and one edited; the venue's zone is what is written, never the browser's. |
| Substitute instructor (scope This / Future / Entire series) | `sessionSetInstructorAction` | "Instructor set on 1 session(s)" on `fid-appts2 Boxing · session 1 of 5`; the row's INSTRUCTOR and the panel's Instructor fact repaint (`W39_SessionsList/after.png`); an earlier run with Entire series set all 8 Stretch sessions. |
| Move participant (`Move…` on a valid ticket) | `sessionMoveParticipantAction` | The form opens with the series' other live sessions as targets (`after-move-participant.png`). **The write was not exercised**: the fixture had no seated participant on a series session, and the two ways to seat one from the till both stopped short (below, "Findings"). |
| Cancel session (scope + reason) | `sessionCancelAction`; `refundIntents > 0` draws the `paid_seats_need_refund` sentence as a note | "1 session(s) cancelled." on `fid-appts2 Stretch · session 1 of 8`; the row reads Cancelled, the panel's actions disable (`after-cancel-session.png`). No paid seat on the fixture, so the refund note was not drawn. |
| Cancel appointment (Appointments tab) | `cancelBookingSetAction({ by: "staff" })` | "Cancelled. Nothing to refund." on four bookings this pass booked (`after-cancel-appointment.png`); the database row reads `cancelled`. |
| Copy customer link (cancel / reschedule) | `signBookingManageTokenAction` → `/manage/<token>` | Refuses with the `unavailable` sentence on this environment: `GUEST_COOKIE_SECRET` is not set in `.env.capacity-isolated.local`, so no token can be signed. The control says so instead of copying nothing. |
| Instructor filter and column (W39, W40) | `sessions.instructor_user_id` / `session_series.instructor_user_id` via the reader | Names on the rows; the chip lists the instructors in the window. |

Refusals come back as `dashboard.scheduling.engine.refusal.<reason>` in
en/es/fr (`engineRefusalKey`); nothing new was needed there. The page's own
sentences (`board.generated`, `generateForm.*`, `seriesEditor.*`,
`panel.substituted` and the rest) are new in the three catalogues; the seven
dead `*Off` keys the spec names are deleted (`message-key-usage` green).

## Board by board

### W39_SessionsList: matched

Structure, order, controls and copy as fid-polish2 left them, plus: Generate
sessions and + New series live; INSTRUCTOR filled and filterable; Substitute
instructor / Move participant / Cancel session open their confirm cards
under the four actions (the board draws the buttons; the cards follow the
capacity form's shape); Future sessions / Entire series live (disabled with
the one-off sentence on a night in no series). Differs: the one-off night
form stays under the table (the classes journey's write); the sweep's
refusals stay above it (fidelity-appts).

### W40_SeriesList: matched

INSTRUCTOR named; a pencil (Edit) beside the row menu opens W10; Templates
stays disabled (no series templates). The "What a series holds" card's
People row now says the instructor is the series' own.

### W10_ClassesSchedule: matched (structure, order, controls, copy)

| # | Board | Live |
|---|---|---|
| 1 | Title `Pilates Reformer · generate sessions`, subtitle, Edit template, Generate sessions | Same, plus a close (×), Save series and the "Generate through" date the engine needs; Edit template disabled with its reason. The title truncates when the fixture's title plus the five controls do not fit 1440 (the board has two controls). |
| 2 | Used in · 3 line with the note | Used in · N from the workspace's modes, the same note. |
| 3 | Days / Time / Studio / Instructor | Seven weekday toggles in the field; time + duration in one field; Studio is the venue select with the board's hint; Instructor is the team select. A first row above it holds Title, Starts on, Ends on and Active, which the board keeps in its header and the engine requires. |
| 4 | Capacity / Equipment positions / Booking window / Waitlist | Capacity live with the board's hint; the other three disabled with their sentences and the engine's true values. |
| 5 | Drop-in price / Pass eligibility / Attendance / Cancellation | Drop-in item (the catalog select; the price is the item's); the other three disabled with their sentences. |
| 6 | SESSION · PREVIEW table with CONFLICTS pills | The series' dated sessions from the reader with `Clear` / `Cancelled`, and the sweep's skipped collisions as `Room busy · skipped` rows. |
| 7 | WHAT THE POS GETS + the warning | Same four facts; the warning is the reader's own refusal or collision sentence when there is one. |

### A02_PeoplePlace, A03_Time, A04_Details, A05_ReviewDeposit, A06_Confirmed: matched, walked to Confirmed

Walked end to end four times on the fixture tenant (real bookings, ids
below); frames are the final code. The differences fid-polish1's method
found and fixed this pass:

| Board | Difference (before) | Now |
|---|---|---|
| A02 | One 300px person card with a chip; the venue as a pin card; THIS BOOKING showed the line card. Header subtitle "From the desk". | The person card is the board's (36px avatar, name, a line, the Guaranteed / Preferred segmented with Preferred disabled and its reason) in a 3-column grid; WHERE is the board's radio card (22px dot, title, line) in a 2-column grid; THIS BOOKING is Service / With / At / Total. The subtitle accumulates customer · time · person · venue as the flow settles them. One continue button (the board's); a done step in the strip is the way back. |
| A03 | No Morning / Afternoon / Any; slot cards `hh:mm` over `hh:mm–hh:mm`; THIS BOOKING was the line card. | The day chips and the Morning / Afternoon / Any filter (live, on the venue's clock); slot cards `hh:mm` over `ends hh:mm` at the board's sizes; the note under the grid; the right column is the itinerary (`THU 10 SEP · 13:00`, the service at its start, `Ends · {person} is free` at its end, "{customer} sees start–end"). |
| A04 | Notes as one disabled textarea; reminders as a sentence; THIS BOOKING the line card. | Customer / Who is it for with the hint; INTAKE (not attached, said); NOTES as the board's two fields (for the person, for the customer) disabled; REMINDERS & CONSENT as the board's two checkboxes disabled; THIS BOOKING is date → time range, `{person} · guaranteed` → venue, Total, Deposit now. |
| A05 | One column: line, When/With/Customer/Pay facts, note; Confirm in THIS BOOKING. | The board's two columns: the line card with Total / Deposit / Balance at the visit / Cancel free until, the note, Save draft and Hold 15 min disabled; PAY · HOW with Card now / Payment link / No deposit disabled and Cash selected; Confirm with the footnote under the options. Header "New booking · review". |
| A06 | Tick, sentence, title, line, chips, a hint, three buttons; three facts. | The board's 96px tick, `Booked for …`, the line, the chips, Confirmation by SMS / Also email disabled, Collect / Done / Book another stacked at 520px; WHERE THIS NOW LIVES with four facts (Calendar, Sales, the customer's record, the person's Today) and the note. Header `Booked · {customer}` / `{when} · {person}`. |

"Review" stays the step's name (the board: "Review & deposit"); the desk
takes no deposit (D-POS-119).

### NewAppointment (WS007): matched in structure, controls and copy; a drawer, not a page

The Calendar's "New booking" (and the Create menu's) now opens
`NewAppointmentDrawer` (half width): Service first | Time first (disabled),
Customer (name, email, phone; Search existing disabled, Create customer,
Walk-in (no contact)), Participants (the customer as Recipient, Add
participant disabled), Services (the till's timed services as the one
line, price, + Add-on disabled; + Add service disabled, + Create service is
the catalog, Use package credit disabled), Professional / Location / Room
(the service's person, the default venue, disabled with their sentences),
Compatible times · day (seven day chips, the person's free times from
`classesWalkInSlots`), REVIEW (the itinerary, the totals with the deposit
policy, the snapshot note, the intake sentence), Save draft / Hold 15 min
disabled, Confirm & book (`classesBookWalkIn`) with the footnote. Booked
`fid-appts2 Drawer` for Sun 13 Sep 11:15 from it (id below); the Calendar's
Confirmed count went 65 → 66. Differs: one column (a drawer), no board-side
itinerary segments (one service is one block), no deposit.

### Calendar (WS006): partial, the appointments bits

A Resources view beside Month / Agenda / Day (Week drawn disabled): the day
on the venue's clock with prev/next, Location / People / Rooms & stations
(disabled) / Service / State filters, the legend (Processing and Imported
busy disabled), PEOPLE · RESOURCES rows (the people serving, the places on
the sales, the rooms of the day's class sessions) against 09:00–17:00 or
wider, appointments as confirmed or hold blocks, sessions as `title ·
booked/places`, the holds line under the table. The fixture's bookings name
no serving person, so every block sits on "Nobody assigned"; `after.png`
shows that truthfully. Not built: the month grid's own chrome (the legacy
month view, inline styles frozen), drag to reschedule (said on every block).

## Findings outside this group (not fixed here)

- **A free seat never issues a ticket from the till.** Walk-in › A seat in a
  session on a $0 series session says "Seat held … Nothing to collect: this
  one is free" and leaves the order `draft`, no admission, no seat taken.
- **A paid seat's collection refuses on the named-ticket rule.** The same
  path on a $12 session (`QA gala ticket` item) says "This item needs the
  customer's name before it can be sold" although the sheet's name field was
  filled; the seat stays a draft. Both are the reason Move participant's
  write is unproven above.
- **The dev server's memory restart leaves it serving 404s.** Twice this
  pass "Server is approaching the used memory threshold, restarting..."
  was followed by every tenant path (`/admin`, `/book`, `/api/dev/signin`)
  answering the storefront's not-found until `.next/dev` was parked and
  the server started fresh. `fid-appts2-next-stale-*` in the scratchpad.
- `classes-and-waitlist.spec.ts` and `pos-classes.spec.ts` still drove the
  Events page's pre-door structure (`Title`, `create draft`, a `Sessions`
  tab, `save`); their selectors are updated to the door structure below.

## Rows written on the fixture tenant (all deleted by id after the frames; see `runs/cleanup.txt`)

Series `177b3089-fe2a-433c-970e-9f2a09c5e932` (Stretch), the Yoga and Boxing
series and their 17 sessions and pools; bookings
`5b4896be-2de6-4f11-a8f3-2da1b92af35a`, `443c80b5-466f-4952-8c55-f306146d1be3`,
`31784215-2874-41ea-a3a8-6b85f057046e`, `4db99998-f272-4b1a-b70b-abb143542ce4`
(`fid-appts2 Laura` / `Cancelme`), the drawer's `fid-appts2 Drawer` booking,
and the two seat drafts. The Front desk mode was switched on in Settings
(the pos-classes journey does the same and needs it on).

## Playwright (local dev, isolated database, `--workers=1`, one spec at a time; `runs/`)

| Spec | Exit | Notes |
|---|---|---|
| `appointments-and-classes.spec.ts` | 0 (5 passed, 4.4 min) | After the fresh server. An earlier run failed on `/book` while the degraded server served 404s (above). |
| `classes-and-waitlist.spec.ts` | 0 (4 passed, 3.6 min) | Selector updates to the door's Events structure (`events-create`, the event-name label, `events-save-draft`, `events-add-tier`, `events-tier-add`, `events-tab-overview`, `events-publish`, `events-open-<id>`, `events-tab-schedule`), a hydration-safe Sessions-tab click, and the midnight "24" hour in `venueLocalValue` (the fix pos-classes already carried). No assertion changed. |
| `pos-classes.spec.ts` | 1 (4 passed, 1 failed, 1 did not run; 5.2 min) | The same Events selector updates. Test 5 scheduled its night "two hours from now" at 00:10 EST, which is 23:10 on the venue's clock: the night landed on the next venue day and the till's "today" did not list it. A time-of-day boundary in the spec, not on a Front desk fact; test 6 depends on it. Two earlier runs failed on the degraded server. |

## Gates (private lane, real exit codes; `runs/gates.txt`)

| Gate | Exit |
|---|---|
| `TSC_QUEUE_LOCK=/tmp/tulala-tsc.fid-appts2.lock TSC_QUEUE_TICKETS=… npm run typecheck` (dev server stopped first; `runs/typecheck.txt`) | 0 |
| `npm run lint` | 0 |
| `npm run test:design-system` | 0 |
| `npm run test:tenant-isolation` | 0 (600 pass) |
| `npm run test:size-ratchet` | 0 |
| `npm run test:phase1-i18n` (includes `message-key-usage`) | 0 |
| `npm run verify:ui-messages` | 0 |
| `npm run verify:server-actions` | 0 |
| `classes-copy.static.test.ts`, `appointments-classes-model.test.ts` | 0 |

A first typecheck, run while the dev server was up, exited 2 on 190 errors all
inside `.next/dev/types/routes.d.ts`, a file the server's memory restart had
left truncated; none in source. The gate above is the clean run.

A pos-classes re-run scheduled for after the venue day rolled (so test 5's
"+2 h" night stays on the till's today) was cancelled on the coordinator's
instruction; the run recorded above (4 passed, 1 failed on that boundary, 1
did not run) stands.

## Not wired (each drawn disabled with a one-sentence reason in en/es/fr)

Recorded as D-POS-119 / D-POS-120 in `docs/plans/program/pos/decisions.md`:
W10's Equipment positions, Booking window, Waitlist hold, Pass eligibility,
Attendance rule, Cancellation rule, Edit template; W40's Templates; W39's
Room filter and Add a service; the Book door's Preferred, a second person or
participant, chair or room, intake, notes, reminders, Card now, Payment link
at booking, No deposit, Save draft, Hold 15 min, SMS / email confirmation;
the drawer's Time first, Search existing, Add participant, Add-on, Add
service, Use package credit, another professional, mobile / virtual, Room /
station, Save draft, Hold 15 min; the Calendar's Rooms & stations filter,
Processing and Imported busy, drag to reschedule, Week.
