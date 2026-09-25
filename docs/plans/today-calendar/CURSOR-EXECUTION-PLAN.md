# Today and Calendar, every trade: execution plan (mockup to live, 1:1)

Audience: the implementing agent (Cursor). Owner: Oran. Written 2026-09-24.
Goal: replace the talent dashboard's Today, Calendar, booking record and New booking with the approved design, working on real data, for every trade, with no invented numbers and no dead buttons.

---

## 0. Read this first

### 0.1 The spec

| Source | Where | Use it for |
|---|---|---|
| Prototype source (the spec) | `docs/plans/today-calendar/prototype/talent-studio-prototype.html` | Open in Chrome. The left rail lists every screen. Screen ids (`tc_*`, `tg_*`) are used throughout this plan. Photos may not load locally; layout and copy are what matter. |
| PDF of the same screens | `docs/plans/today-calendar/prototype/Tulala-Today-and-Calendar-every-trade.pdf` (120 pages, images only) | Visual 1:1 check at 1440, 390 and 360. |
| Reference pages inside the prototype | `tc_scenario`, `tc_vocab`, `tc_system`, `tc_ctas`, `tc_ctas2`, `tc_trades`, `tg_settings` | The rules. Read all seven before writing code. |

Neither file in `prototype/` is committed (the PDF is 11 MB). Keep them untracked, or add the folder to `.git/info/exclude`.

**The prototype is a picture, not code to port.** It is vanilla JS that renders HTML strings. Rebuild each screen with the product's own React primitives. Never copy its markup.

### 0.2 Non-negotiable rules (repo)

- Read `CLAUDE.md` and `web/docs/development-workflow.md`. Do one PR per task below, on a branch off the latest `origin/main`: `git fetch origin && git switch -c feat/tc-<task> origin/main`. Never commit to `main`.
- Gate before every commit: `cd web && npx tsc --noEmit && npm run lint`, plus the unit lanes you touched.
- Migrations must be additive. Take the version from `date -u +%Y%m%d%H%M%S`, run `npm run db:push` **before** merge, then `npm run db:check`. After merge, verify live: the pointer advanced, then `npm run deploy:smoke`.
- **Live QA writes nothing to real tenants.** Jor (`book-jorgelina`, talent profile `f048e578-…`) is the owner's live demo account. Her home page was wiped once today by an agent. Do not write to her rows. QA on a seeded local or isolated talent.
- User-facing copy has no em dashes. Every new string exists in EN and ES.
- Everything ships behind one flag until Phase 9: `TALENT_AGENDA_V2` (env, default off), with a per-talent override for the demo account. With the flag off, the old pages render unchanged.

### 0.3 The design in one paragraph

Every trade uses one set of screens: Today, Calendar, the booking record and New. Four facts are **never** merged into one badge:

1. **booking state:** requested, on hold, confirmed, completed, cancelled, no-show, hold expired
2. **payment state:** not requested, awaiting deposit, checking payment, due at the appointment, deposit paid · $X left, paid, overdue, refund pending, paid by the agency
3. **source:** my website, Tulala profile, WhatsApp · entered manually, agency
4. **responsibility:** mine, or managed by an agency

Requests never block time. Holds, confirmed work, agency jobs, blocks, buffers and travel do. A per-trade settings row decides six things: what is booked (slot, event or project), how long it lasts, what is needed first, the time around it, how money works, and the words. Every number on screen is computed from records, never typed. Every button has a destination, a working state, a success result, a failure result and a way back; `tc_ctas` and `tc_ctas2` list all of them.

---

## 1. What exists today (verified on origin/main, 2026-09-24)

UI (paths relative to `web/src/components/admin/shell/internal/`, written `I/` below):

- **Shell and routing.** Talent pages are client panels inside one shell. `app/(workspace)/talent/<segment>/page.tsx` only renders `TalentPageRouteSyncer`. Data loads once in `app/(workspace)/talent/layout.tsx:169` (`Promise.all`, including `loadTalentCalendarEntries`). `I/talent.tsx:246` `TalentRouter` switches on `state.talentPage`. Nav groups are at `I/talent.tsx:63-67`. The mobile tab bar is `I/page-modules/MobileBottomNav.tsx`.
- **Today.** `I/talent/pages/TodayPage.tsx` (707 lines) is built from conversations (with a mock fallback). Its "needs attention" is `NeedsReplySection`, which is conversations only. It stacks five onboarding and nudge surfaces.
- **Calendar.** `I/talent/pages/CalendarPage.tsx` (789 lines) uses custom views in `I/talent/shared/calendar-1.tsx`. **Day view is hard-coded to day 14** with morning, afternoon and evening buckets. The month grid, week view and list use three different data sources. **Clicking a month-grid event does nothing:** `talent-hub-detail` reads `channelId` but is sent `id`. Buffers, travel and working hours are not drawn.
- **Booking record.** None for talents. The closest is the Messages job thread (`I/messages/talent-2.tsx:195`). `TalentBookingDetailDrawer` is fixture-only. `TalentAddEventDrawer` saves nothing.
- **Primitives to reuse.** `I/primitives/buttons.tsx`, `chips.tsx` (`StateChip`, `PaymentStatusChip`), `drawer.tsx` (`DrawerShell`, `ModalShell`), `overlays.tsx`, `page-modules/MobileSheet.tsx` (`MobileSheet`, `MobileActionBar`). Tokens are in `web/src/styles/admin-color-bridge.css`. i18n is `useDashboardText()` (`I/dashboard-i18n.ts`) for shell copy, and `useT()` keys for drawers.

