# START HERE / Resume Execution

**Program:** Tulala 48 Journeys  
**Plan:** [`PLAN.md`](PLAN.md) — the original 20-task plan (`tulala_48_journeys_program_1f5af7d3`). Do not replace it.  
**Branch:** `cursor/journeys-program-c4d3`  
**Trunk:** `main`. Production is the CI-gated `production` pointer.

## Honest count (this checkpoint)

| Metric | Value |
|---|---|
| Cases verified on the actual platform | **0 / 48** |
| Scenario records passed (CUS/OP/TAL/DIFF/REC) | **0 / ~240** |
| Human QA rows executed | **0 / 16** (blocked on fixture) |
| Isolated schema ready for seed / P1-01 | **No** — `qa-journeys` (`fxlankepwnvelxjrahwk`) still `MIGRATIONS_FAILED`. Replay in progress (~55 historical files applied through `20260413150100`; `talent_profiles` exists; `agencies` / `orders` / `capacity_pools` / `visits` / `pos_shifts` still null). Do not reset the branch. |

Skipped Playwright specs are not passes. Green unit tests and RPC helpers are supporting evidence only.

## Approved scope

Every documented case study functions end to end: customer, operator, applicable talent, difficult combination, money/capacity/fulfilment consistency, recovery. QA is a standing workstream (W-AUDIT), not a gate.

This file tracks P0–P8. P9 stays parked.

## Missing dependency

Isolated preview `qa-journeys` answers SQL. Historical replay is in progress (~55 files through `20260413150100`; `guest_submit_inquiry` is past). `agencies` / `orders` / `capacity_pools` / `visits` / `pos_shifts` are still null. Do not reset or rebase the branch (that replays from zero). Password and `service_role` for the branch still belong in gitignored `web/.env.capacity-isolated.local` — never git.

Product sources are now in [`docs/product/`](../../product/).

## Current state

| Item | Status |
|---|---|
| P0-01 product docs verbatim | Implemented, awaiting focused verification — both files in `docs/product/` |
| P0-02 START-HERE / ledger / decisions / defects | implementing — this checkpoint |
| P0-03 48 case files | Implemented, awaiting focused verification — sampled against Journeys-POS (C01 bridal+station, C06 restaurant, C07 tab, C34 unclaimed seller, C37 gallery, C39 packages). No invented requirements |
| P0-04 five contracts | Implemented → `decisions.md` + decision-log L52–L56. Do not reopen |
| P0-05 db:check + stale docs | Remote applied `20261230000200`–`00600` on `pluhdapdnuiulvxmyspd`. **Do not re-apply to production.** `20261230000700` RPCs are in this branch only until isolated apply |
| P0-06 fixture harness | SQL expanded (two workspaces, catalog, tables/rooms, session, 12-place pool, test notify sink). Apply blocked until isolated schema exists. Guards refuse production / Impronta |
| P0-07 Playwright tablet/mobile + case scaffold | Smoke specs renamed honestly; harness now asserts identity so a login page cannot pass. Still skip until `JOURNEYS_FIXTURE_READY=1` |
| P1-01 isolated capacity proof | Blocked on isolated schema. Script defaults to fixture tenant `3333…`, not Impronta |
| P2-01 type catalog | ~120 searchable types from theme 7.2–7.13 plus case IDs; `custom` outside; accent-fold search; handyman ES `mantenimiento del hogar`; Settings search-to-select |
| P2-04 Sales | Combined read: orders + bookings/reservations/registrations without manufacturing orders |
| P3 POS | F01 expectedVersion on mutate/cancel; F03 cancel RPC; F04 zero-total completion; F07 contact only when `total_cents > 0`; F09 `booking.payment.request`; live POS restyle on `pos-client.tsx`; pickup destination + promised window on Send to prep |
| P4 collection | Point amount-aware refund / `partial_unsupported`; Terminal token alone is not readiness; Stripe Terminal code present, live refund events still ops |
| P5 restaurant engine | C07 tab vs table; prep ready notify + pickup copy; promised-at shown on prep board |
| P6 multi-resource | `reserve_resource_set` RPC preferred; TS unwind remains fallback |
| P7 C39 | `drawdown_lesson_package` RPC; attendance hop admission → order → booking → package; unique consumption key = admission id |
| P8 hybrids | Unchanged. Production reserve stays `createPurchase` holds/capacity |
| W-AUDIT | Isolation unit coverage in. Browser/provider proof waits on fixture |
| P9 | Parked. Do not start |

## Task order (this cycle)

1. Finish isolated schema (schema-only dump from parent into `qa-journeys`, or continue replay past `guest_submit_inquiry` defaults). Confirm `agencies`/`orders`/`capacity_pools`/`visits`/`pos_shifts` by SQL.  
2. Copy branch password + `service_role` into `web/.env.capacity-isolated.local`. `db:push` **only** to qa-journeys. Seed. Set `JOURNEYS_FIXTURE_READY=1` only after verify.  
3. P1-01 200×1 vs 12-place pool. Preserve results before cleanup.  
4. Browser journeys: C06, C01, C12, C02, then ten representatives, then 38 deltas.  
5. P9 stays parked.

## Test commands

```bash
cd web && npm run typecheck && npm run lint
cd web && npm run test:money
# Isolated only — never production:
# JOURNEYS_ISOLATED=1 node --env-file=.env.capacity-isolated.local scripts/seed-journeys-program.mjs
# CAPACITY_PROOF_ISOLATED=1 node --env-file=.env.capacity-isolated.local scripts/verify-capacity-concurrency.mjs
```

Gates: queued scripts only. Never raw `tsc` or `eslint`.

## Blockers

- Isolated `qa-journeys` schema incomplete (`MIGRATIONS_FAILED`; replay past `20260413150100`, 708 files remaining before current engines). `agencies`/`orders`/`capacity_pools`/`visits`/`pos_shifts` still missing.  
- Fixture apply + P1-01 + browser journeys wait on that schema and gitignored secrets.  
- Mercado Pago live charges wait on merchant credentials.  
- Live Stripe `refund.failed` / `refund.updated` endpoint change is ops, not this PR.

## Next action

Repair isolated schema, then seed, then P1-01, then C06/C01/C12/C02 on the real UI. Do not merge #1934 as complete. Do not start P9. Do not re-apply production migrations.

## Owner claim

**Owner:** cloud agent on `cursor/journeys-program-c4d3`  
**Claimed:** 2026-09-08T15:35Z
