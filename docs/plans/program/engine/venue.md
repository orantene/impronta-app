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
