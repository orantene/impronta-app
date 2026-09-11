# Evidence — scheduling and projects engine

Package 2 proofs. Isolated apply (`fxlankepwnvelxjrahwk`) is recorded here when
the capacity-isolated env is present. Unit tests live next to the libs.

| Task | Migration | Unit / static | Race script |
|---|---|---|---|
| Series editor | `20261231216000_session_series_editor.sql` | `web/src/lib/sessions/series-write.test.ts` | idempotent generate (`created` / `reused`) |
| Session ops | `20261231217000_session_ops.sql` | `web/src/lib/sessions/session-ops.test.ts` | `web/scripts/verify-session-move-race.mjs` |
| Cancel booking | `20261231218000_cancel_booking_set.sql` | `web/src/lib/scheduling/cancel-booking.test.ts` | embedded DO $proof$ |
| Projects | `20261231219000_project_ops.sql` | `web/src/lib/projects/project-ops.test.ts` | embedded DO $proof$ |
| Packages / phases | `20261231220000_offering_packages_phases.sql` | `web/src/lib/catalog/packages.test.ts`, `price-phases.test.ts` | package refund share sums exactly |
| Policy / limits | `20261231221000_booking_policy_approvals.sql` | `web/src/lib/bookings/policy-overrides.test.ts`, `web/src/lib/approvals/requests.test.ts` | embedded DO $proof$ |

Contract: `docs/plans/program/engine/scheduling.md`.
Actions: `web/src/lib/server-actions/scheduling-engine.ts` (do not re-export from an existing client-imported `"use server"` module).
Refusals: `dashboard.scheduling.engine.refusal.*` in en / es / fr.

Versions start at `20261231216000` so they sit after Package 1's proven
`20261231210000_visit_transfer_expected_version` (#1956).

Isolated apply (`fxlankepwnvelxjrahwk` via `npm run journeys:repair`) is a
blocker until `.env.capacity-isolated.local` is present. Production `db:push`
is out of scope. Mobile and Counter/Overview polish builders are active; this
package does not touch their files.

`verify-session-move-race.mjs` exits 2 without the isolated env (same guard as
Package 1 race scripts). Confirmed locally 2026-09-11: exit 2.

Local gates on `5cc48dbd2` (private tsc lane `/tmp/tulala-tsc.sched.lock`):

- `npm run typecheck` PASS
- `npm run lint` PASS
- `test:money` `test:capacity` `test:commands` `test:tenant-isolation` `test:size-ratchet` `test:phase1-i18n` `test:scheduling` `test:sessions` `test:reservations` PASS (fail 0)
