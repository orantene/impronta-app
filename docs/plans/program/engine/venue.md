# Venue, events, guest and device engine — UI contract

Package 3. The UI session wires boards to these actions. This file is the
contract: names, input, result unions, refusal codes, sentence keys, readers,
and the boards each task unblocks.

Refusals are codes. Sentences live in `dashboard.venue.engine.refusal.*` in
en / es / fr. Actions return `{ ok: false, reason }` and never English prose.

`unavailable` is transport failure and never a second write path.

Actions live in `web/src/lib/server-actions/venue-engine.ts`. Do not re-export
that file from an existing `"use server"` module that client components already
import (Next.js then drops those exports).

This package does not touch `components/**`, admin `*.tsx`, or `globals.css`.

---

## 1. Locations and zones

Unblocks: W23 LocationsZones, POS location chip, per-location modes.
Records D-POS-76, D-POS-77. Closes the writer half of D-POS-18 / D-POS-55 /
D-POS-80 (chip + settings).

`public.locations` is the city gazetteer. Tenant places are
`venue_locations` + `venue_location_zones`. Every agency is seeded with
`slug=default`, `is_default=true`, so
`agencies.settings.pos.locations.default.modes` keeps working.

Reader: `locationsList` and `readLocationModes(tenant, slug)` in
`web/src/lib/pos/pos-modes-store.ts`. `readPosModes` still reads `default`.

### `locationsList`

Input: `{}` (tenant from the staff guard)

Success: `{ ok: true, locations, zones }`

### `locationUpsert`

Input: `{ id?, slug, name, venueId?, timezone, address?, isDefault?,
sortOrder?, status?, expectedVersion? }`

Success: `{ ok: true, id, slug, version, isDefault }`

Closing the last active location refuses `last_location`. A second row with
the same slug refuses `duplicate_slug`. A stale `expectedVersion` refuses
`conflict`.

### `locationSetDefault`

Input: `{ id, expectedVersion? }`

Success: `{ ok: true, id, version }`

### `zoneUpsert`

Input: `{ id?, locationId, name, kind: 'floor'|'bar'|'terrace'|'room'|'counter',
surchargeBps?, sortOrder?, expectedVersion? }`

Success: `{ ok: true, id, version }`

### `zoneDelete`

Input: `{ id, expectedVersion? }`

Success: `{ ok: true, id }`

Refuses `has_spaces` when any `spaces.zone_id` still points at the zone.

| reason | sentence key |
|---|---|
| duplicate_slug | `dashboard.venue.engine.refusal.duplicate_slug` |
| last_location | `dashboard.venue.engine.refusal.last_location` |
| has_spaces | `dashboard.venue.engine.refusal.has_spaces` |
| conflict | `dashboard.venue.engine.refusal.conflict` |
| not_found | `dashboard.venue.engine.refusal.not_found` |
| wrong_tenant | `dashboard.venue.engine.refusal.wrong_tenant` |
| invalid | `dashboard.venue.engine.refusal.invalid` |
| unavailable | `dashboard.venue.engine.refusal.unavailable` |
| not_allowed | `dashboard.venue.engine.refusal.not_allowed` |

---

## 2. Party waitlist (restaurant)

Unblocks: T08, POSWalkIn waitlist, MW17. Records D-POS-78. Does not touch
`waitlist_offers` (D-POS-68).

Notify never pretends a phone send happened: no guest SMS sender exists, so
the RPC records `notified_at` and the action returns `channel: 'none'` unless
an email was actually accepted.

Seat claims the row under `FOR UPDATE`, then opens the visit through
`openVisit` (same path as `tablesSeatParty`). Two concurrent seats of one
entry yield one winner (`conflict` / `already_seated`).

### `partyWaitlistJoin`

Input: `{ locationId?, zoneId?, partySize, holderName, holderPhone?,
holderEmail?, note?, quotedMinutes? }`

Success: `{ ok: true, id, position, version }`

### `partyWaitlistNotify`

Input: `{ id, ttlSeconds?, expectedVersion?, holderEmail?, holderPhone? }`

Success: `{ ok: true, id, version, channel: 'email'|'none' }`

### `partyWaitlistSeat`

Input: `{ id, spaceId, operationKey, expectedVersion? }`

Success: `{ ok: true, id, visitId, version }`

### `partyWaitlistLeave`

Input: `{ id, expectedVersion? }`

Success: `{ ok: true, id }`

Reader: staff SELECT on `party_waitlist`. Reaper: `party_waitlist_reap` inside
`api/cron/expire-orders`.

| reason | sentence key |
|---|---|
| already_seated | `dashboard.venue.engine.refusal.already_seated` |
| space_occupied | `dashboard.venue.engine.refusal.space_occupied` |
| expired | `dashboard.venue.engine.refusal.expired` |
| conflict | `dashboard.venue.engine.refusal.conflict` |
| not_found | `dashboard.venue.engine.refusal.not_found` |
| unavailable | `dashboard.venue.engine.refusal.unavailable` |

---

## 3. Layouts, service periods, prep stations

Unblocks: W13, W14, W15, R06, T26. Records D-POS-79.

Activating a layout never writes capacity pools. When `service_periods`
exist for a venue's locations they replace `venue_service_windows` in
`loadVenueServiceConfig`; otherwise today's windows stay.

### `layoutActivate`

Input: `{ layoutId, expectedVersion? }`

Success: `{ ok: true, id, version }`

### `servicePeriodUpsert`

Input: `{ id?, locationId, name, weekdayMask, startsLocal, endsLocal,
turnMinutes, rules?, expectedVersion? }`

Success: `{ ok: true, id, version }`

### `prepStationDelete`

Input: `{ id }`

