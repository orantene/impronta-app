# Appointments — next plan (items 1–5)

**Owner:** Appointments Manager · **Reports to:** Platform Features Director
**Date:** 2026-09-02 · **Status:** proposed, awaiting Director sign-off

The appointments engine (PRs #1411–#1454) stays as built. Under "Sell the Room"
it is the **capacity-one special case** of the incoming Capacity engine: the
policy layer (surface gates, terminology, plan ceilings) is reused by every
feature, the subject model is not. Persons keep the `talent_holds` gist
exclusion until Phase 5, when they become pools of one.

Contracts I hold to, unchanged:
- **LABOR / CHANNEL / CONTRACT** — nobody can force a person to be bookable.
- **`talent_booking_hours` stays one row per subject.** Never fork hours per tenant.
- **Slots are computed, never stored.** Sessions are stored because they own
  allocations. The two must not blur.
- **Terminology is a workspace setting** and must reach every public button.

---

## Verified state (2026-09-02, against live DB and origin/main)

| Claim | Evidence |
|---|---|
| `talent_holds` has the gist exclusion | `talent_holds_firm_no_overlap` EXCLUDE USING gist, `WHERE hold_strength='firm'` |
| `talent_bookings` has **no** overlap constraint | zero rows of contype x/u on that table |
| Reservation hold TTL is hardcoded | `RESERVATION_HOLD_TTL_MS = 48 * 60 * 60 * 1000` (reservation-hold.ts:13) |
| Staff holds hardcode 14d/30d | `DEFAULT_EXPIRY_DAYS: Record<HoldStrength, number>` (hold-actions.ts:60) |
| Instant path hardcodes pay-in-person | `payInPerson: true` (BookableComposer.tsx:124) |
| Confirm does **not** convert | `confirmReservationTimeAction` writes cards + emits + revalidates, then returns; no convert, no enrichment |
| Production usage | 0 tenants enabled, 0 hours rows, 0 holds |

---

## Item 4b is a live product defect, and it leads

A client sent a proposed time taps **Confirm**. The action inserts a
"confirmed" card, emits `RESERVATION_CONFIRMED`, revalidates, returns ok. It
does **not** convert the inquiry, does not stamp `agency_bookings`, does not
write the `talent_bookings` mirror, and does not promote the hold.

Consequence: both parties see "Time confirmed." Forty-eight hours later the
hold TTL expires, the reaper deletes it, and the slot silently reopens to the
public picker. Nobody is told. There is no booking to find.

That is worse than a missing feature, because the UI asserts success. It is
sequenced first below.

---

## Sequence and exit proofs

### A1 — Confirm actually converts (item 4b) · no dependencies
`confirmReservationTimeAction` runs the same post-commit path the staff Accept
route uses: convert → `enrichBookingFromReservation` (stamps
`starts_at/ends_at/timezone`, inserts the `talent_bookings` mirror, deletes the
hold), idempotent by inquiry id, registered with retry-failed-engine-effects.

**Director decision needed:** should a client's confirm convert *directly*, or
move the inquiry to `approved` and require staff acceptance? I recommend
**direct convert when the workspace's mode is instant, staff acceptance when it
is request** — the mode already encodes who is allowed to commit, and reusing it
avoids inventing a second policy. Flagged rather than assumed.

**Exit proof:** confirm a proposed time; assert an `agency_bookings` row with
non-null `starts_at`, a `talent_bookings` mirror row, zero remaining holds for
that inquiry, and the slot absent from `/api/public/booking/slots`. Same
assertions as `qa:appointments --seed` already makes for the staff path.

### A2 — Overlap constraint on `talent_bookings` (item 2) · coordinate with Capacity
Two confirmed bookings on one subject at the same time are writable today; only
holds are serialised. Add the gist exclusion mirroring the holds one, scoped to
live statuses (`confirmed`, `completed`), so cancellations do not block reuse.

**Coordination:** the Capacity Engine Manager is adding hold TTL per pool in the
same area. One migration, agreed between us, sorted after the newest file, with
`db:push` before merge. I will not land this unilaterally.

**Risk to check before writing it:** production has 2 rows in `agency_bookings`
and 0 in `talent_bookings`, so there is nothing to backfill — but the constraint
must be validated against existing rows or it fails on creation. Verify first.

**Exit proof:** inserting a second overlapping confirmed booking for one subject
raises SQLSTATE 23P01; a cancelled booking does not block a new one at the same
time; `qa:appointments --seed` still passes.

### A3 — Configurable hold TTLs (item 3) · after A2's migration lands
Reservation TTL (48h) and staff hold defaults (14d soft / 30d firm) read a
configured value. Resolution order follows the existing appointment-policy
resolver: platform default → `agencies.settings.appointments.defaults` →
per-offering. No new resolver.

**Constraint:** the reaper and the exclusion constraint must stay consistent —
a TTL longer than the reaper's reach is a slot held forever. The reaper runs
every 5 minutes, so any positive TTL is safe; a null/never TTL is not, and is
refused.

**Exit proof:** a workspace setting a 2h TTL gets holds that expire in 2h;
policy tests cover platform/tenant/offering precedence; refusing a null TTL is
tested.

### A4 — Instant path stops hardcoding pay-in-person (item 4a)
`BookableComposer` sends `payInPerson: true` unconditionally. It must read the
offering's `reserve_mode` / `allow_pay_in_person`, exactly as the storefront
`OfferingInstantMount` already does, so a deposit or prepay offering is not
silently downgraded to pay-later.

**Exit proof:** an offering with `reserve_mode='deposit'` booked through the
SlotPicker produces a deposit checkout, not a free reservation; `free` +
`allow_pay_in_person` is unchanged; characterization test pins today's behavior
for the free case before the change.

### A5 — Venue timezone, one read path (item 1) · with Spaces & Seating S1
Timezone lives in five places today (workspace settings JSON, hours row,
inquiry, booking, reservation stamp) and defaults to UTC. The policy resolver
reads the venue timezone through the Spaces & Seating Manager's helper; the
five copies collapse to one read path; reminders fire in venue-local time.

**Dependency:** their S1 helper must exist first. I consume it; I do not define
venues. **Open question for them:** what does the helper return for a workspace
with no venue row — null (and I keep the current fallback chain) or an
auto-created default venue in UTC? I need that answer before I touch the
resolver.

**Exit proof:** a venue in `America/Cancun` yields slots at local 09:00, not
09:00 UTC; DST boundary cases pass; the reminder cron sends at venue-local time;
grep shows one read path for timezone in the scheduling package.

### A6 — House-owned timed offerings on `/book` and the Sheet (item 5) · with Front Door
A salon books chairs and staff without a talent profile per chair. I own
`load-book-page-offerings.ts` and the slot library; the Front Door Manager owns
the page and the Sheet.

**Boundary I propose:** I expose `resolveTalentBookingMode` and a
capacity-aware slot read that accepts a subject which may be a resource profile
or (later) a pool; they render and submit. **I give them the terminology read
path** (`lib/scheduling/terminology.ts` resolved via `resolveAppointmentPolicy`)
so the workspace noun reaches every public button — that is their item, my
export.

**Exit proof:** a house offering owned by a workspace with a resource subject
appears on `/book` and in the Sheet, books, and produces the same
booking/mirror/hold-release as a talent offering.

---

## Phase 5 (not now, recorded so it is not lost)
Persons onto capacity pools; chairs and rooms become spaces from the Spaces
tree; multi-staff pooling ("any available barber"); recurring appointments;
calendar sync and a real ICS feed — `ICalSubscribeCard` currently points at a
route that does not exist.

---

## QA report — what I could and could not click

Asked to click the screens. Here is exactly what happened.

**Proven in production earlier (engine level, real rows, cleaned up after):**
slots API returns real times; a firm hold removes exactly its slot; an
overlapping firm hold is refused with SQLSTATE 23P01; a 2-hour
`talent_bookings` row removes exactly its four slots (one calendar is real).

**Proven on localhost today:** with appointments enabled, hours seeded and the
offering published, `/api/public/booking/slots` through the agency host
(`impronta.lvh.me` via the documented host proxy) returned **6 slots**,
09:00–11:30 UTC, 30-minute steps.

**NOT clicked, and why — this is an environment finding, not a pass:**
- `/t/[profileCode]` takes **more than five minutes** to compile in Turbopack
  dev (repeated filesystem-cache flushes of 12s, 114s, 30s, 44s). `/book`
  returned 408 after 200s. This effectively blocks local screen QA of the exact
  surfaces that most need clicking.
- The in-app browser pane is hidden, which backgrounds the tab
  (`document.hidden === true`, `readyState` stuck at `loading`), so React never
  hydrates and there are no buttons to click. Documented artifact; it applies
  here.
- Therefore: the guest SlotPicker, Propose-a-time, and client Confirm/Decline
  were **not clicked by a human**. I will not claim otherwise.

**Two findings from the attempt:**
1. **A silent gate.** Every appointments switch can be on — tenant enabled,
   talent opted in, roster `direct_booking_enabled` true, offering published and
   bookable — and the talent is still unbookable if the roster row's
   `agency_visibility` is `roster_only`. The API answers `200 {"slots":[]}` with
   no timezone and no reason. That cost me the first half of this QA. Flipping
   only that field produced 6 slots. **An operator has no way to discover this.**
   Proposed fix (small, in my scope): the admin appointments surface shows a
   readiness line naming the first failing gate.
2. `/api/public/booking/slots` returns `404 not_found` on the app host for an
   agency-owned offering. Correct — the tenant check is doing its job — but it
   means any local QA must go through the host proxy, which is worth stating in
   the QA doc rather than rediscovering.
