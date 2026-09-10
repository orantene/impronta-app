# pos-classes: the Front desk mode of the point of sale, 2026-09-10

Branch `work/pos-classes` off `program/journeys-2026-09` at `76d695a5d`, merged
forward twice (`2984477f8` pos-enable + pos-floor, `22ea8399c` pos-door).
Mode id `classes`, switch label **Front desk** (es "Recepción", fr "Accueil"),
reached from the top-bar switch "Workspace | <mode>" and its menu, at
`/admin/pos?mode=classes`. Database: Supabase branch `fxlankepwnvelxjrahwk`
(qa-journeys). Production was never read from or written to. No migration.

## What the mode is

The till for appointments and classes: one venue day, for an assistant or the
instructor, full width, no sidebar. Four destinations on the mode's own rail
(`POS_MODE_META.classes.destinations`), each reached by one tap on the rail:

| Rail row | What a person sees | The single next action |
|---|---|---|
| **Today** | the day's `agency_bookings` in arrival order (start, then id), each with its state, who, what, and what the order still owes by the Counter's own rule (`orders.total_cents` minus paid `booking_transactions`) | **Check in** (booking → `in_progress`, conditional on the state the operator saw); **Collect $x** (the Counter's `posStartCollection`, cash); **Move it** (the proven `rescheduleAppointment`, all-or-nothing, with `expectedStartsAt`) |
| **Sessions** | the day's scheduled `sessions` with seats taken against capacity (`readSessionSeats`, the Waitlist view's own reader, summed across tiers) and the roster: `admissions` plus accepted waitlist places | **Mark present** (`markAttendance` → `check_in` RPC); **Book a walk-in seat** (opens Walk-in with the session chosen); **Put somebody on the list** when full (opens Waitlist with the form ready) |
| **Walk-in** | either *An appointment* (a published timed service with a person, the free times on the viewed day from `computePublicSlots`, the same generator the public `/book` page uses) or *A seat in a session* (a session with seats left, its tier when the night has more than one) plus name / email / phone | **Book it**, then **Collect $x in cash** through the Counter's charge (`posCollectionKey`, `expectedVersion`), then **Book another** |
| **Waitlist** | every session on the day that is full or has a queue, its entries in the Waitlist view's order with position and state | **Offer the place** (`promoteFromWaitlist`), **They took it** (`acceptWaitlistPlace`), **Add to the list** (`joinSessionWaitlist`) |

The day is decided against the venue's zone (`resolveTenantTimezone`, the same
rung the Appointments board uses), printed in the header
("on the venue's clock (America/Mexico_City)"), and paged with Previous day /
Next day / Back to today (`?day=<n>`, clamped to 14 either way). Every time on
the screen is formatted in that zone with the request's locale, never the
browser's.

Every refusal reaches the person as a sentence in en/es/fr:
`lib/pos/classes/refusals.ts` maps every word the mode's own commands can
return (`Record<Reason, Key>`, total, so a new engine reason is a compile
error); the reschedule and waitlist actions keep the Appointments page's own
proven sentences; the seat walk-in and every cash collection use the Counter's
`refusalFromResult`. `classes-copy.static.test.ts` walks the whole copy bag in
all three languages and fails on any hole.

## Where it was proven, honestly

**Not on the deployed QA host.** This branch is not pushed (the brief says do
not push), so `staging-qa-journeys.tulala.digital` cannot carry this commit. The
journey ran on a **local dev server of THIS worktree against the SAME QA
database**, the way pos-floor, prove-counter and prove-people-projects did:

- `npm run dev` on `:3140` with `.env.capacity-isolated.local` exported and
  `TULALA_ALLOW_DEV_SURFACES=1`, behind `scripts/local-host-proxy.mjs 3141
  qa-journeys.local 3140`, so the app sees the registered tenant host and the
  browser stays on `http://localhost:3141`. Dev-server lease
  `pos-classes proof: dev :3140 + proxy :3141` (granted for this worktree by the
  previous run of this task; servers stopped at the end of this run).
