# prove-appointments — appointments, classes, the waitlist, and proposed hours

**Journeys.** `web/e2e/journeys/appointments-and-classes.spec.ts`,
`web/e2e/journeys/classes-and-waitlist.spec.ts`,
`web/e2e/journeys/booking-hours-proposal.spec.ts`. Every row asserted on was
written by a screen: the public `/book` page, the public `/events/<slug>` ticket
picker, the Events page, the Appointments page (its Schedule and Waitlist views),
the talent's Services editor and the talent's Calendar. Database reads are checks
on what the browser did, never setup for what it was about to do.

**Branch.** `work/prove-appointments` off `program/journeys-2026-09`
(`deca2efc86b3382baed31103f069e3de1b60c8a0`, see `commit.txt`).

**Database.** Supabase branch `qa-journeys` (`fxlankepwnvelxjrahwk`) for every run
recorded here. Production (`pluhdapdnuiulvxmyspd`) was never written to and
`npm run db:push` was never run. The one migration in this slice was applied to the
isolated branch with `npm run journeys:repair -- 20261231030700_reschedule_moves_order_holds.sql`
(exit 0; the function body on the branch was read back and carries the new loop,
`sql/03-migration-applied.txt`).

---

## 0. Where the browser ran, and why it was not `staging-qa-journeys.tulala.digital`

The named QA host answers with the bypass header (200), but it serves
`d51227f591a719bcc3925ff4d9bce389c1083123` (merge work/fix-waitlist-seat), five
merges behind the branch head. Every build of `deca2efc8` on Vercel ended
`BUILD_EXCEEDED_MAXIMUM_TIME` (three deployments: `dpl_GwGHktUW…`, `dpl_2Vot2V7R…`,
`dpl_3h1NdTujVMzdCvCzDCw15fiPN2SJ`, each 45 minutes, log stops at "Creating an
optimized production build"). The same tree builds locally in about five minutes
(`next build` exit 0, three times during this run). A CLI deploy from this worktree
would not carry the branch-scoped Preview env that points the host at the isolated
database, so it was not attempted; a wrong-env deploy is how T0-04's first build
ran against production.

So the proof ran the **production build of this worktree** (`next build`, then
`next start -p 3131` with `VERCEL_ENV=preview` so `/api/dev/signin` answers as it
does on the preview host), on the host `qa-journeys.localhost:3131`, which is
registered in the isolated database's `agency_domains` for the `qa-journeys`
workspace, against the same isolated database the QA host uses. `host.txt` records
this. What is NOT proven by this: that the Vercel deployment of this commit behaves
the same. That needs the branch to build on Vercel, which is outside this slice.

The previous run's four recon specs under `web/e2e/scratch/` were deleted; their
findings are folded into the sections below.

## 1. What the previous run had already found (kept, verified, extended)

Uncommitted in the worktree when this run started, no README:

1. `purchase.ts` wrote the booking row with `starts_at = NULL` for every instant
   booking, so the board filed a manicure due in twenty minutes under "No date
   agreed yet"; and a $0 slot purchase wrote NO booking at all, so a confirmed
   appointment was on no board. Fix: `appointment-window.ts` (pure, tested) plus
   the booking insert now keyed on "money OR a time", extracted this run into
   `purchase-booking.ts` because `purchase.ts` crossed its 800-line budget.
   Verified live: `screenshots/appointments/board.png`, row `appt-board-*` under
   **Today** with its time.
2. `loadSchedule` returned `{ series: [] }` the moment a workspace had no series,
   so a night created by "Schedule a night" on the same page was invisible on it.
   Fix: one-off nights are read and rendered (`schedule-nights`). Verified live:
   `screenshots/classes/night-scheduled.png`, "2 of 2 left · On sale".
3. Four appointment tests in `appointments-and-classes.spec.ts` (board, move,
   stale screen, full room). They passed on first run here; two of them were
   found to be passing over defects (sections 2.2 and 2.3) and were strengthened.

## 2. What was proven, with evidence

All screenshots under `screenshots/`, Playwright traces under `traces/`, SQL and its
output under `sql/`. Times below are UTC on 2026-09-10.

### 2.1 The day's bookings, with their state
`appointments-and-classes.spec.ts` › "a booking made on the public page is on the
day's board". A guest books a Massage (a $0 free-reserve service, settled in
person, so the purchase settles on creation) on `/book`; the operator opens
Operate › Appointments from the rail: the row is under **Today** with its time,
state **Confirmed**, and a **Move it** action. `screenshots/appointments/board.png`.
DB: `sql/10-appointments-after.sql`, and the person's hold has no expiry (F2). The
first run used Gel manicure, a deposit service: its order stays `pending_payment`
with a card leg in flight, so its hold keeps the reservation TTL on purpose until
the card clears; that is why the settled service carries the kept-person claim.