Backend (`M/` = `supabase/migrations/`):

- **Bookings.** `agency_bookings` is the commercial record. Its `booking_status` is `tentative, confirmed, completed, cancelled, draft, in_progress, archived`, with **no `no_show`**. It also has `payment_status` (`unpaid, partial, paid, cancelled, refunded`), `deposit_*` columns and `timezone`. `talent_bookings` is the calendar copy: its status CHECK allows `confirmed, completed, cancelled` only, with a gist no-overlap constraint.
- **Holds.** `talent_holds` (soft or firm, `expires_at`; the cron is `api/cron/expire-calendar-holds`). Talent holds **cannot be extended**. `capacity_allocations` can, via `extend_capacity_hold`.
- **Money.** `booking_transactions` (deposit, balance or full; state machine), `payment_links` (`/pay/<code>`, idempotent on `operation_key`), and `settleAtDoor` for idempotent cash. **`/pay/[code]/page.tsx:210` creates a Stripe session without an idempotency key.**
- **Actions.**

  | Action | Status |
  |---|---|
  | `rescheduleBooking` (RPC `reschedule_booking_set`) | Exists, but no fee. |
  | `cancelBookingSet` | Exists. Computes the refundable amount but moves no money. |
  | `createManualBooking` (`server-actions/admin-bookings.ts:917`) | **No conflict check, and no `talent_bookings` copy.** |
  | `confirmRecord` → `engine_convert_to_booking` | Correct path from inquiry to booking. |
  | Mark completed | No dedicated action. |
  | No-show | No action. |
  | Reschedule request | No table. |
  | Travel time | Not stored per booking. |

- **Availability.** `talent_booking_hours` (weekly, exceptions, buffers, notice, horizon, timezone). `generateSlots` + `loadBusyIntervals` compute free time. **`saveBookingHours` (`server-actions/booking-hours.ts:384,398`) always writes `exceptions: []`, which wipes the talent's exceptions.** Overnight working hours are not supported: a window must end at or before 24:00.
- **Trades.** The `talent_type` taxonomy term is the primary role. `resolveAppointmentPolicy` layers platform → tenant → talent → offering. `offerings-types.ts` defines `bookingMode` as `request | instant` and `priceDisplay` as `exact | from | quote`. Related tables exist: `lesson_packages`, `session_series`, `booking_deliverables.due_at`. No per-trade config exists yet.

**Phase 0 re-verifies all of this before any build.**

---

## 2. Architecture (the decisions this plan makes)

### 2.1 One read model: `TalentAgendaItem`

New module: `web/src/lib/talent-agenda/`. All four screens read **only** from this module, never from raw tables.

```ts
type BookingState = 'requested'|'hold'|'confirmed'|'completed'|'cancelled'|'no_show'|'hold_expired';
type PaymentState = 'none'|'awaiting'|'checking'|'due'|'partial'|'paid'|'overdue'|'refund_pending'|'agency';
type Source = 'website'|'tulala'|'manual'|'agency';
type ItemKind = 'booking'|'request'|'hold'|'block'|'deadline'|'project';

interface TalentAgendaItem {
  id: string; kind: ItemKind; ref: {table: string; id: string};      // bookingId | inquiryId | holdId | blockId
  client?: {id?: string; name: string; initials: string; phone?: string; email?: string; noShows?: number};
  title: string;                         // service or event name
  lines: {label: string; cents: number}[];
  startsAt: string; endsAt: string; allDay: boolean; tz: string; clientTz?: string;
  where: {mode: 'studio'|'client_home'|'away'|'online'; label: string; travelMin?: number};
  bufferAfterMin: number;                // from trade/hours/offering
  booking: BookingState; payment: PaymentState;
  money: {totalCents: number; paidCents: number; depositCents?: number; dueCents: number; currency: string};
  source: Source; managedBy?: {agencyId: string; name: string};
  holdUntil?: string;                    // ISO, holds only
  blocksTime: boolean;                   // derived: false for requested / cancelled / deadline
  tradeSection?: TradeSection;           // guests+diet, sets+call time, intake form, estimate, project stage
  history: {at: string; text: string}[];
}
```

