# Appointments & Classes

Source: `docs/plans/program/pos/`  -  screen-index.md, actions.md, modes.md, decisions.md, coverage-matrix.md, coverage-final.md, people-model.md. Data verified against `supabase/migrations/*.sql` and `web/src/lib/*` in this worktree on 2026-09-09.

## 1. The journey

A front desk person, an instructor, or a customer themselves books a person's time or a spot in a class, and later something happens with that booking: the customer shows up and it is fulfilled, a balance is collected, or the plan changes (rescheduled, cancelled, added to, or a class place is released to someone waiting). The front desk person is trying to get a booking that actually fits everyone's calendar (rooms, staff, equipment) confirmed in one atomic step, take a deposit if the business requires one, and later either check the person in or collect what they owe. The instructor is trying to see who is coming to a session and mark them present. The customer is trying to book, or manage, an appointment or a class place without calling anyone.

## 2. Screens in this slice

1. **A01** Booking · services  -  choose the service(s) and extras. Next action: continue to people & place.
2. **A02** Booking · people & place  -  choose the professional and the room/resource. Next action: continue to time.
3. **A03** Booking · time  -  pick a slot; unavailable times show a reason. Next action: continue to details.
4. **A04** Booking · details & intake  -  customer info, intake form answers. Next action: continue to review.
5. **A05** Booking · review & deposit  -  total, policy, deposit. Next action: Confirm (reserves atomically).
6. **A06** Booked · destinations  -  confirmation, links to what was created. Next action: go to the booking or start another.
7. **A07** Customer manage booking  -  the customer's own view of an existing booking. Next action: reschedule or cancel.
8. **A08** Professional's day  -  the assigned person's schedule for today. Next action: open an assignment.
9. **A09** Reschedule · original kept  -  pick a new time without discarding the original booking's history. Next action: confirm the new time.
10. **A10** Cancel booking · effects  -  shows what cancelling releases and what it does not. Next action: confirm cancellation.
11. **B01** Bookings · appointment  -  the front-desk view of one appointment on the day. Next action: Collect, or open B02.
12. **B02** Add extra · time rechecked  -  add a service to an existing appointment; availability is re-checked before committing. Next action: save the extra.
13. **B03** After linking a sale  -  a sale (e.g. retail add-on) is now attached to the booking's balance. Next action: return to the booking or pay.
14. **B04** Walk-in booking  -  book someone who is already at the counter, no prior appointment. Next action: confirm.
15. **B05** Class check-in · full  -  mark a class participant present; session is at capacity. Next action: check in the next arrival.
16. **B06** Class · place released  -  a place freed by a cancellation goes to the next person on the waitlist. Next action: send/confirm the offer.
17. **K01** Class enrollment  -  join a specific session. Next action: pay and confirm.
18. **K02** Waitlist join  -  session is full; join the waitlist instead. Next action: join waitlist.
19. **K03** Buy a pass  -  purchase a block of credits. Next action: pay.
20. **K04** Pass wallet (mobile)  -  customer's own view of remaining credits. Next action: book a class with a credit.
21. **K05** Cancel · credit restored  -  cancelling a class booking made from a pass credit returns the credit. Next action: acknowledge, book again.
22. **K06** Course vs drop-in vs membership  -  the customer chooses which arrangement to buy under. Next action: pick one and continue.
23. **K07** Waitlist offer (customer)  -  the customer's own view of an offered released place, with an expiry. Next action: accept before it expires.

Related, outside this slice but feeding it: **W10** generate sessions from a series, **W39** Sessions list, **W40** Series list, **W11**/**W28**/**W30** the Bookable hat that supplies "who can be booked", **MW13–MW16** the mobile agenda flow, **MW28** mobile appointment completion, **MW29** mobile field job entry from an assignment.

## 3. Data per screen

All tables verified present in `supabase/migrations/`. Money on `orders`/`order_lines` is integer cents; money on `inquiry_offers`/`booking_talent` is NUMERIC major units  -  these are two different money representations that are not yet unified (see money.md).