### 2.2 Reschedule, and the confirmation
› "a move that worked says so". Move it → new start (two days on, venue zone) →
**Moved to Sat, Sep 12, 11:15.**, and the row itself re-reads to the new day.
DB agrees: `agency_bookings.starts_at` = the target, the window keeps its length,
the order's `talent_holds` row moved to the same instant. `screenshots/appointments/moved.png`.

**Found and fixed.** The first run passed while the person stayed behind:
`sql/01-defect-move-left-the-person-behind.sql` shows `booking_starts` on Sep 12
and `hold_starts` still on Sep 10. `reschedule_booking_set` moved person legs only
through an inquiry's `talent_bookings` mirror, which a public-page booking does
not have. Migration `20261231030700_reschedule_moves_order_holds.sql` moves every
firm hold keyed `order:<id>:reserve` inside the same transaction.

### 2.3 A taken time names who is busy
› "a taken time is refused, and the refusal names who is busy". Two massages with
the same person; moving the second onto the first's time is refused with
**QA Journeys Therapist B is already booked at that time. Pick another time, or
another person.** Nothing moved (booking and hold unchanged). `screenshots/appointments/person-busy.png`.
Before the migration above this refusal could not happen: nothing tried to take the
person's calendar at the destination.

### 2.4 A stale screen is refused
› "a screen that went stale…". Two desks open the same booking; the second moves it;
the first's move is refused with **This booking changed since you opened it.** and
the colleague's move stands. `screenshots/appointments/stale-refused.png`.

### 2.5 A full room is refused, naming the room
› "a full room is refused". Two Couples massages (Room A holds one); moving the
second onto the first's time is refused with **Room A is full at that time. Pick
another time.** `screenshots/appointments/room-full.png`. Both the room and the
people are taken at that destination; the migration runs the capacity legs before
the order's person legs on purpose, so the room is the refusal that is named (the
scarcer, shared thing), and a booking with no room still names the person (2.3).

### 2.6 A class night, created through the interface, filled on the public page
`classes-and-waitlist.spec.ts`. Events page: new event, one $0 tier "Seat",
Publish. Appointments › Sessions and series › Schedule a night (that event, 2
seats). The night appears on the schedule as **2 of 2 left · On sale**
(`screenshots/classes/night-scheduled.png`). Two guests take a seat each on
`/events/<slug>`; a third is refused by the engine in words (**…sold out…**,
`screenshots/classes/public-sold-out.png`) and takes nothing. The schedule reads
**0 of 2 left** with **Put somebody on the list** (`screenshots/classes/schedule-full.png`).

### 2.7 The waitlist: join, refused while full, freed, offered, taken, held, given back, handed on
The door from the full row opens the class's card with the form ready. Ana and Beto
join (`screenshots/classes/waitlist-two-waiting.png`). Offering Ana a place while
the class is full is refused: **There is no free place right now…**
(`screenshots/classes/promote-refused-full.png`).

