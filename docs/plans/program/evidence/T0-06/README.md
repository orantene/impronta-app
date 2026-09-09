# T0-06 — isolated schema state, 2026-09-09

- `journeys:probe` exit 0: every expected function, table, column, index and
  fixture row present; both workspaces and both hosts resolve.
- `journeys:smoke` exit 0 after the read-only block was cleared (see T0-04):
  refusals execute, uniqueness constraints refuse replays, the age-gate check
  refuses a half-filled attestation, `reserve_resource_set` commits one unit,
  and the whole transaction rolls back with `leftover=0`.
- `journeys:audit` exit 1, reporting 56 objects that production has and no
  migration in this repo creates. Two of them matter to this program
  (`agency_taxonomy_settings`, `agency_taxonomy_terms`) and are fixed by a real
  idempotent migration on this branch. The rest are archive tables, the discover
  index and platform theme columns: recorded, out of scope for the journeys work.