Pure derivation functions, unit-tested with no database:

- `deriveBookingState(...)`, `derivePaymentState(...)`. The mapping table is `tc_vocab`. Example: completed + unpaid = `overdue`.
- `blocksTime(item)`, and `occupiedInterval(item)`, which includes travel before and after plus the buffer.
- `freeGaps(day, items, hours, now)`. Reuse the math in `scheduling/slots.ts`; do not fork it.
- `needsAttention(items, now, trade)`. Returns the ordered list shown on Today. Rules:
  - pending requests
  - holds awaiting payment, with the time remaining
  - overdue balances
  - a missing intake form before a first session
  - agency job invitations and change requests
  - pending reschedule requests
- `todayTotals(items, now)`. Returns appointments today, booked minutes, and still to collect (due today + overdue).
- `weekCounts(items)`. Returns All = Requests + On hold + Confirmed + Completed + Cancelled (+ No-show).

Loader: `loadTalentAgenda(talentProfileId, range)`. It is server-only and reads the following in parallel:

- `talent_bookings` joined to `agency_bookings` (status, payment, money, timezone, source)
- `talent_holds`
- open requests (inquiries with `offering_request` / `instant_book` that are not yet converted)
- `talent_availability_blocks`
- `booking_transactions` / `payment_links` state
- `booking_deliverables.due_at`
- `talent_booking_hours`

It returns items plus hours. Wire it into `app/(workspace)/talent/layout.tsx` behind the flag, replacing `loadTalentCalendarEntries` for V2 only.

### 2.2 The scenario sheet becomes the test fixture

Port the prototype's Jor week (screen `tc_scenario`, data in `talent-studio-prototype.html`: search `TCX_` / `TCB(` / `R_(`) to `web/src/lib/talent-agenda/__fixtures__/jor-week.ts`. Clock: Wed 23 Sep 2026 09:50 America/Cancun. Then port each trade's week from the `TR` object (`TR.barber`, `massage`, `chef`, `dancer`, `trainer`, `photo`, `tutor`, `clean`, `design`) as further fixtures.

Unit tests assert the numbers the design prints. For Jor:

- 3 confirmed today = 60 + 135 + 90 min = 4 h 45
- still to collect = 1,050 + 950 + 620 overdue
- Needs attention has 5 items
- week counts: All 9 = 1 + 1 + 5 + 2 + 0
- Sofía's hold ends 11:40, which is 1 h 50 from 09:50
- free gaps today exclude buffers and travel

If a test disagrees with the prototype, the derivation is wrong. Do not change the test to match the code.

### 2.3 One trade registry: `TRADE_PROFILES`

Build it in code first; no new table. File: `web/src/lib/talent-agenda/trades.ts`.

```ts
interface TradeProfile {
  key: 'beauty'|'barber'|'massage'|'chef'|'dancer'|'trainer'|'photo'|'tutor'|'clean'|'design';
  kind: 'slot'|'event'|'project';                 // what is booked
  length: {mode:'fixed'|'window'|'estimate'|'none'; typicalMin?: [number,number]};
  neededFirst: ('none'|'intake_form'|'assessment'|'event_details'|'address_access'|'scope'|'subject_level'|'shot_list')[];
  timeAround: {bufferMin: number; travelDefaultMin?: number; prepBlocks?: boolean; deliveryDates?: boolean};
  money: {pattern: 'pay_at_appointment'|'deposit_long'|'quote_deposit_balance'|'per_session'|'fixed_per_job'|'quote_milestone'; depositPct?: number};
  words: {noun: [en: string, es: string]; nounPlural: [string,string]; newLabel: [string,string]; person: [string,string]};
  grid: {startMin: number; endMin: number};       // default calendar hours; overridden by booking hours
  talentTypeSlugs: string[];                      // taxonomy slugs that map here
}
```

- Fill it from `tg_settings` plus each `TR.<trade>` block (`settings`, `kind`, `noun`, `newLabel`, `buffer`, `grid`).
- `resolveTradeProfile(talentProfileId)` reads the `primary_role` taxonomy term and falls back to `beauty`-like `slot` defaults.
- Screens read words and rules only through this function. **No `if (trade === 'chef')` in components.** The only allowed branch is on `kind` (slot / event / project) and on the `tradeSection` renderer.
- It also fixes the known wrong chef and massage wording on main (chef mapped to the "practice" preset). Add a unit test that every slug in the taxonomy resolves to a profile.

### 2.4 Routes

New talent pages, each its own segment added to `TALENT_SEGMENT_MAP` and `TalentPage`:

