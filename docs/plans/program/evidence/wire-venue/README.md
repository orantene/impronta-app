# wire-venue: Engine Package 3 on the uploaded boards

UI session on `cursor/wire-venue-screens-f891`. Contract:
[`docs/plans/program/engine/venue.md`](../../engine/venue.md). Writers are
imported only from `web/src/lib/server-actions/venue-engine.ts`.

Live frames were not captured in this cloud run (no isolated host in
`agency_domains`). Verdicts below are from the code path, not a screenshot.

| Group | Boards | Verdict |
|---|---|---|
| 1 Locations | W23, POS location chip, per-location modes | **matched** |
| 2 Waitlist | T08, POSWalkIn waitlist | **partial** (no SMS) |
| 3 Layouts | W13, W14, W15, R06, T26 fire | **partial** (pacing / dispatch / money fields stay disabled) |
| 4 Guest QR | Q02–Q07 | **partial** (390 menu + share; Q01 landing unchanged) |
| 5 Events | E03, E05, E11, E12, E14, E15, W17 | **partial** (see fidelity-door) |
| 6 Tickets | E08, E09, E10 | **partial** (`/ticket/[code]` + door transfer/exchange) |
| 7 Devices | POSDevices, POSConnection, POSCounterOffline, W20 | **partial** (pair + cash outbox replay; CollectSheet untouched) |