- `PLAYWRIGHT_BASE_URL=http://localhost:3141 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 npx playwright test e2e/journeys/pos-classes.spec.ts --project=chromium --workers=1 --reporter=line --trace=on`
- Same real browser (claiming `Asia/Tokyo`, so a venue-clock defect would show),
  same fixture sign-in (`/api/dev/signin` as the fixture owner), same rows.
  What is NOT proven: that the Vercel deployment of this commit behaves the same.

`journeys-run9.log` is the final run: **6 passed, exit 0** (5.9 min). Traces
for each test under `traces/`, screenshots under `screenshots/`, the rows the
run wrote under `sql/10-after-journey.json` (read with `sql/read-rows.mjs`
copied under `web/scripts/` so `@supabase/supabase-js` resolves, stamp
`1789073463089`).

## What was resumed

The killed run left 24 uncommitted files: the reader (`lib/pos/classes/day.ts`),
check-in (`checkin.ts`), the refusal map, the walk-in reads and write
(`walkin.ts`), the extraction of the public page's purchase composition into
`lib/scheduling/instant-purchase.ts` (so the till and the website book the
same appointment through one function), the route branch, the client and its
four panels, the copy module, the catalogue in three languages, four unit tests
enrolled in `test:money`, the journey spec, and two engine corrections (the
tiered-night pool key in `hold-capacity.ts`; `already_marked` / `not_valid`
carried through `markAttendance` instead of folded into "unavailable").
**None of it had been run.** The unit tests passed first time (17/17); the
journey did not, and the run found:

1. **The label.** The decision is "Front desk" (es Recepción, fr Accueil); the
   previous run said "Classes" / "Appointments and classes" everywhere. Now the
   switch (`dashboard.pos.counter.mode.classes`), the settings card
   (`dashboard.adminWorkspace.posModes.modes.classes`), the screen title and
   the rail's name say Front desk; `POS_MODE_META.classes.label` matches. The
   mode id stays `classes`. Only this mode's entries were touched.