| URL | Page | Prototype |
|---|---|---|
| `/talent/today` | Today (V2 when the flag is on) | `tc_today`, `tc_attn`, `tc_new*`, `tg_today_*` |
| `/talent/calendar?view=week|day|month|list&date=YYYY-MM-DD` | Calendar | `tc_cal*`, `tg_cal_*` |
| `/talent/calendar/availability` | Availability | `tc_cal_avail`, `tc_setup_avail` |
| `/talent/bookings/[id]` | Booking record (booking, hold or request) | `tc_detail*`, `tc_req*`, `tg_rec_*` |
| `/talent/bookings/new?date=&time=` | New booking, or a quote for event and project kinds | `tc_nb*`, `tg_new_*` |
| `/talent/attention` | All items that need you | `tc_attn` |

- Focused flows (block time, request deposit, finish and collect, cancel, reschedule, offer other times) are **drawers on desktop and full-screen task pages on the phone**. Use one `TaskShell` component that renders `ModalShell` at 720 px and up, and a full-screen page below that. On the phone the tab bar is replaced by Back plus the task action (`tc_system`).
- Deep links must survive reload. The desktop calendar peek (`tc_cal_peek`) is a popover; "Open booking" navigates to `/talent/bookings/[id]`.

### 2.5 Visual rules (`tc_system`), with one owner decision

- Canvas #FAFAF7, white surfaces, charcoal text. One primary button per view. Destructive actions only inside More. A disabled button always shows its reason beside it. Colour always comes with a word and an icon.
- Phone: title 24/19 px, body 16 px, metadata 14 px, chips 12.5 px, touch targets 44–48 px. Sticky actions sit above the home indicator. Nothing shrinks at 360. Amounts never wrap. Long names are truncated in lists and wrap on records.
- **DECISION D1 (owner).** The prototype's rule page names charcoal primary buttons and an indigo accent (#3B4CCA) for links, today, selection and focus. The rest of the talent shell uses the brand green (#0F4F3E). Ask the owner before Phase 3. Until answered, implement accent and primary as two tokens (`--tc-accent`, `--tc-primary`) so it is a one-line switch.

---

## 3. Phases and PRs

Each task is one PR. Each lists files, acceptance criteria and tests. **Merge in order within a phase.** Phases 1 and 2 can run in parallel with Phase 3.

### Phase 0. Verify and set up (no product code)

**T0.1 Audit.** Re-verify every bullet in section 1 on the latest `origin/main`, and record the file:line for each in `docs/plans/today-calendar/AUDIT.md`. Take screenshots of the current `/talent/today` and `/talent/calendar` at 1440 and 390 on a seeded local talent (these are the before images). List every place `talentPage === 'calendar'` / `'today'` is referenced.

**T0.2 Local QA talent.** Add a seed script, `web/scripts/seed-talent-agenda-qa.mjs`. It creates a talent `qa-agenda-jor` with Jor's week from the fixture: bookings, a hold, a request, blocks, one overdue, one agency job, and booking hours Mon–Fri 10–19, Sat 10–15, 15 min buffer. It also seeds one talent per trade kind (barber, chef, dancer, design). It is guarded so it only runs against local or isolated databases, and `--reset` removes everything it created. Every later PR is QA'd on these talents.

**T0.3 Flag.** Add `TALENT_AGENDA_V2` plus a per-talent override list (`TALENT_AGENDA_V2_TALENTS`, comma-separated profile ids). Add `isAgendaV2(talentProfileId)`. Test: flag off returns false.

### Phase 1. Backend correctness the design depends on (small, independent PRs)

**T1.1 Stop `saveBookingHours` wiping exceptions.** Read the existing `exceptions` and merge; only replace them when the caller sends exceptions. Test: saving weekly hours keeps existing exceptions. This is a live bug, so ship it first.

**T1.2 Manual booking goes through the engine.** `createManualBooking`:

- Run the same busy check as `confirmRecord`: buffers, holds and booking hours. Hours are a warning ("outside your hours") only after an explicit override.
- Write the `talent_bookings` copy inside the same transaction, or call `engine_convert_to_booking`. Choose after reading both.
- Return `{ok:false, reason:'slot_taken', alternatives:[…3 free starts that fit length + buffer]}` on conflict.
- A deliberate double booking requires `allowOverlap:true` plus a second confirmation token.

Tests: a conflict returns alternatives; a success creates both rows; the gist exclusion still holds.

**T1.3 No-show.** Additive migration:

- Add `'no_show'` to `booking_status`.
- Extend the `talent_bookings` status CHECK to allow `no_show`. Decide whether no-show still counts as occupied for the gist exclusion: it should count, because the time happened. Include it in the exclusion `WHERE`.

Action `markBookingNoShow(bookingId)`:

