# Task 1 — locations and zones

Migration: `20261231223000_venue_locations.sql`

Objects:

- tables `venue_locations`, `venue_location_zones`
- columns `spaces.location_id`, `spaces.zone_id`
- RPCs `venue_location_upsert`, `venue_location_set_default`,
  `venue_location_zone_upsert`, `venue_location_zone_delete`

Seed: one `slug=default` row per existing agency.

In-file `$proof$` asserts `duplicate_slug`, `last_location`, `conflict`,
`has_spaces`, then deletes the proof agency.

Unit: `web/src/lib/venues/locations.test.ts` (fake `rpc`).
Static: SQL shape + `engine-refusals.static.test.ts`.

Isolated apply: not run in this environment (no
`.env.capacity-isolated.local`). Race: n/a (no money/seat contention).