2. **A finished walk-in stayed on the screen.** After a seat was sold and paid,
   coming back to Walk-in through the rail (or from a session's "Book a walk-in
   seat") showed the last customer's "Paid. $5.00 collected" and a "Book
   another" button instead of a form. Run 3 failed on it. Now a SETTLED walk-in
   (collected, or nothing to collect) is cleared the moment the operator leaves
   the screen; a walk-in that is booked but not yet collected is kept, so the
   collect button cannot vanish under a stray tap on the rail.
3. **A seat sold on a name alone lost the name.** The Counter names a buyer only
   through an email or a phone (`customers` is keyed on those; a name alone is
   an anonymous sale by design), so a walk-in who gave only a name appeared on
   the roster as "No contact on this booking" and the instructor could not call
   it. Now, after the seat's cash is collected, `classesNameSeatHolders` writes
   the typed name onto the admissions the paid order minted where
   `holder_name` is empty (idempotent; nothing else changes). The roster's
   fallback for a nameless ticket is its own sentence ("No name on this
   ticket"), not the appointments board's. Proven: `sql/10-after-journey.json`,
   both admissions carry `holder_name`; `screenshots/15-*`.
4. **The walk-in form's contact leaked into other collections.** `collectCash`
   sent the walk-in form's name/email/phone with EVERY cash collection,
   including "Collect $x" on a Today row for a booking made elsewhere. Now only
   the walk-in's own collection carries the form's contact.
5. **The spec read a column that does not exist** (`booking_transactions.paid_via`);
   how the money arrived is `metadata.paid_via`, read the way the Counter's own
   proof reads it.
6. **The spec assumed today had free times.** The fixture person's day fills as
   this story is re-run (every run books two walk-ins that stay booked), so the
   appointment story now runs on the first day from today with at least two
   free times, read from the till's own slot list, and the move targets the last
   free time of the NEXT day, also read from the till (run 4 was refused by the
   engine, correctly, because the guessed "tomorrow, same time" had been taken
   by run 3's move). `data-pos-classes-slot={iso}` was added to the slot
   buttons so a test can read the instant, not only the clock.
7. **The settings page is sectioned**: the mode switches live behind the
   "Point of sale" section button (the spec now opens it, as the floor spec does).
8. Both merges from `program/journeys-2026-09` conflicted on the route, the
   catalogue, `package.json` and `hold-capacity.ts`; the door builder had fixed
   the same tiered-pool defect independently (`tierKeyForLine`), so theirs was
   taken whole and this branch's copy dropped. Both unit tests for it pass.

## What was proven, with evidence

All screenshots under `screenshots/`, rows in `sql/10-after-journey.json`.
Times are UTC on 2026-09-10; the venue is America/Mexico_City (UTC-6); the
appointment story ran on venue day +1 (Fri Sep 11) because Thursday's free
times were used up by earlier runs (see 6 above), the class story on today.

### 1. The door: Settings → the switch → the rail
`00-settings-front-desk-on.png`: Settings › Point of sale › Front desk toggled
on; `agencies.settings.pos.locations.default.modes` contains `classes`
(`sql/10-after-journey.json` › `agency`). From `/admin`, the top bar's
"Workspace | Counter ▾" group, its menu, the **Front desk** row → URL carries
`mode=classes`, no `[data-tulala-app-sidebar]`, the rail shows Today · Sessions ·
Walk-in · Waitlist, the header carries `data-pos-classes-zone="America/Mexico_City"`
(`01-front-desk-today.png`).

### 2. A walk-in onto a free time, cash collected through the Counter
Walk-in › An appointment › Gel manicure ($50, deposit service, pay in person
allowed) › first free time › name + email › **Book it** → "Booked for Fri, 11
Sep, 10:15." (`02-walkin-booked.png`). Rows: `agency_bookings` row with
`contact_name = walkin-<stamp>`, `orders` `pending_payment` 5000, `source_channel
= pos`, `source_page = pos-classes`, no paid transaction yet, the person's
`talent_holds` row keyed `order:<id>:reserve` with `expires_at = null` (pay in
person commits the time before the money, F2 of prove-appointments). Then
**Collect $50.00 in cash** → "Paid. $50.00 collected in cash."
(`03-walkin-paid-cash.png`). Rows: order `paid`, one `booking_transactions`
row `paid` 5000 `provider = manual`, `metadata.paid_via = cash`,
`tendered_cents = 5000`. Today lists the row, Confirmed, no "to collect".

### 3. Check in; a stale desk is refused in words
Desk 2 opens the day and taps **Check in** → "walkin-<stamp>: Arrived", the
state chip reads Arrived, `agency_bookings.status = in_progress`,
`updated_by_staff_id` = the fixture owner (`04-checked-in.png`). Desk 1, which
opened the day earlier and still shows Confirmed, taps Check in → **"This
booking changed since you opened it. Reload the day and try again."**; the row
stays `in_progress` (`05-checkin-stale-refused.png`). The refusal is the
conditional write (`.eq("status", stored)` matched no row), not a read.

### 4. Move it: refused naming who is busy; then moved, person and booking together
A second walk-in (`walkin-two`) takes another free time with the same person
(it stays `pending_payment`, never collected: the story only needed the time).
Move it on the first booking onto the second's time → **"QA Journeys Talent is
already booked at that time. Pick another time, or another person."**, nothing
moved (`06-move-refused-person-busy.png`). Then onto the last free time of the
next day, read from the till's own list → "Moved to Sat, 12 Sep, 15:45." and
the row leaves the day (`07-moved.png`). Rows: `agency_bookings.starts_at` =
2026-09-12T21:45Z and the order's `talent_holds` row at the same instant, no
expiry.

### 5. A class night, a walk-in seat for cash, attendance marked
Events page: new event `POS class <stamp>`, one $5 tier "Seat", Publish.
Appointments › Sessions and series › Schedule a night (that event, later today,
2 seats). Front desk › Sessions: the night, **0 of 2 seats taken**, "Nobody
holds a place in this session yet." (`08-sessions-night-0-of-2.png`). **Book a
walk-in seat** on the card → Walk-in with the session chosen → name + email →
Book it → "Seat held in POS class <stamp>." → **Collect $5.00 in cash** →
"Paid." (`09-seat-paid-cash.png`). Rows: one `admissions` row for the session,
`status valid`, `admitted_count 0`, its `allocation_id` a `capacity_allocations`
row `committed` on the night's `seat` pool; the order `paid` 500, transaction
`paid_via cash`. Sessions: **1 of 2 seats taken**, the roster names the
walk-in, **Mark present** → the row reads Present, `data-pos-classes-admitted="1"`
(`10-attendance-marked.png`); `admissions.admitted_count = 1`, `seated_at` set.

### 6. Full, the queue, refused while full, a seat opened, offered and taken
A second seat (name only, no email) is sold and paid the same way; the card
reads **2 of 2 seats taken · Full** and its action is **Put somebody on the
list** → the Waitlist screen with the form ready; "Ana Espera <stamp>" → **Add
to the list** → "Ana Espera <stamp> is on the list." (`11-waitlist-joined.png`).
Walk-in › A seat in a session no longer offers the full night at all
(`12-walkin-full-night-not-offered.png`). Waitlist › **Offer the place** →
**"There is no free place right now. Everything left is already promised."**
(`13-promote-refused-full.png`). Events › the night › Sessions › Seats for Seat
2 → 3 → Save (`capacity_pools.units_total = 3`). Waitlist › Offer the place →
"Offered to Ana Espera <stamp>, held until …", state `offered`
(`14-promoted.png`); **They took it** → state `accepted`,
`session_waitlist_entries.accepted_allocation_id` names a `committed`
allocation with no order line. Sessions: **3 of 3 seats taken · Full**; the
roster lists seat-one (Present), seat-two by the name typed at the till, and
Ana "From the waitlist. Took a place from the list. The seat is held; there is
no ticket to mark yet." (`15-roster-with-waitlist-place.png`).

## Guards (the rule broken, the test that goes red)

- `lib/pos/classes/checkin.test.ts`: the verdict table; a check-in writes
  `in_progress` under the status the operator saw, tenant-scoped; a colleague
  between the read and the write turns the tap into `changed_since_opened`; a
  cancelled booking is refused before any write; a missing one is `not_found`.
- `lib/pos/classes/day.test.ts`: the venue day window is the venue's midnight
  (not UTC's); seats sum across tiers and one unreadable tier poisons the sum
  (never a smaller number that looks complete); arrival order by start then id;
  the day offset is clamped; the reader keeps only the day's rows, money by the
  Counter's rule, names an unnamed counter ticket through its order, offers a
  tier only when the session has that pool, and puts an accepted queue place on
  the roster; an unreadable seat count is said, never rendered as zero.
- `lib/pos/classes/refusals.test.ts`: every reason the mode can map has a
  sentence in en, es and fr; an unknown word never falls through to a wrong
  sentence.
- `components/admin/pos/classes-copy.static.test.ts`: every sentence the mode
  can show resolves in all three languages, no em dashes, and the rail labels
  cover exactly the mode's destinations while `built` is true.
- `lib/sessions/attendance.test.ts` (+2): a second mark is `already_marked`,
  a refunded place is `not_valid`, neither is an outage.
- `lib/pos/hold-capacity.test.ts` (+1 from this branch, +1 from door): a tiered
  night holds the tier's pool, not a "default" that does not exist.

## Commands and exit codes

Run from `web/` in this worktree with
`TSC_QUEUE_LOCK=/tmp/tulala-tsc.pos-classes.lock TSC_QUEUE_TICKETS=/tmp/tulala-tsc.pos-classes.tickets`,
one at a time, never beside a browser run.

| Command | Exit | Note |
|---|---|---|
| `npx tsx --test` on the six classes/attendance/hold-capacity/modes/page-wire files | 0 | 52 pass (after the second merge) |
| `npx playwright test e2e/journeys/pos-classes.spec.ts …` run 1 | 1 | settings switch behind the section button (spec) |
| run 2 | 1 | `paid_via` column (spec) |
| run 3 | 1 | 5 passed; finished walk-in stayed on screen (mode defect 2) |
| run 4 | 1 | 3 passed; move target taken by run 3 (spec, 6) |
| run 5 | 1 | 1 passed; today out of free times (spec, 6) |
| run 6 | 1 | 4 passed; event option not yet listed on the schedule form (spec waits and reopens) |
| run 7 | 0 | 6 passed |
| run 8 | 1 | 0 passed: the dev server restarted itself ("approaching the used memory threshold") during sign-in; machine swap free 910 MB |
| run 9 | 0 | **6 passed (5.9 min), the evidence run** |
| `npm run test:money` | 0 | 975 tests, 974 pass, 0 fail, 1 pre-existing observational SKIP in `inquiry-engine-lifecycle.test.ts` |
| `npm run typecheck` (1st) | 2 | three errors in `instant-purchase.ts`: the extraction had dropped the original's casts and `tenantScopedQuery` rows are untyped; replaced with `isRecord` guards (no casts) |
| `npm run typecheck` (2nd) | 0 | TSC PASS |
| `npm run lint` | 0 | quiet |

The typecheck ran twice, not once: the first was red on a file the previous run
had written and never compiled. Nothing else ran beside either.

## Decisions taken

- **The Counter's charge, not a second one.** Every peso taken here is
  `posStartCollection` with `posCollectionKey` and the sale's `expectedVersion`:
  same allocation, same shift, same receipt, same refusals. The walk-in
  appointment is held `pending_payment` (pay in person) and collected as cash;
  a free service settles on creation and shows "Nothing to collect".
- **The website's booking, not a second one.** The public `/book` action's
  composition (stock pool, treatment room, companions, the person's slot,
  the payment intent the offering allows) moved to `lib/scheduling/instant-purchase.ts`
  and both callers use it. Behaviour of the public action is unchanged.
- **Check-in is the booking's own `in_progress`**, the same transition the peek
  panel makes, made conditional on the state the operator saw. No new column.
- **A seat sold on a name alone keeps the name on the ticket** (`admissions.holder_name`),
  written after the Counter's collection; the Counter's own "a name is not a
  customer" rule is left as it is.
- **Reschedule and the waitlist are the Appointments page's proven actions**,
  called directly from the client with the same sentences the board uses.
- The till pages days (±14) rather than showing only today: a front desk books
  tomorrow's walk-in too, and the proof itself needed it.

## Not done, and known

1. **On the Vercel deployment.** Local dev server of this commit, same database.
2. **The top-bar switch's label reads the device's remembered mode, not the
   mode on screen** (`PosModeSwitch.tsx`, shared): opening `?mode=classes` from
   a link shows "Counter ▾" in the bar until a mode is chosen from the menu
   (`15-roster-with-waitlist-place.png`, top right). Not this mode's file; not
   changed. The same is true for Tables and Door.
3. **Multi-tier nights**: seats are summed across tiers and a tier is offered
   only when tonight has its pool; the Waitlist RPCs still use the first pool
   (prove-appointments item 2). The proof used a one-tier night.
4. **Walk-in appointment slots are the person's booking hours in the person's
   zone**, narrowed to the venue day; a person whose hours are in another zone
   gets that zone's times filtered to the venue's calendar day, which is what
   the public page does too.
5. **The Events page prints "sold: unknown"** beside the night
   (`capacity_pool_committed_peak` 42501 on the isolated branch, prove-appointments item 10).
6. `walkin-two` from every run stays `pending_payment` on the fixture person's
   calendar, as do both walk-ins; the fixture's Gel manicure days fill up by two
   slots per run. Nothing here deletes rows.
7. The dev server restarted itself once for memory during run 8 (not the
   application); the sibling proof was running its own server beside it.