- Allowed only when `starts_at < now()` and the status is confirmed.
- Increments `customers.no_shows` (the first writer of that column).
- Applies `no_show_fee_cents` only if a policy sets it **and** a payment method is on file; otherwise it records "nothing kept".
- Writes history.

Tests: blocked before the start time; counter +1; idempotent.

**T1.4 Mark completed.** Action `completeBooking(bookingId, {adjustLines?})`. Sets `agency_bookings` and the calendar copy to `completed`. Does not touch payment state. Tests: completed + unpaid derives `overdue`.

**T1.5 Talent hold extension and "checking payment".** When a hold reaches `expires_at` while a `booking_transactions` row for it is `pending` (bank not answered), extend the hold once by up to 10 min instead of releasing it. Implement this in the expire cron and in the trigger path. The payment state derives `checking`. Tests: pending payment at expiry means extended, not released; declined after that means released.

**T1.6 Payment link Stripe idempotency.** `/pay/[code]/page.tsx:210`: pass `idempotencyKey: 'pl_<linkId>_<attempt>'`. A retry after a decline reuses the same payment request (`tc_pay_card_fail`). Test with a mocked Stripe.

**T1.7 Travel time per booking.** Additive migration: `agency_bookings.travel_before_min int`, `travel_after_min int` (both nullable), mirrored on the calendar copy or read by join. `loadBusyIntervals` includes them. Tests: busy intervals include travel; free gaps shrink.

**T1.8 Reschedule requests with an optional fee.** Additive migration for `booking_reschedule_requests`:

- columns: `id, booking_id, requested_by (talent|client), new_starts_at, new_ends_at, fee_cents, status (pending|accepted|declined|expired|conflict), hold_id, expires_at, created_at`
- The new time is protected by a talent hold until `expires_at`. The old time stays booked until accepted.

Actions:

- `proposeReschedule` (talent side, with or without a fee)
- `respondToReschedule` (client, from the manage page; pays the fee via a payment link first if `fee_cents > 0`)
- When accepted, call `rescheduleBooking`.

If the new time was taken before acceptance, the request goes to `conflict`, nothing moves and nothing is charged (`tc_resched_conflict`). Add a notification producer `booking.reschedule.*`.

**T1.9 Cancel with money.** Wrap `cancelBookingSet`:

- The caller passes `cancelledBy: 'talent'|'client'`.
- Compute the refund from the talent's rule (`cancel_free_hours` / `booking_policy_overrides`) and show it before confirming.
- On confirm, create the refund via `markRefunded`, or the provider refund when paid by card. Payment derives `refund_pending` until the refund lands.
- If the refund fails, the booking still cancels and a "Refund needs attention" item appears (`tc_ctas2`).

**T1.10 Fix the month-grid click.** It currently does nothing. In V2 the grid is replaced, but fix the old path for flag-off users: send `channelId`, or open the record.

Phase 1 exit: every action in `tc_ctas` / `tc_ctas2` has a server function that exists, is idempotent, and returns a typed `{ok, reason}`. Record the mapping in `AUDIT.md`.

### Phase 2. Read model and trade registry (no UI)

**T2.1 `lib/talent-agenda` types plus the derivations** from 2.1, with the Jor fixture tests from 2.2. At least 40 assertions, covering every state in `tc_vocab`.

**T2.2 `TRADE_PROFILES`** from 2.3, filled for all 10 trades from `tg_settings` and `TR`. Tests:

- every trade has words in EN and ES
- every `talent_type` slug resolves to a profile
- each trade fixture's printed totals match its derived totals (the prototype's per-trade numbers)

**T2.3 `loadTalentAgenda`**, plus the wiring in the layout behind the flag. Integration test against the seeded QA talent. Performance: one round trip of parallel queries, and under 300 ms locally for a 9-month range.

**T2.4 Overnight display.** Items that cross midnight render as "until 00:30 Sat" on the start day, with a continuation note at the top of the next day. Working-hours windows stay under 24:00 (engine rule). For trades whose grid goes past midnight (dancer), the calendar grid may extend to 26:00 for **display** only. Tests with the dancer fixture.

**T2.5 Two time zones.** If a client time zone is known (`clientTz`: new nullable column `agency_bookings.client_timezone` in an additive migration, or taken from the inquiry), the record and requests show both times ("13:00 Mérida · 21:00 Madrid"). The tutor fixture test covers it.

### Phase 3. Primitives (UI kit for these screens)

Location: `I/talent/agenda/primitives/`. Build each once, with a vitest component test and an EN/ES test.