A seat is freed through the Events page (Sessions › "Seats for Seat" 2 → 3; a $0
ticket has no refund to go through, see 4.3). Waitlist tab: **1 of 3 left**; Offer
the place → **Offered to Ana Espera, held until …**; They took it →
`session_waitlist_entries.status = accepted` with `accepted_allocation_id` naming a
`capacity_allocations` row in state `committed`, no order line, and the pool's
committed units back at 3 (`screenshots/classes/place-taken.png`,
`sql/20-waitlist-after.sql`). **The accepted place holds a seat:** offering Beto
is refused as full (`screenshots/classes/second-refused-seat-held.png`). Cancelling
Ana's seat releases that allocation and the card reads **1 of 3 left** again; Beto
is offered and takes it (`screenshots/classes/second-took-the-place.png`).

### 2.8 Proposed booking hours
`booking-hours-proposal.spec.ts`. A talent with no hours publishes a bookable
service from Services (Fixed price, Direct booking). DB: one
`talent_booking_hours_proposals` row, status `proposed`, source `publish_default`,
and **no** `talent_booking_hours` row. The public `/book` page for that service
says **Nobody has set booking hours for this service yet…** with no times
(`screenshots/proposals/public-no-hours.png`). The workspace's Appointments board
shows the proposal and says **This person sets their own hours…** with no accept
button (`screenshots/proposals/board-proposal-self-managed.png`). The person accepts
in their own Calendar with `America/Mexico_City`: hours row exists with that zone,
proposal `accepted` (`screenshots/proposals/proposal-accepted.png`,
`sql/30-proposal-after.sql`). The board no longer lists it; `/book` now offers times
(`screenshots/proposals/public-hours-open.png`).

## 3. What failed and what was fixed in the application

| # | Defect, as observed | Fix | Guard |
|---|---|---|---|
| F1 | Moving an instant booking moved the booking and not the person (2.2) | `supabase/migrations/20261231030700_reschedule_moves_order_holds.sql` | `reschedule-moves-order-holds.static.test.ts` |
| F2 | A paid or pay-in-person appointment's talent hold kept its 15-minute TTL: the public page re-offered 15:00, 15:45, 16:30 twenty minutes after they were booked (`sql/00…`, `sql/02…`), and the expiry cron deletes such holds | `scheduling/commit-order-holds.ts`, called from `purchase.ts` (settled or pay in person), `complete-order.ts` (card paid, free sale) | `commit-order-holds.test.ts` |
| F3 | The public slot picker sent `from=<today>`, parsed as midnight UTC, so it offered times already past (15:00Z at 15:24Z) | `public-slots.ts` floors `from` at now | `load-busy.test.ts` (expectation corrected: it pinned the midnight) |
| F4 | The slot picker said "No open times in the next two weeks. Try again later." for a person whose hours were never set | `SlotPicker.tsx` renders the endpoint's reason; three sentences, en/es/fr | proven in 2.8 |
| F5 | Every counter sale and menu pizza (undated money shells) filled the board's "No date agreed yet" (60 rows above the real ones, `board.png` of the first run) | undated read keeps only rows with an inquiry or no order | `appointments-surface.static.test.ts` |
| F6 | After "they took it" the row went back to **Offered**: a slower earlier refresh painted over the later one | `AppointmentsPage.tsx` numbers refreshes and drops stale answers | `appointments-surface.static.test.ts` |
| F7 | The board's proposals banner offered "Accept these hours" for a claimed person and refused on the click | loader marks `selfManaged` via `staffMayWriteHours`; banner says who decides, no button | `appointments-surface.static.test.ts` |
| F8 | A night scheduled for an event read "Untitled night" on the schedule | `scheduleSession` names it after the event | proven in 2.6 |

`purchase.ts` was over its 800-line lint budget after the previous run's change; the
booking-anchor block was extracted to `purchase-booking.ts` rather than the budget
raised.

## 4. What is not proven, and why

1. **On the Vercel deployment.** See section 0. Same code, same database, same
   browser, but a local production server, not the host in the brief.
