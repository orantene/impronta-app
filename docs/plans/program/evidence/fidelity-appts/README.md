# fidelity-appts: Appointments & Classes, the workspace page and the Front desk, against the boards

Group: APPOINTMENTS & CLASSES. Workspace boards at 1440x900 (W39, W40, W10,
W11, Calendar, NewAppointment, A08, A09, A10) and POS boards at 1194x834
(B01 to B06, A01 to A07). Every `*.board.png` is the board's HTML rendered at
that viewport; every `*.live.png` is this branch on a local `next dev` (port
3160, proxied as the registered host `qa-journeys.local` on 3161, isolated
database `qa-journeys`), signed in through `/api/dev/signin` as the fixture
owner, at the same viewport, with the dev-only identity banner hidden so the
900px matches. The rail, top bar and POS rail are the shell group's and the
counter group's; this group skins what sits inside them.

Where the board's sample data says Casa Nube, Vale O. or $250, the live frame
says what the fixture workspace holds on 2026-09-11: the "Prove class" and
"POS class" nights other proofs scheduled, the two series this run seeded on
the isolated tenant so a series row exists to draw (`Pilates Reformer`,
Tue/Thu 11:30, 12 places, Studio A = the fixture's venue "QA Floor";
`Kids ballet`, Sat 12:00, with NO timezone, so the sweep refuses it), and the
26 dated sessions the engine's own nightly materialiser produced from them
when it was run once by hand against the local server
(`/api/cron/materialise-sessions`, `CRON_SECRET` set on this dev server
only). Nothing was written to production.

## Boards