- `BookingStateChip`, `PaymentStateChip`: word + icon + tint, exactly the set in `tc_system`. Replace nothing outside V2.
- `AgendaRow`: time, length, avatar, who, what, where, source, the two chips, one action. There are variants for requests (dashed outline, "Not blocking your time until you accept"), holds (countdown), blocks, and agency work.
- `NowBox`: the "what to do now" box on a record. It has a title, a body, 0–2 actions and a tone.
- `MoneyBlock`: lines, paid rows, and "due" in words.
- `HistoryList`, `TermsLine`.
- `FreeGap` (bookable, a tap opens New with the time prefilled).
- `TaskShell`: a desktop dialog and phone full-screen page, with a sticky action bar and Back.
- `WeekStrip` (phone): days with dots; a hollow dot means a request or hold.
- `MonthPicker` (phone).
- `CountdownText`: one function formats "1 h 50" everywhere so Today, Calendar and the record always agree.
- `EmptyDay`: a closed day explains itself and offers the next free time.

Each primitive gets a static story page under `app/dev/talent-agenda/` (dev only) that renders it with fixture data at 1440 / 390 / 360.

### Phase 4. Today

**T4.1 Today V2, established talent.** Matches `tc_today`, plus `tg_today_<trade>` for the other trades. Order:

