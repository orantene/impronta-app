# Scheduling and projects engine — UI contract

Package 2. The UI session wires boards to these actions. This file is the
contract: names, input, result unions, refusal codes, sentence keys, readers,
and the boards each task unblocks.

Refusals are codes. Sentences live in `dashboard.scheduling.engine.refusal.*`
in en / es / fr. Actions return `{ ok: false, reason }` and never English prose.

`unavailable` is transport failure and never a second write path.

Actions live in `web/src/lib/server-actions/scheduling-engine.ts`. Do not
re-export that file from an existing `"use server"` actions module that client
components already import (Next.js then drops those exports).

Mobile and Counter/Overview polish builders are active. This package does not
touch `components/**`, admin `*.tsx`, or `globals.css`.

---

## 1. Series editor and generator

Unblocks: W10, W40 "+ New series" / "Generate sessions". Closes D-POS-35
(writer half). Instructor lives on `session_series.instructor_user_id` and
`sessions.instructor_user_id` (D-POS-60). Room is `venue_id` (no space_id on
sessions). Price is the offering's `amount_cents`.

### `upsertSessionSeries`

Input: `{ seriesId?, title, localTime, timeZone, weekdays, durationMinutes,
seats, startsOn, endsOn?, venueId, offeringId?, instructorUserId, isActive? }`

Success: `{ ok: true, seriesId }`

Refuses `no_instructor`, `overlapping_room`, `past`, `invalid`, `conflict`,
`not_found`, `wrong_tenant`, `unavailable`.

`overlapping_room` is a scheduled session at the same `venue_id` whose window
overlaps an occurrence this series would produce. `past` is `endsOn` before
today when both dates are set.

### `generateSessionsForSeries`

Input: `{ seriesId, untilDate }` — `untilDate` is a local `YYYY-MM-DD`.

Success: `{ ok: true, created, reused }`

Calls the existing `decideMaterialisation` + `createSessionWithPools` once.
Idempotent on `(series_id, starts_at)`. The nightly cron is unchanged.

| reason | sentence key |
|---|---|
| overlapping_room | `dashboard.scheduling.engine.refusal.overlapping_room` |
| no_instructor | `dashboard.scheduling.engine.refusal.no_instructor` |
| past | `dashboard.scheduling.engine.refusal.past` |
| conflict | `dashboard.scheduling.engine.refusal.conflict` |
| not_found | `dashboard.scheduling.engine.refusal.not_found` |
| wrong_tenant | `dashboard.scheduling.engine.refusal.wrong_tenant` |
| invalid | `dashboard.scheduling.engine.refusal.invalid` |
| unavailable | `dashboard.scheduling.engine.refusal.unavailable` |

Reader: existing `loadSchedule`.

---

## 2. Substitute / move participant / cancel session

Unblocks: W39 right panel. D-POS-35 remaining writers.

### `sessionSetInstructor`

Input: `{ sessionId, userId, scope: 'this'|'future'|'series' }`

Success: `{ ok: true, updated }`

### `sessionMoveParticipant`

Input: `{ admissionId, toSessionId, operationKey }`

Success: `{ ok: true, admissionId, allocationId }`

Reserves the new seat via `reserve_resource_set_v2`, then releases the old
allocation under the same lock.

### `sessionCancel`

Input: `{ sessionId, scope: 'this'|'future'|'series', reason, operationKey }`

Success: `{ ok: true, sessionsCancelled, poolsDeactivated, admissionsVoided, refundIntents }`

Releases pools, voids valid admissions, opens `ticket_refund_intents` with
reason `session_cancelled` for paid unrefunded lines. Never refunds inline.

| reason | sentence key |
|---|---|
| sold_out | `dashboard.scheduling.engine.refusal.sold_out` |
| already_cancelled | `dashboard.scheduling.engine.refusal.already_cancelled` |
| paid_seats_need_refund | `dashboard.scheduling.engine.refusal.paid_seats_need_refund` |
| conflict | `dashboard.scheduling.engine.refusal.conflict` |
| not_found | `dashboard.scheduling.engine.refusal.not_found` |
| wrong_tenant | `dashboard.scheduling.engine.refusal.wrong_tenant` |
| unavailable | `dashboard.scheduling.engine.refusal.unavailable` |

`paid_seats_need_refund` is the banner when `refundIntents > 0`. The command
itself still succeeds; money moves on the existing refund-intent cron.

---

## 3. Cancel appointment + customer manage

Unblocks: A07, A10, R04/R05. Closes D-POS-36 cancel writer.

### `cancelBookingSet`

Input: `{ bookingId, operationKey, reason, by: 'staff'|'customer' }`

Success: `{ ok: true, bookingId, refundableCents, already? }`

Locks `agency_bookings` + `talent_bookings` + allocations (mirror of
`reschedule_booking_set`). Applies `booking_policy_overrides` then the
offering / workspace cancellation window to compute `refundableCents`. Opens
the existing refund path when that amount is > 0. Never refunds inside the
cancel transaction.

