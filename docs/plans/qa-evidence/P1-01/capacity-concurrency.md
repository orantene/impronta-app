# P1-01 / D-005 — isolated capacity concurrency

**Status:** verified in test environment (qa-journeys PostgREST, not the Next.js UI)  
**When:** 2026-09-08T17:20Z  
**Target:** `fxlankepwnvelxjrahwk` only. Never production.  
**Command:** `CAPACITY_PROOF_ISOLATED=1 node --env-file=.env.capacity-isolated.local scripts/verify-capacity-concurrency.mjs`

## Result

| Check | Value |
|---|---|
| Callers | 200 concurrent `reserve_capacity` HTTP RPCs |
| Pool size | 12 |
| Elapsed | 1143 ms |
| Replies | `ok` 12, `sold_out` 188 |
| Ground truth live allocations | 12 |
| Units held | 12 |
| `capacity_remaining_public` | 0 |
| Oversell | none |
| Cleanup | throwaway pool deleted; 0 leftover allocation rows |

Throwaway pool id `75ee2524-a986-475f-8d82-2806a15c08b6` was created under fixture tenant `33333333-3333-4333-8333-333333333333` with `pool_key=concurrency-proof` and removed after the read.

## Not claimed

This is not a browser journey. Case count stays 0/48. The seeded 12-place `session_tier` pool was not used; after this run it still has remaining 12 and 0 holds.

`JOURNEYS_FIXTURE_READY` stays unset until a verified login on the isolated app host.
