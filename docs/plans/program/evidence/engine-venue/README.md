# Evidence — venue, events, guest and device engine

Package 3 proofs. Isolated apply (`fxlankepwnvelxjrahwk`) is recorded here when
the capacity-isolated env is present. Unit tests live next to the libs.

| Task | Migration | Unit / static | Race script |
|---|---|---|---|
| Locations & zones | `20261231223000_venue_locations.sql` | `web/src/lib/venues/locations.test.ts`, `engine-refusals.static.test.ts` | embedded DO $proof$ |
| Party waitlist | `20261231224000_party_waitlist.sql` | `web/src/lib/venues/party-waitlist.test.ts` | `web/scripts/verify-party-waitlist-race.mjs` |
| Layouts / periods / stations | pending | pending | embedded DO $proof$ |
| Guest QR + pay share | pending | pending | `web/scripts/verify-guest-share-race.mjs` |
| Events seats / holds / exchange | pending | pending | `web/scripts/verify-seat-hold-race.mjs` |
| Ticket self-service | pending | pending | n/a |
| Devices + outbox | pending | pending | `web/scripts/verify-outbox-replay.mjs` |

Contract: `docs/plans/program/engine/venue.md`.
Actions: `web/src/lib/server-actions/venue-engine.ts` (do not re-export from an existing client-imported `"use server"` module).
Refusals: `dashboard.venue.engine.refusal.*` in en / es / fr.

Versions start at `20261231223000` so they sit after Package 2's
`20261231221000_booking_policy_approvals`.

Isolated apply (`fxlankepwnvelxjrahwk` via `npm run journeys:repair`) is a
blocker until `.env.capacity-isolated.local` is present. Production `db:push`
is out of scope.