### Customer-manage token

`signBookingManageToken({ bookingId, tenantId, action })` /
`verifyBookingManageToken(token)`. HMAC, same secret family as
`lib/guest-cookie.ts`. The public manage page is **contract only** (UI
session). This package does not add a route.

| reason | sentence key |
|---|---|
| not_cancellable | `dashboard.scheduling.engine.refusal.not_cancellable` |
| policy_keeps | `dashboard.scheduling.engine.refusal.policy_keeps` |
| token_invalid | `dashboard.scheduling.engine.refusal.token_invalid` |
| conflict | `dashboard.scheduling.engine.refusal.conflict` |
| not_found | `dashboard.scheduling.engine.refusal.not_found` |
| wrong_tenant | `dashboard.scheduling.engine.refusal.wrong_tenant` |
| unavailable | `dashboard.scheduling.engine.refusal.unavailable` |

---

## 4. Project team / amendments / milestones

Unblocks: W48, W46, W47, O06. Closes D-POS-37, D-POS-38, D-POS-43, D-POS-39
(archive/reopen).

### `projectReplaceTalent`

Input: `{ bookingId, fromTalentId, toTalentId, operationKey }`

Success: `{ ok: true, bookingId }`

Moves `booking_talent` + firm holds. Refuses `talent_unavailable`,
`already_started`.

### `amendmentSend` / `amendmentDiscard`

Input: `{ offerId, expectedVersion, inquiryExpectedVersion }`

Send is the existing `engine_send_offer` path. Discard moves a `draft` offer
to `superseded`.

### Milestones

`booking_deliverables.amount_cents` (default 0) and
`booking_deliverables.file_path` (storage path on the existing media bucket
pattern). Writer: `setDeliverableAmount` / `attachDeliverableFile`.

### `projectArchive` / `projectReopen`

Input: `{ bookingId, reason }`

Archive: `completed|cancelled` → `archived`. Reopen: `archived` → `confirmed`.

| reason | sentence key |
|---|---|
| talent_unavailable | `dashboard.scheduling.engine.refusal.talent_unavailable` |
| already_started | `dashboard.scheduling.engine.refusal.already_started` |
| not_draft | `dashboard.scheduling.engine.refusal.not_draft` |
| not_archivable | `dashboard.scheduling.engine.refusal.not_archivable` |
| not_reopenable | `dashboard.scheduling.engine.refusal.not_reopenable` |
| conflict | `dashboard.scheduling.engine.refusal.conflict` |
| not_found | `dashboard.scheduling.engine.refusal.not_found` |
| wrong_tenant | `dashboard.scheduling.engine.refusal.wrong_tenant` |
| unavailable | `dashboard.scheduling.engine.refusal.unavailable` |

---

## 5. Packages and price phases

Unblocks: P01–P03, P06, E02. Closes D-POS-53 (composition). Passes /
memberships / gift cards stay out (D-POS-54).

### `setOfferingComponents`

Input: `{ offeringId, components: Array<{ componentOfferingId, qty, required }> }`

A package is an offering with `offering_components` rows. Capacity still
goes through `lib/resources/hybrid-combinations.ts`.

### Price phases

Table `offering_price_phases`. `repriceAndValidate` reads the live phase
only when the line has no `price_phase_id`. A phase never changes a line
already priced; the phase id is stamped on first price.

Refund of a package splits by component share
(`component.qty * component.amount / package total`).

| reason | sentence key |
|---|---|
| cycle | `dashboard.scheduling.engine.refusal.cycle` |
| overlap | `dashboard.scheduling.engine.refusal.overlap` |
| invalid | `dashboard.scheduling.engine.refusal.invalid` |
| not_found | `dashboard.scheduling.engine.refusal.not_found` |
| unavailable | `dashboard.scheduling.engine.refusal.unavailable` |

---

## 6. Booking policy overrides and role limits

Unblocks: W24, W56. Records D-POS-65.

### `booking_policy_overrides`

`(tenant_id, offering_id, deposit_bps, cancel_free_hours, no_show_fee_cents)`.
Deposit and cancel paths read this first, then the offering / workspace
default.

### `approval_requests` + `role_limits`

`requestApproval` / `decideApproval`. `role_limits (tenant_id, role, action,
limit_cents)` is consulted by discounts and refunds above the limit.

| reason | sentence key |
|---|---|
| over_limit | `dashboard.scheduling.engine.refusal.over_limit` |
| already_decided | `dashboard.scheduling.engine.refusal.already_decided` |
| not_manager | `dashboard.scheduling.engine.refusal.not_manager` |
| conflict | `dashboard.scheduling.engine.refusal.conflict` |
| not_found | `dashboard.scheduling.engine.refusal.not_found` |
| unavailable | `dashboard.scheduling.engine.refusal.unavailable` |