- **A01–A05 (new booking build)**: reads `talent_offerings` (service, price_type, duration_minutes, booking_mode) and its variants/add-ons; `talent_booking_hours` + `talent_availability_blocks` (slot search, via `lib/scheduling/public-slots.ts`); `spaces` (room/resource, if the service needs one) and `capacity_pools`/`capacity_allocations` (holds). On confirm: writes `agency_bookings` (booking header: `inquiry_id`, `talent_profile_id`, `status`, `starts_at`, `ends_at`), `booking_talent` (per-professional cost/charge rows, if more than one professional), `talent_holds` (the calendar hold, `hold_strength`, `expires_at`), and a deposit through the shared payment state (see money.md) landing on an `orders`/`order_lines` row or `inquiry_offers` depending on path  -  **unverified which path a POS-originated appointment deposit uses**; would verify by reading `lib/scheduling/reservation-hold.ts` / `reservation-convert.ts` against a live `reserve_resource_set` call.
- **A06 destinations**: reads back the `agency_bookings` row plus whatever the deposit created.
- **A07 customer manage**: reads `agency_bookings` by id, scoped to the signed-in or guest-session customer.
- **A08 professional's day**: reads `agency_bookings`/`booking_talent` filtered to the signed-in professional's `talent_profile_id`, ordered by `starts_at`.
- **A09 reschedule**: updates `agency_bookings.starts_at/ends_at` and the linked `talent_holds`; the design's "original kept" language implies a history record  -  `talent_profile_field_value_history`-style history exists for profile fields, but **no equivalent booking-change history table was found**; the "original kept" claim in the design is not yet backed by a table. Not in the database yet: a booking change log.
- **A10 cancel**: updates `agency_bookings.status = 'cancelled'`, releases `talent_holds` and any `capacity_allocations` (state → `released`).
- **B01–B04**: same `agency_bookings`/`booking_talent` tables, filtered to "today". B02 add extra re-runs the same availability check as A03 before writing a new `booking_talent`/order line. B03 reads the order created by "Link a booking" (`orders.customer_id`, linked via the booking's receivable  -  see money.md's Link action).
- **B05 check-in**: session participants come from `admissions` rows where `session_id` matches and `order_line_id` traces to the enrollment order line; check-in sets no `checked_in` column (there isn't one  -  arrival is deliberately not a status on `admissions`, per that table's own header)  -  **check-in is expected to be recorded elsewhere, unverified where**; would verify by reading `lib/sessions/door.ts` / `door-actions.ts` for the actual write target.
- **B06 waitlist offer**: reads and writes a waitlist. **Not in the database yet.** No `waitlist` or equivalent table exists in `supabase/migrations/`. `sessions` has no seats-remaining column of its own; remaining capacity is computed from `capacity_pools`/`capacity_allocations` for `subject_kind = 'session_tier'`. A waitlist needs at minimum: an ordered list of (session_id, customer_id, joined_at), an offer with an expiry, and a released-place event. None of this exists. This blocks B06, K02, K07, and the "waiting list" row in modes.md's Tables mode (T08) equally.
- **K01 enroll / K03 buy pass / K05 cancel-restore**: `sessions` (the occurrence), `capacity_pools`/`capacity_allocations` (the reservation), `order_lines` (the purchase), `admissions` (the issued place). The `drawdown_lesson_package` RPC exists (`supabase/migrations/20261230000700_journeys_atomic_rpcs.sql`) and is the mechanism K03/K05/K04 depend on for a credit ledger, but coverage-matrix.md and decisions.md both say the credit entitlement itself has **no schema today** (task POS-5.2). So the RPC exists to draw down a balance that has nowhere to be stored yet  -  **not in the database yet**: a `pass`/`credit` or `entitlement` table recording how many credits a customer holds, purchased, consumed, restored, expired.
- **K04 wallet**: would read the same missing entitlement table. Not in the database yet.
- **K06 course/drop-in/membership chooser**: drop-in reads `sessions` directly; course is "enrollments ×4" per coverage-matrix.md, i.e. one `admissions`/order-line pair per date, with no single "course" record tying them together as one purchase  -  **unverified** whether that grouping is only conceptual (four separate purchases presented together) or whether a shared `order_id` across four `order_lines` already does the job; would verify by reading `lib/sessions` for a series-purchase helper. Membership has no schema (see money.md).

## 4. Refusals and empty states

- A03: a time with no available professional, room, or resource shows the reason inline rather than a generic "unavailable" (actions.md: "A03 times with reasons"). If any one resource in a multi-resource booking (e.g. two therapists and a room for a couples massage, case C02) is unavailable, A05 offers an alternative and Confirm never commits a partial booking  -  "any resource unavailable → alternative; no partial commit" (actions.md, row "Confirm booking · deposit").
- A03/A09: a booking that would leave a phase model unrepresented (colour processing keeping the chair while releasing the stylist, case C05) is out of scope until service segments (D-POS-2) exist  -  decisions.md marks this **Design pending**, and there is no schema for it either.
- B02 add extra: "conflict shows alternative"  -  the re-check can refuse the extra rather than silently double-book the same slot.
- B05 check-in: "double tap → one effect" (actions.md)  -  a second check-in of the same participant must not create a second attendance record; since there is no dedicated attendance table found, this refusal has nowhere proven to attach  -  flag alongside the check-in write-target question above.
- K01/K02: a full session offers the waitlist instead of a booking; the design's own words for this are "K02 waitlist" as the refusal branch of K01.
- K07 (customer waitlist offer): "expiry releases once"  -  the offer must be shown as expired, not silently vanish, once its window passes.
- A10 cancel: shows what is released and what is not before the operator confirms  -  never a blind "Cancel" with no effects preview.
- General: modes.md's "Who does not start in POS" table means an assigned talent is never shown a collection control on A08 unless authorized (Field mode F05)  -  A08 must refuse to offer "Collect" to an unauthorized professional.

## 5. Definition of done

The one journey that must pass end to end on the QA host (`qa-journeys`, isolated Supabase branch): a front-desk operator books an appointment for a walk-in customer requiring two resources at once (a professional and a room, case C02's couples-massage shape) through A01→A05, sees both resources committed together in A06 with no partial hold left behind if either was unavailable, the assigned professional sees it on A08, and the operator collects the deposit through the shared payment state and reaches a paid receipt. Waitlist, pass/credit, and membership flows (B06, K02–K05, K06's membership branch) cannot ship in this pass  -  they depend on tables that do not exist yet, named above.
