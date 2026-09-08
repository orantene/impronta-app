# START HERE / Resume Execution

**Program:** Tulala 48 Journeys  
**Plan:** [`PLAN.md`](PLAN.md) — the original 20-task plan (`tulala_48_journeys_program_1f5af7d3`). Do not replace it.  
**Audited SHA:** `749737206b6d8890442ab98a325f46d5873b7837`  
**Branch:** `cursor/journeys-program-c4d3`  
**Trunk:** `main`. Production is the CI-gated `production` pointer. Ignore `fix/agency-contact-smoke` and `stable-work`.

## Approved scope

Every documented case study functions end to end: customer, operator, applicable talent, difficult combination, money/capacity/fulfilment consistency, recovery. QA is a standing workstream (W-AUDIT), not a gate.

This file tracks P0–P8. Sequence: **P0**, then **P1 ∥ P2**, then **P3 ∥ P4**, then **P5**, then **P6 ∥ P7**, then **P8** (this checkpoint). P9 outstanding.

## Missing dependency

`docs/product/` does not yet contain the two source documents. See [`docs/product/README.md`](../../product/README.md). Continue on authorized extractions. Do not invent unread requirements.

## Current state

| Item | Status |
|---|---|
| P0-01 product docs verbatim | Blocked: files not in this workspace. README records the gap. |
| P0-02 START-HERE / ledger / decisions / defects | Implemented, awaiting focused verification |
| P0-03 48 case files | Implemented, awaiting focused verification (authorized matrix; check against verbatim docs when they land) |
| P0-04 five contracts | Implemented → `decisions.md` + decision-log L52–L56 |
| P0-05 db:check + stale docs | Instruction docs updated. `db:check` awaiting external verification (no `.env.local`) |
| P0-06 fixture harness | Script + SQL + contract written. Apply awaiting credentials |
| P0-07 Playwright tablet/mobile + case scaffold | Implemented. Journeys skip until `JOURNEYS_FIXTURE_READY=1` |
| P1-01 isolated capacity proof | Awaiting external verification. Script now refuses without `CAPACITY_PROOF_ISOLATED=1` |
| P1-02 paid-order-with-no-seat compensation | Implemented, awaiting focused verification |
| P1-03 expire-orders runner + cron + heartbeat | Implemented, awaiting focused verification |
| P1-04 guest promo input | Implemented, awaiting focused verification |
| P1-05 door settle | Implemented and wired on the Door screen. Awaiting focused verification |
| P1-06 refund effects + Orders desk | Implemented and wired. Awaiting focused verification |
| P1-07 DST collisions operator list | Existing Sessions list proven by static test |
| P2-01…P2-05 type / layers / nav / Sales / Discounts | Implemented on authorized types (~50 of 120). Remaining IDs wait on product docs |
| P3 POS shell + command boundary + `/admin/pos` | Implemented, awaiting focused verification. `submitToPreparation` writes tickets (P5). |
| P4 collection interface + Stripe adapter + MP discovery | Implemented, awaiting focused verification. Terminal unavailable until Point. |
| P5 restaurant engine | Implemented (visits, prep, split allocations, shift cash-up on POS). Apply of `20261230000200` + `20261230000300` awaiting credentials. |
| P6 multi-resource | Implemented (atomic person+station set, space pools, travel buffers, attendance ≠ payment, cross-workspace client privacy). Awaiting focused verification. Apply of `20261230000400` awaiting credentials. Structural CI green on `a3c81529b`. |
| P7 service-business states | Implemented (deliverables + revision limit + passthrough budget, recurring skip-without-ending, service-area fit, quote versions, departure manifest, appointment phases). Awaiting focused verification. |
| P8 hybrids | Implemented, awaiting focused verification. Package component cancel, supervised set, tournament courts (cafe omitted), breakouts, live recording, exclusive kitchen/hire, retreat days + add-on, grooming vs event rooms. |
| W-AUDIT | Standing — tenant check on capacity pool IDs (purchase path refuses before RPC). Isolation: POS, visits (token/QR/floor), hybrid cancel, prep, shifts. Continues. |

## Task order (this cycle)

1. Keep executing the 20 tasks in [`PLAN.md`](PLAN.md).  
2. P0-01 / P1-01 / `db:check` stay awaiting external. Never mark them passed.  
3. P8-01 is in. Next unblocked: **W-AUDIT** (standing) and **P9** (separate outstanding milestone). Do not write a new plan.

## Test commands

```bash
cd web && npm run typecheck && npm run lint
cd web && npm run test:money
cd web && npm run test:events
cd web && npm run test:capacity
cd web && npm run test:sessions
cd web && npm run test:words
# Isolated only — never production:
# CAPACITY_PROOF_ISOLATED=1 node --env-file=.env.capacity-isolated.local scripts/verify-capacity-concurrency.mjs
```

Gates: queued scripts only. Never raw `tsc` or `eslint`. Echo the real exit code from inside the command.

## Blockers

- Product source documents not in this workspace (P0-01).  
- No isolated database for concurrency proof (P1-01) — awaiting owner. Do not run against production.  
- `db:check` / `db:push` need credentials (P0-05 remote half).  
- Fixture apply needs `DATABASE_URL` (P0-06).  
- Vercel preview is red until `npm run db:push`: `prebuild` runs `check-migrations-applied`, and GitHub admin-boot skips that script (`npx next build`). First fail was `6d43677cb` (visits migration). Do not set `SKIP_MIGRATION_DRIFT_CHECK`. 

## Next action

Take the next unblocked task in [`ledger.md`](ledger.md): **W-AUDIT** / **P9**. Do not write a new plan.

## Owner claim

One owner at a time. Stale-claim recovery: if the claim is older than 6 hours and the session is gone, the next session takes the next unblocked task and records the takeover.

**Owner:** cloud agent on `cursor/journeys-program-c4d3`  
**Claimed:** 2026-09-08T11:42Z