1. greeting + date + city
2. **Needs attention** (desktop shows 3, phone 2, both "View all N")
3. **Next up** card
4. **Rest of today** (agenda rows)
5. **Money**: collected this month, owed to you, next payout; a payout line only if card payments exist (cleaning: "no payout" when cash-only)
6. one optional suggestion (rebook, based only on that client's history)

Header actions: New booking (trade `newLabel`). The website reward is the app bar control only; remove the second completion card. Remove "Check in", the StartWorkspace tile and the stacked nudges when V2 is on.

**T4.2 Needs attention page** (`/talent/attention`, `tc_attn`). Same items, in urgency order. An item leaves the list only after its action succeeds; show a confirmation line saying who was told (`tc_today_after`).

**T4.3 First-day Today** (`tc_new`, `tc_setup_avail`, `tc_setup_loc`, `tc_new_saved`, `tc_new_ready`, `tc_new_live`).

- The 6-step checklist uses **one** number everywhere: ring, header chip and app bar.
- Two readiness levels: *requests* need a service and a location; *picking a time* also needs availability. The preview button reads "Request a booking" until availability exists, then "Book a time".
- When all 6 steps are done, one card opens the Create your website flow. When the site is live, the card shows the live address with View website and Edit site.
- Reuse the existing eligibility source; do not add a second completion model.

Acceptance: on the QA Jor talent at clock 09:50, every number equals the prototype. Test this with the fixture clock injected via `now` (never `Date.now()` inside derivations).

### Phase 5. Calendar

**T5.1 Week (desktop) and agenda (phone)** (`tc_cal`).

- Hours start at the trade/booking-hours start. There is no empty all-day lane unless deadlines exist.
- Outside working hours are shaded. The red line is "now".
- Buffers and travel are drawn as occupied hatching. Requests are outlines marked "not blocking". Holds show "until 11:40". Agency jobs carry the agency name.
- Phone: month control, week strip, vertical agenda including free gaps (`tc_cal_thu`), empty day (`tc_cal_sun`), a request that now overlaps (`tc_cal_overlap`).

**T5.2 Day, month, list** (`tc_cal_day`, `tc_cal_month`, `tc_cal_list`).

- Day: one wide column plus that day's free times beside it on desktop.
- Month: counts per day; requests and holds shown by word; past days show counts only; nothing invented for the future.
- List: the same records as the week, with chip counts computed from them (All = sum of the parts). The phone groups by day and drops nothing.
- Delete the hard-coded day-14 view.

**T5.3 Peek** (`tc_cal_peek`). A desktop popover with the three likely next actions plus Open booking. A phone tap opens the record directly.

**T5.4 Add, block time, blocked, undo** (`tc_cal_add`, `tc_cal_block`, `tc_cal_block_d`, `tc_cal_blocked`).

- One "+" offers New booking or Block time; both open on the selected day.
- The block form re-checks as times are picked: an overlap with a confirmed booking turns Save off and names the booking.
- The block appears in place; free gaps shrink; Undo is available for 10 s (delete via `deleteTalentAvailabilityBlock`). No repeat option, because recurring blocks are not built.

**T5.5 Availability page** (`tc_cal_avail`, `tc_setup_avail`). Weekly hours, buffer, exceptions, time off and time zone in one place, saved to `talent_booking_hours` (depends on T1.1). Travel is per booking and is not on this page. The talent-direct-booking opt-in stays.

**T5.6 Trade calendars** (`tg_cal_<trade>`). Grid, hours and buffer come from the profile.

- Chef: prep and market blocks are real blocks linked to the event (block `reason` + `linked_booking_id` in note or metadata).
- Photographer: delivery dates are all-day deadline items that never block time.
- Designer: only calls block time; project due dates sit in the all-day row.
- Dancer: overnight display from T2.4.

### Phase 6. Booking record

**T6.1 Record layout** (`tc_detail`), on route `/talent/bookings/[id]`. Order:

1. who, what, when and where (with travel)
2. the trade section (`tradeSection` renderer)
3. **Now** box with a single payment action
4. agreed items and money
5. terms
6. history

Header actions are only Message, Reschedule and More. Cancel is inside More.

Variants to cover:

| Screen | Case |
|---|---|
| `tc_detail_v` | paid, nothing to collect |
| `tc_detail_hold` | countdown; Reschedule hidden while only held |
| `tc_detail_rv` | change requested |
| `tc_detail_al` | deposit paid |
| `tc_detail_lm` | completed + overdue; action "Request payment", not "Finish" |
| `tc_detail_mp` | completed + paid |
| `tc_detail_ds` | just created; client not told yet; "Send on WhatsApp" |
| `tc_detail_1830` | after start: Finish and collect; More enables no-show |
| `tc_detail_agency` | only Request a change and Message the agency; fee shown as the agency's responsibility; no cancel or payment controls |

**T6.2 Request record** (`tc_req`, `tc_req_ok`).

- A request is not a booking. Say whether the hour is free right now and what accepting will send.
- Actions: Accept, Suggest another time, Decline.
- Accept shows "Accepting…" and re-checks the time on the server via `confirmRecord`. On success: Confirmed, "due at the appointment", email sent, history updated, item gone from Today. If the time was just taken: the request is unchanged and Suggest another time is offered.

**T6.3 More, Cancel, No-show** (`tc_more`, `tc_cancel`, `tc_cancelled`, `tc_noshow`, `tc_noshow_done`).

- Cancel shows the consequences first, in money: who cancels decides the deposit outcome, and the dialog shows the freed time and the exact client message. Uses T1.9.
- No-show is off until the start time has passed, and says why. Uses T1.3.

**T6.4 Trade sections.** One renderer per `tradeSection` type:

- event: guests, diet, kitchen, menu, prep
- performance: call time, sets, end, venue rules
- intake: health form status, with a resend action
- tz: both times
- estimate: estimate, booked to its top; finishing early frees the rest
- project: stage, deliverables, due dates

The only new storage: intake form status. Use `agency_bookings` metadata jsonb, or add an additive `booking_intake` table if no metadata column exists; decide in T0.1.

### Phase 7. New booking

**T7.1 Slot kind** (`tc_nb`, `tc_nb_client`, `tc_nb_conflict`, `tc_nb_alt`, `tc_nb_ready`, `tc_nb_kbd`, `tc_nb_saved`, `tc_nb_taken`).

- Three groups: Client (search first; a new client needs only a name), Work and time, Payment. The date starts on the day the user came from.
- The live conflict check names the booking, the occupied interval and the buffer. It offers only alternatives that fit length + buffer.
- Payment is not preselected, and Save explains why it is off.
- Save re-checks on the server (T1.2). If the time is taken, nothing is saved or lost, and new alternatives appear.
- The result says the payment state and that the client has not been told, and offers the confirmation message as a separate visible choice.
- Phone keyboard: the action bar sits above the keyboard.

**T7.2 Event kind quote** (`tg_new_chef`, `tg_new_dancer`). Fields: event window, guests or performance times, where, per-guest or per-show pricing, deposit %, prep to block, optional date hold. Nothing is reserved until the quote is accepted, except the optional hold. Reuse the existing quote/offer path (`inquiry_offers`); the prep blocks are created on acceptance.

**T7.3 Project kind quote** (`tg_new_design`). Fields: scope, deliverables, rounds of changes, due dates. No appointment is created. Projects list on Today and Calendar (`tgProjects`). Due dates use `booking_deliverables.due_at`.

### Phase 8. Getting paid, holds and changes

**T8.1 Payment request**: amount → link, QR and where to send it → awaiting → received (`tc_pay_req`, `tc_pay_link`, `tc_pay_await`, `tc_pay_received`).

- For a hold, the link expiry ties to the hold.
- The exact message is visible before anything is sent. Open WhatsApp uses `wa.me`, and the talent presses send.
- "Sending does not mark it paid."
- The payment arrives via the existing webhook: the hold becomes Confirmed, payment becomes "Deposit paid · $X left", and the Today item disappears.
- The same flow handles the full amount for overdue and pay-before-appointment cases (`TC_PAYEE`: Lucía, Camila).

**T8.2 Finish and collect** (`tc_finish`, `tc_pay_cash`, `tc_pay_receipt`, `tc_pay_transfer`, `tc_pay_later`, `tc_pay_card`, `tc_pay_card_fail`).

- Items can be adjusted first. No method is preselected.
- Cash uses `settleAtDoor`, which is idempotent. Less than the total means partly paid.
- Transfer has two honest states: awaiting (after sharing details), then paid only when recorded.
- Card uses the secure page on the talent's phone; a retry reuses the same request (T1.6).
- "Not paid yet" completes the booking as Unpaid.
- The receipt shows method and balance. The optional rebook offer comes after the result.
- Tap to Pay is **not** built.

**T8.3 Holds** (`tc_hold_expired`, `tc_hold_checking`, `tc_hold_offer`, `tc_hold_confirmed`).

- Expiry releases the time and the record says so, including a later booking by someone else. The client's selections are kept for the next offer.
- Offer other times sends up to 3 free times; nothing is held until the client picks.
- The client side (`tc_hc_lost`, `tc_hc_fail`, `tc_hc_done`) lives on the existing public manage/booking pages. Picking holds the time for 15 min while paying. A decline shows "nothing charged, time still yours until …".

**T8.4 Reschedule** (`tc_resched`, `tc_resched_fee`, `tc_resched_sent`, `tc_resched_client`, `tc_resched_done`, `tc_resched_conflict`).

- Old and new are shown side by side. The fee decision comes first and is separate from confirming the time; nothing is preselected.
- With no fee, it moves immediately (`rescheduleBooking`). With a fee, it goes through T1.8.

**T8.5 Rebook suggestion** (`tc_rebook`). Based only on that client's past bookings (cadence). The message is visible before sending. Nothing is held.

### Phase 9. Every trade, polish, rollout

**T9.1 Walk each trade's four screens** (`tg_today_*`, `tg_cal_*`, `tg_rec_*`, `tg_new_*`) against the per-trade QA seeds, and fix only via the registry or section renderers.

**T9.2 Mobile pass** at 390 and 360:

- nothing shrinks, amounts don't wrap, and touch targets are at least 44
- sticky bars sit above the home indicator
- focused flows hide the tab bar
- keyboard-safe forms

**T9.3 Accessibility.** Chips have text. Colour is never alone. Focus rings use the accent. The countdown is readable by screen readers, but not live-announced every minute.

**T9.4 i18n.** Every string in EN and ES; run `verify:ui-messages` if the key catalog is used. Trade words come from the registry.

**T9.5 E2E.** Playwright, desktop 1440 and iPhone 14 projects, against the seeded QA talents. Journeys:

- accept a request → the Today count drops
- request deposit → simulated webhook → Confirmed
- New booking conflict → pick an alternative → saved
- block time → Undo
- finish and collect cash → receipt
- cancel with refund
- no-show after start
- reschedule with fee, both the accepted and the conflict branch

Screenshots of each go to `docs/plans/program/evidence/today-calendar/`.

**T9.6 Rollout.**

1. Flag on for the QA talents.
2. The owner reviews the live-product screenshots against the PDF.
3. Flag on for Jor's demo account. **Read-only first: the owner clicks.**
4. Flag on for all talents.
5. Delete the old Today/Calendar code paths in a separate PR after a week with no regressions.

---

## 4. Not built (the design deliberately does not draw these)

Name these as unsupported. Do not fake them:

- session packages and class packs for one-to-one work
- recurring one-to-one bookings (cleaning offers "Book like last time" instead)
- couples massage with two therapists
- milestone payments (photographer, designer)
- Tap to Pay
- time tracking
- repeat on blocks

Each trade's note in the prototype lists what that trade is missing. Keep those notes as `TRADE_PROFILES[k].notSupported` and show nothing for them.

## 5. Owner decisions needed (ask before the phase that needs them; defaults in brackets)

| # | Decision | Needed by | Default if unanswered |
|---|---|---|---|
| D1 | Accent/primary: prototype indigo #3B4CCA + charcoal, or the shell's brand green | Phase 3 | [tokens behind a switch; build with charcoal + indigo as drawn] |
| D2 | Does a no-show still block the time (for overlap)? | T1.3 | [yes] |
| D3 | Reschedule fee: talent-set per booking, or policy-driven | T1.8 | [per booking, optional] |
| D4 | Hold "checking payment" extension length | T1.5 | [10 min, once] |
| D5 | Who can see Clients (the rail shows it in the prototype, but it is not in this scope) | later | [out of scope here] |
| D6 | Intake form: build a real form, or status + resend link only | T6.4 | [status + resend only] |

## 6. Definition of done (whole program)

- Every screen id in section 3 has a live equivalent at 1440, 390 and 360, in EN and ES, on real data, matching the PDF 1:1 in structure, copy and order.
- Every button in `tc_ctas` / `tc_ctas2` works end to end, with its working, success, failure and back states. The E2E journeys pass.
- Every number on Today and Calendar is derived and covered by a fixture test.
- No trade-specific `if` in components. Adding a trade means adding a registry row plus its words.
- `deploy:smoke` passes after each merge. The flag is on for all talents. The old code is removed.
