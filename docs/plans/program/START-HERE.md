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
| P0-05 db:check + stale docs | Instruction docs updated. Remote applied `20261230000200`–`00600` on `pluhdapdnuiulvxmyspd`. |
| P0-06 fixture harness | Script + SQL + contract written. Apply still needs an isolated prospect tenant (`DATABASE_URL`). Do not seed Impronta live. |
| P0-07 Playwright tablet/mobile + case scaffold | Implemented. All 48 case spec files exist; they skip until `JOURNEYS_FIXTURE_READY=1`. |
| P1-01 isolated capacity proof | Awaiting owner. No isolated branch. Never production. |
| P2-01…P2-05 type / layers / nav / Sales / Discounts | Implemented on authorized types (~50 of 120). Remaining IDs wait on product docs (P0-01). |
| P3 POS shell + command boundary + `/admin/pos` | Implemented, awaiting focused verification. `submitToPreparation` writes tickets (P5). Collect holds the class's `session_tier` pool (same as the guest picker) without `createPurchase`. Upcoming scheduled classes on the counter are this tenant's. |
| P4 collection interface + Stripe adapter + MP Point adapter | Stripe Checkout + cash. Mercado Pago Point adapter maps Orders API; without credentials `terminalAvailability` is `point_not_landed`. Live charges wait on owner credentials. |
| P5 restaurant engine | Implemented (visits including bar `tab` vs table, prep, ready notify, split allocations, shift cash-up). Remote schema applied. |
| P6 multi-resource | Implemented. Awaiting focused verification. |
| P7 service-business states | Implemented plus C37 gallery selection and C39 lesson-package drawdown. Awaiting focused verification. |
| P8 hybrids | Implemented. Production reserve stays `createPurchase` `holds[]`/`capacity[]`. |
| W-AUDIT | Standing. Isolation tests in. Browser/provider proof waits on fixture. D-007 closed. |
| P9 | Parked. Separate outstanding milestone. Do not start. |

## Task order (this cycle)

1. Keep executing the 20 tasks in [`PLAN.md`](PLAN.md). Do not rebuild P0–P8 engines.  
2. P0-01 / P1-01 / fixture apply stay owner-blocked. Never mark them passed without evidence.  
3. P9 stays parked. Owner-queued credentials (MP live, Stripe refund events, Meta/TikTok, MX/SPF, Sentry, real-card) stay parked.  
4. Next unblocked: W-AUDIT browser once `JOURNEYS_FIXTURE_READY=1`.

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
- Fixture apply needs `DATABASE_URL` on an isolated prospect tenant (P0-06). Do not seed Impronta live.  
- Browser journeys skip until `JOURNEYS_FIXTURE_READY=1`.  
- Mercado Pago live charges wait on merchant credentials. 

## Next action

Take the next unblocked task in [`ledger.md`](ledger.md): **W-AUDIT** browser after fixture apply. Do not start P9. Do not write a new plan.

## Owner claim

One owner at a time. Stale-claim recovery: if the claim is older than 6 hours and the session is gone, the next session takes the next unblocked task and records the takeover.

**Owner:** cloud agent on `cursor/journeys-program-c4d3`  
**Claimed:** 2026-09-08T13:30Z
