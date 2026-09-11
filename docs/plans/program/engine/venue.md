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