2. **Multi-tier nights on the Schedule and Waitlist views.** Both readers key a
   session's pool by `subject_id` in a Map, so a night with two tiers (the seeded
   QA Night: GA 12 + door 1) shows whichever pool PostgREST returned last, and the
   waitlist RPCs use the first pool by `created_at`. The proof used a one-tier night
   on purpose. Not fixed: it is a design question (is a queue per night or per
   tier) that the Events and Ticketing owner should answer.
3. **Freeing a seat by giving a ticket back.** A $0 ticket cannot be refunded
   through the Orders desk (a zero line refuses), and no screen cancels a free
   ticket, so the seat in 2.7 was freed by raising the night's seats. A real
   cancellation path for free admissions is owed to the Events slice.
4. **"sold: unknown" on the Events page** beside a night with two committed seats
   (`screenshots/classes/seat-opened.png`). Not this slice's surface; recorded.
5. **The operator accepting hours for an unclaimed person or a resource.** The
   fixture's third talent is claimed, so the workspace could not be the acceptor;
   the policy says so and the board now says so. The unclaimed case runs the same
   `acceptBookingHoursProposalCore` and was not walked.
6. **Who serves.** The board prints "Nobody assigned yet" on an instant booking
   whose talent hold exists (`servingNamesByInquiry` reads inquiries only). Not
   asserted, not fixed.
7. `test:phase1-i18n` is red on the branch base (18 dead `dashboard.pos.*` and
   `admin.people.*` keys from the p4 merges), before and after this work; not this
   slice's keys.

8. **Who serves, which room.** The board prints "Nobody assigned yet" and "No
   room or resource" on instant bookings that hold a person and Room A
   (`screenshots/appointments/room-full.png`): `servingNamesByInquiry` and
   `placeNamesByOrder` do not read the order-keyed holds and allocations. Not
   asserted, not fixed.
9. **The slot picker does not know a companion's calendar.** Couples massage
   offered a time its companion therapist already held (from a sibling test) and
   the confirm was refused with "That resource is not free." with no name. The
   spec books those on days nothing else touches; the gap is recorded.
10. **`capacity_pool_committed_peak`: permission denied (42501)** for the
    service role on the isolated branch, which is why the Events page prints
    "sold: unknown" (item 4). A grant or a definer the Events slice owns.
11. **Transient Supabase auth/PostgREST errors** during the runs (HTML error
    pages from the isolated project: `/api/dev/signin` 401/500, and once the
    "Massage" service dropped off `/book` because `resolveTalentBookingMode`
    reads an error as `inquire`). Reruns passed; the demote-on-error is worth a
    sentence on the page some day.

## 5. Commands and exit codes

Run from `web/` in this worktree with
`TSC_QUEUE_LOCK=/tmp/tulala-tsc.prove-appointments.lock TSC_QUEUE_TICKETS=/tmp/tulala-tsc.prove-appointments.tickets`.

| Command | Exit | Note |
|---|---|---|
| `npm run typecheck` | 0 | TSC PASS |
| `npm run lint` | 0 | (first attempt exit 2: ESLint opened a Playwright trace file mid-write; rerun after the traced run finished) |
| `npm run test:scheduling` | 0 | 326 pass |
| `npm run test:sessions` | 0 | 150 pass |
| `npm run test:money` | 0 | 929 pass (16 failed once when the hold commit used `.not()`, which the money fakes do not model; filter simplified, see `commit-order-holds.ts`) |
| `npm run test:tenant-isolation` | 0 | 605 pass |
| `npm run test:phase1-i18n` | 1 | inherited: identical 18 dead keys on the committed base, not this slice's |
| `npm run journeys:repair -- 20261231030700_reschedule_moves_order_holds.sql` | 0 | applied twice (second time after reordering the legs); function body read back |
| `npx next build` | 0 | three times (~5 min each) |
| `npx playwright test e2e/journeys/ --project=chromium --workers=1` | 0 | 11 passed (5.2 min); traced run also 11 passed, `journeys-run.log` |