Success: `{ ok: true, id }`

### `prepFireCourse`

Input: `{ visitId, courseSeq, operationKey }`

Success: `{ ok: true, submitted }`

| reason | sentence key |
|---|---|
| overlap | `dashboard.venue.engine.refusal.overlap` |
| two_active | `dashboard.venue.engine.refusal.two_active` |
| station_in_use | `dashboard.venue.engine.refusal.station_in_use` |
| conflict | `dashboard.venue.engine.refusal.conflict` |

---

## 4. Guest QR ordering and pay-my-share

Unblocks: Q02–Q07. Records D-POS-80.

Guest identity is the visit `public_token` plus the existing guest cookie.
Actions are token-scoped and rate-limited. Drafts use `source_channel=guest_qr`.
Pay-my-share reserves through `pos_reserve_collection` and mints a Package 1
payment link. Two guests paying the last share: one wins, the other sees
`already_paid` / `exceeds_outstanding`.

Public pages (existing `/visit/[token]` landing is unchanged):
`/visit/[token]/menu`, `/visit/[token]/share`.

### `guestVisitMenu` / `guestVisitAddLine` / `guestVisitSubmit`
### `posLineOfferSubstitute` / `guestVisitSubstituteAccept`
### `guestVisitPayShare` / `guestVisitBill`

| reason | sentence key |
|---|---|
| visit_closed | `dashboard.venue.engine.refusal.visit_closed` |
| item_unavailable | `dashboard.venue.engine.refusal.item_unavailable` |
| already_paid | `dashboard.venue.engine.refusal.already_paid` |
| exceeds_outstanding | `dashboard.venue.engine.refusal.exceeds_outstanding` |
| not_submitted | `dashboard.venue.engine.refusal.not_submitted` |

---

## 5. Events: seats, holds, exchange, comp, multi-day, delivery

Unblocks: E03, E05, E11, E12, E14, E15, W17. Records D-POS-81.

Seat maps reuse task-3 layouts. A seat is `spaces.kind='seat'`. Capacity
goes through existing space pools via `reserve_resource_set_v2`, never a
second count. Expired holds are reaped in `api/cron/expire-orders`.

`event_series` is distinct from class `session_series`. `purchase.ts`
expands `eventSeriesId` into one line per scheduled night.

Exchange never moves money silently: a higher price writes a draft line
and returns `price_up_needs_payment`; a lower price writes
`ticket_refund_intents`. Comp consults Package 2 `role_limits` /
`approval_requests`. Delivery writes `admissions.delivery`; sms and
wallet return `channel_unavailable`.

### `admissionHoldSeats`

Input: `{ sessionId, seatIds[], guestSessionId?, ttlSeconds?, operationKey }`

Success: `{ ok: true, id, expiresAt, already? }`

### `admissionExchange`

Input: `{ admissionId, toSessionId, operationKey, expectedVersion? }`

Success: `{ ok: true, id, version, deltaCents }`

### `admissionComp`

Input: `{ sessionId, tierVariantId, holderName, holderEmail?, reason,
approver?, operationKey }`

Success: `{ ok: true, id, orderId }`

### `admissionDeliver`

Input: `{ admissionId, method: 'email'|'sms'|'print'|'wallet' }`

Success: `{ ok: true, id, method }`

### `eventSeatMapUpsert` / `eventSeriesUpsert`

| reason | sentence key |
|---|---|
| seat_taken | `dashboard.venue.engine.refusal.seat_taken` |
| hold_expired | `dashboard.venue.engine.refusal.hold_expired` |
| same_session | `dashboard.venue.engine.refusal.same_session` |
| price_up_needs_payment | `dashboard.venue.engine.refusal.price_up_needs_payment` |
| needs_approval | `dashboard.venue.engine.refusal.needs_approval` |
| channel_unavailable | `dashboard.venue.engine.refusal.channel_unavailable` |

---

## 6. Ticket self-service

Unblocks: E08, E09, E10. Path is `/ticket/[code]` (D-POS-77). Signed codes
stay `adm1.…`. Transfer bumps `token_version` and re-signs; the old code
is `superseded`. Resend is email only. Lookup is rate-limited.

Public page: `/ticket/[code]` (en / es / fr copy, no em dashes).

### `ticketTransfer` / `ticketResend` / `ticketLookup`

| reason | sentence key |
|---|---|
| superseded | `dashboard.venue.engine.refusal.superseded` |
| not_found | `dashboard.venue.engine.refusal.not_found` |
| too_many_attempts | `dashboard.venue.engine.refusal.too_many_attempts` |
| channel_unavailable | `dashboard.venue.engine.refusal.channel_unavailable` |

---

## 7. Device registry and offline outbox

Unblocks: POSDevices, POSConnection, POSCounterOffline, W20. Records
D-POS-82.

`pos_devices` is the registry. `pos_device_sessions.device_id` points at
it. Heartbeat refreshes `last_seen_at`. Settings (`default_mode`,
`drawer_id`, `printer_id`, `min_app_version`) live in `settings jsonb`.

The client may queue only cash sales while offline (D-POS-11).
`pos_outbox_apply` replays `kind=cash_collect` through
`pos_reserve_collection` and refuses `not_replayable` for anything that
names a provider.

### `posDeviceRegister` / `posDeviceHeartbeat` / `posDeviceUpdate` / `posOutboxApply`

| reason | sentence key |
|---|---|
| unknown_device | `dashboard.venue.engine.refusal.unknown_device` |
| not_replayable | `dashboard.venue.engine.refusal.not_replayable` |
| stale_app | `dashboard.venue.engine.refusal.stale_app` |
| conflict | `dashboard.venue.engine.refusal.conflict` |
