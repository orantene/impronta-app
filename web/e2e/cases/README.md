# Case-journey specs

One file per case. The ten representatives get the complete journey.
The other 38 add a delta spec over a shared fixture.

Fixtures prepare state (`npm --prefix web run seed:journeys-program`).
The browser performs the business action. Inserting a booking row is not proof.

Projects: `chromium` (desktop), `tablet-pos`, `mobile-checkout`.
Set `JOURNEYS_FIXTURE_READY=1` after the seed has been applied.