| Board | Verdict | Live frame | What differs, and why |
|---|---|---|---|
| W39_SessionsList (the reference) | **matched** (structure, order, controls, copy; five controls disabled with their reason) | `W39_SessionsList.live.png` | Breadcrumb "Appointments & Classes › Sessions" (the shell's crumb now names the lit child); title + subtitle; Generate sessions / + New series (both disabled: no on-demand generator, no series writer, D-POS-18); tabs Appointments · N / Sessions · N / Series · N / Waitlist · N from the readers; Week / Day / List with arrows and the range; Location (the sessions' own venues) / Room / Instructor (disabled: not stored on a session) / Needs attention; the grouped-by-day table TIME · SESSION · ROOM · INSTRUCTOR · BOOKED / PLACES · STATE with the pills Scheduled / Full / Cancelled / Completed / Needs seats and a row menu that opens the panel; the sweep's refusals above the table (the board has no such block; a refused series is the commonest reason a class is missing and it is shown first). Right panel: places · booked · waiting, Equipment (not tracked, said), Enrolment closes (online at start time; waitlist offers hold 30 min, the engine's constant), Cancellation rule (none set, said), Attendance (check-in admits the ticket); PARTICIPANTS from the Front desk's roster reader plus the accepted waitlist places, +N more; CHANGE SCOPE with This session live and the two series scopes disabled; Substitute instructor / Move participant / Cancel session disabled, Change capacity WIRED (`setSessionPoolUnits`; a shrink below what is sold is refused by Capacity and the refusal names the floor); Open check-in on the POS opens the Front desk mode. Differs: the Week view is seven days from the viewed day rather than a calendar week (a night scheduled 26 h from now must stay in view); the one-off night form stays under the table (it is the only write; the classes journey schedules through it); INSTRUCTOR is always "—". |
| W40_SeriesList | **matched** | `W40_SeriesList.live.png` | SERIES · CADENCE · ROOM · INSTRUCTOR · CAPACITY · GENERATED THROUGH · STATE with Published / Paused / Needs attention and the sweep's own refusal sentence in the generated cell; the row menu opens the series' dated sessions on the Sessions tab; the two explainer cards with the "Used in" line (POS Front desk on/off is read from the workspace's modes). Templates / + New series are not wired (no series writer). The "Course vs drop-in" card says plainly that a course is not modelled yet. |
| W10_ClassesSchedule | **not wired** | `W10_ClassesSchedule.live.png` (the series' sessions, List view) | No series editor and no on-demand generator exist. The preview's "conflicts" column is the same `decideMaterialisation` the Sessions tab shows as refusals and skipped collisions; that is the live frame. |
| W11_RosterAvailability | **not wired** (People group) | `W11_RosterAvailability.live.png` (the People page as it is) | A person's Bookable hat (hours per location, breaks, eligible services, POS permissions) is the People model's drawer (W28), not built here; the appointments group only reads the hours (`computePublicSlots`). |
| Calendar | **partial** (unchanged) | `Calendar.live.png` | The Calendar destination as it is: month / agenda / day, holds and bookings. The resource timeline (people and rooms as rows, blocks by hour, hold expiry footer) is not built; out of this group's scope beyond the appointments bits. |
| NewAppointment | **partial** | `NewAppointment.live.png` | "New booking" on the Calendar opens the engine's booking drawer (the same one the Create menu opens). The board's service-first form with participants, add-ons, compatible times and the itinerary + deposit review is not built; the Front desk's Walk-in / Book sheet (B04) is the built booking flow. |
| A01_Service · A02_PeoplePlace · A03_Time · A04_Details · A05_ReviewDeposit | **partial** | one live frame, `POSWalkInBooking.live.png` copied to each | The five steps are one sheet in the engine (service, the person is the service's, the free times, the customer's details, pay = cash at the end or now). No multi-service basket, no chair/room, no deposit at booking on the till (the website's Stripe path takes deposits). |
| A06_Confirmed | **partial** | `A06_Confirmed.live.png` | After "Book it": the sentence with the booked time, Collect in cash, Book another. No confirmation destinations (message, calendar file) are sent from the till. |
| A07_CustomerManage | **not wired** | `A07_CustomerManage.live.png` (the public booking page) | No customer manage-my-booking page exists; the customer's only surfaces are the booking page and the receipt. |
| A08_TalentDay | **not wired** here | `A08_TalentDay.live.png` (the talent hub's calendar) | The professional's own day is the talent surface's calendar, not this group's. |
| A09_Reschedule | **matched** (the move) | `A09_Reschedule.live.png` | Appointments tab: Move it opens the move form in the panel (venue clock, the window the operator saw carried so a stale screen is refused, the refusal names who is busy or which room is full, a done move says where it went). |
| A10_Cancel | **not wired** | `A10_Cancel.live.png` | Cancel appointment is disabled with the reason on the panel; no cancel writer on this surface (the booking's own page owns its lifecycle). |
| POSAppointments (B01) | **matched** | `POSAppointments.live.png` | Header: Front desk (the mode's own label, D-POS-15), "Thu 10 Sep · N appointments · N classes", the location pill (the workspace's venue) and the signed-in operator; left list with Today / Due N / Done N and Appts \| Classes, rows TIME · name · service · state pill with the balance; right pane: name · time range, chips, BOOKED lines from the appointment's sale (`posLoadSale`), Add service / Product / Use a pass (disabled: no passes), totals card (Services, Paid so far, Balance due), WHO DID WHAT (disabled: a line is not attributed to a person), Check in, Collect $x (the Counter's cash charge), Send payment link (disabled: Counter mode), Move it. "+ Walk-in" and "Book" open the sheet. Differs: no "Deposit paid" chip (the till knows paid-so-far, not the deposit's date); the rail is the counter group's frame. |
| POSAddExtra (B02) | **partial** | `POSAddExtra.live.png` | The sheet lists the workspace's published catalog with price and minutes, New balance and Who; "Add X · +$y" writes the line on the appointment's own sale through `posAddLine` with the sale's version. Not wired: the time recheck ("Ends 13:35 · next client 14:00", "Dani is busy · Ana can do it") needs a calendar re-plan writer that does not exist; the sheet says the end time is not re-planned (D-POS-19). |
| POSAfterLink (B03) | **matched** (2026-09-11, wire-pos-money) | `POSAfterLink.live.png` | `Laura Méndez · 17:15–18:00` / `Gel manicure`, the `Sale #EECA linked for payment` chip, BOOKED (the appointment's own sale), then `LINKED FROM SALE #EECA · PAYMENT ONLY` with the counter sale's lines (`Linked payment` pill, `From sale #EECA`), the right card with `Sale #EECA (linked) $6.50` and `Balance due` = the appointment's balance plus the linked sale's. The link is made at the counter (`POSLinkBooking`, `posLinkBooking`) and read back through `order_lines.booking_id` (`readLinkedSales` in `lib/pos/classes/day.ts`). `Send payment link` is live on the appointment's own sale (`createPaymentLink`; `POSAppointment-link.live.png`). Differs: `Collect` collects the appointment's own sale; the linked sale is collected on the counter, so the board's one combined `Collect $1,740` is two collections here. |
| POSWalkInBooking (B04) | **matched** | `POSWalkInBooking.live.png` | Walk-in · book now: Service, Customer (name, email, phone), NEXT FREE (the free times from `computePublicSlots` with the person and the window), Pay (cash at the end or now), "Book {name} · {time}". A seat in a session is the same sheet's second kind. |
| POSClassCheckin (B05) | **matched** | `POSClassCheckin.live.png` | Title · time, "starts in N min" (server clock), the three chips, Find a name, All / Not here / Problems, the numbered roster with Here / Booked / Can't attend and Check in (the `check_in` RPC) / Undo (disabled) / Fix (disabled), facts (Places, Here, Waitlist, Positions not tracked), Scan a pass (disabled), Sell drop-in (or "· class is full"), Add to waitlist, Substitute instructor (disabled), the problem notice, Close check-in (disabled: no no-show state). Differs: no seat position column (nothing to show per row). |
| POSClassReleasedPlace (B06) | **matched** | `POSClassReleasedPlace.live.png` | When a selected session has a free place and somebody waiting, the dialog offers the place to the next in line (the proven `promoteFromWaitlist`, a 30-minute hold), to sell it as a drop-in (the walk-in seat), or to leave it. Differs: no refund-policy footnote (no cancellation rule is modelled). |

## Readers and writers behind the screens (nothing is mocked)

- Workspace page: `loadAppointments` (now also returns `todayYmd`, the
  server's today in the workspace's zone, so the Sessions view anchors its
  week without reading the browser's clock), `loadSchedule` (occurrences now
  carry `poolKey`, `poolCount` and the session's venue; a night with several
  tiers sums its pools), `loadSessionWaitlists`, `loadBookingHoursProposals`,
  `loadSessionParticipants` (new, `lib/sessions/roster-actions.ts`, on the
  Front desk's `readAdmissionsRoster`, extracted from `lib/pos/classes/day.ts`
  so both screens name a ticket the same way), `setSessionPoolUnits`,
  `rescheduleAppointment`.
- Front desk: `loadClassesDay`, `loadWalkInServices`, `loadClassesExtras`
  (new), `posLoadSale`, `posAddLine`, `posStartCollection`, `classesCheckIn`,
  `classesMarkAttendance`, `classesBookWalkIn`, `classesHoldSeat`,
  `promoteFromWaitlist`, `acceptWaitlistPlace`, `joinSessionWaitlist`.
- The rail's children light up on the destination's canonical alias path
  (`/admin/appts?view=...`) as they do on the live route (`/admin/sessions`),
  and the shell's breadcrumb reads "Page › Child" when a child is lit
  (`workspace-nav-groups.ts`, `IdentityBar-1.tsx`).

## Package 1 wiring (2026-09-11, wire-pos-money)

The Front desk's queue now offers a place with the engine's hold
(`waitlistOfferPlace`: a `waitlist_offers` row and a live capacity
allocation for the offer window), takes it with `waitlistAcceptOffer` and
gives it back with `Decline` (`waitlistDeclineOffer`), D-POS-76; the day
reader carries the live offer id per entry. `ClassesWaitlistOffer.live.png`
is the Waitlist screen with an offer standing (Decline beside They took it).
Every refusal is `dashboard.pos.engine.refusal.*` (`no_place` when the night
is full). The classes journey (`e2e/journeys/pos-classes.spec.ts`) asserts
the `waitlist_offers` row and its allocation, not only the entry's state.

## Not wired (each drawn disabled with a one-sentence reason in en/es/fr)

Workspace: Generate sessions; + New series; Room and Instructor filters;
Substitute instructor; Move participant; Cancel session; Future sessions /
Entire series scopes; Add a service and Cancel appointment on the appointment
panel; Equipment and Cancellation rule facts. Front desk: Use a pass; Who did
what; Send payment link; Rebook; Undo a check-in; Fix a ticket; Scan a pass;
Substitute instructor; Close check-in · mark no-shows; seat positions; the
time recheck when an extra is added. Recorded as D-POS-18 and D-POS-19 in
`docs/plans/program/pos/decisions.md`.

## Copy

Every new sentence is in `web/messages/{en,es,fr}.json` under
`dashboard.adminAppointments.board.*`, `dashboard.adminAppointments.tabs.*`,
`dashboard.adminAppointments.col.service`, and
`dashboard.pos.classes.board.*` (through `classes-copy.ts`, whose static
test walks the whole bag in the three languages). The French catalogue
gained the `dashboard.adminSessions.*` rows it never had (the page fell back
to English). Dead rows the old Schedule view read were deleted
(`adminSessions.title/subtitle/col/status/seatsLeft/noTimezone/noTenant`,
`adminSessions.nights.title/help`, `adminSessions.empty.title`,
`adminAppointments.subtitle`, `adminAppointments.col.action`,
`adminAppointments.action.cancelled/completed`).

## Playwright

- `e2e/journeys/classes-and-waitlist.spec.ts`: the seats cell reads the
  board's "booked / places" ("0 / 2", then "2 / 2") and the state pill
  reads "Scheduled" / "Full" instead of "2 of 2 left" / "On sale". Same
  facts, the board's words. **4 passed** against this branch's dev server
  (`fid-appts-pw-classes.log` in the scratchpad, 4.6 min).
- `e2e/journeys/pos-classes.spec.ts`: the Today screen is two panes, so the
  journey selects a row (`[data-pos-classes-appointment]`) and acts in the
  pane (`[data-pos-classes-detail]`); a class is opened the same way
  (`[data-pos-classes-session]` → `[data-pos-classes-checkin]`); the roster
  button is "Check in" (was "Mark present"), the seat sale is "Sell drop-in"
  (was "Book a walk-in seat"), the queue door is "Add to waitlist" (was "Put
  somebody on the list"); a rail row or a list row is clicked until its
  screen is shown, because the list is server-rendered and a click that
  lands before hydration is lost (the lesson the spec's settings step
  already records). Every assertion about rows, states, money and refusals
  is unchanged. **6 passed** (`runs/fid-appts-pw-pos8.txt`, 5.7 min); three
  earlier runs failed on exactly that pre-hydration click and on the Events
  page's own "Seats for Seat" box not being found in 30 s under load, not on
  a front-desk fact.
- `e2e/journeys/appointments-and-classes.spec.ts` could not run on the
  isolated database as it stands: its first step books "Massage" on the
  public `/book` page, and that page lists the first 24 published offerings
  by `sort_order`; the fixture tenant now has 36, and the 30-odd
  `sort_order = 0` rows other proofs created ("POS class …", "Prove class …",
  "Blowout …", "Door night …") push Massage (sort_order 20) off the page.
  This is a fixture-drift finding for whoever owns `/book`, not a change in
  this branch; the Appointments tab's own move was exercised by hand
  (`A09_Reschedule.live.png`) and its static guards
  (`appointments-surface.static.test.ts`) were updated to the new files
  with the same assertions.
- `src/lib/sessions/appointments-classes-model.test.ts` (new, sessions
  lane): the pill vocabulary, the venue-day filing of series sessions and
  one-off nights, the Week / Day / List window, the series row states.

## Gates (this branch, private lane, real exit codes; logs in the scratchpad's `fid-appts-gates/`)

| Gate | Exit |
|---|---|
| `TSC_QUEUE_LOCK=/tmp/tulala-tsc.fid-appts.lock TSC_QUEUE_TICKETS=/tmp/tulala-tsc.fid-appts.tickets npm run typecheck` | 0 (TSC PASS), re-run on the final tree: 0 |
| `npm run lint` | 0, re-run on the final tree: 0 |
| `npm run test:design-system` | 0 (96 pass) |
| `npm run test:tenant-isolation` | 0 (609 pass) |
| `npm run test:size-ratchet` | 0 (173 pass) |
| `npm run test:phase1-i18n` | 0 (20 pass) |
| `npm run test:sessions` | 0 (156 pass) |
| `npm run test:scheduling` | 0 (326 pass) |
| `npm run verify:server-actions` | 0 |
| `npm run verify:ui-messages` | 0 |
| `e2e/journeys/classes-and-waitlist.spec.ts` (local dev server, isolated database) | 0, 4 passed |
| `e2e/journeys/pos-classes.spec.ts` (same) | 0, 6 passed |
| `e2e/journeys/appointments-and-classes.spec.ts` | 1: the public `/book` step cannot find "Massage" (fixture drift, above); not a fact about this branch |

## Findings for other groups

- **`/book` lists 24 offerings by `sort_order` and the fixture has 36**:
  every proof that publishes an offering with `sort_order = 0` pushes the
  fixture's own services (Gel manicure 10, Massage 20, Couples massage 30)
  off the public page, and with them the appointments journey. Either the
  page should not cap at 24 or the proofs should retire their offerings.
- **A booking's money shell ("POS sale", no date) leads the Appointments
  list** because "No date agreed yet" is the first bucket. The board's
  reader already drops shells with no inquiry; the ones that remain are
  hand-opened bookings. Ordering is the appointments board's rule
  (`APPOINTMENT_BUCKET_ORDER`), left as it is.
- **The Front desk day is read in one round trip per session pool** and a
  day with ten proof classes renders in 6 to 20 s on `next dev`; a
  batched seats read would make the till usable on a busy day.
