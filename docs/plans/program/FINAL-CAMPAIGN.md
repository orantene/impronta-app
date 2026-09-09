# Final verification campaign (after M9)

**Status:** Harness ready. Case count remains **0 / 48** until this campaign is
executed on the isolated `qa-journeys` fixture across desktop organizer, tablet
staff and mobile guest.

Do **not** mark any CS / Cxx case passed from unit tests alone.

## Preconditions

1. Isolated Supabase branch `qa-journeys` / `fxlankepwnvelxjrahwk` only.
2. `JOURNEYS_FIXTURE_READY=1` in gitignored env.
3. Scenario register [`scenario-register-404.md`](scenario-register-404.md) (404 rows).
4. Case matrix [`scenario-matrix.md`](scenario-matrix.md) with CS aliases.
5. Race lanes:
   - `scripts/verify-capacity-concurrency.mjs`
   - `scripts/verify-resource-concurrency.mjs` (stations / seats / tables subjects)

## Procedure

For each of the 404 scenario IDs and each CS-01–CS-48 role set (CUS/OP/TAL/DIFF/REC):

1. Seed prerequisites only.
2. Act through the real interface as the named role.
3. Assert visible result + persisted records.
4. Refresh and reopen linked products.
5. Run the adverse variation.
6. Record scenario ID, related case IDs, revision, environment, redacted IDs, trace.

High-risk combinations listed in the 404 register must all pass.

## Honest checkpoint after this PR

| Metric | Value |
|---|---|
| Cases verified end-to-end | **0 / 48** (QA runs continuously against `qa-journeys`; this is the honest count, not a freeze) |
| Scenarios registered | **404** |
| M0–M9 product work | Landed on branch; campaign still required |

PR #1934 stays draft.
