# START HERE / Resume Execution

**Program:** Tulala 48 Journeys  
**Plan:** [`PLAN.md`](PLAN.md) — the original 20-task plan (`tulala_48_journeys_program_1f5af7d3`). Do not replace it.  
**Branch:** `cursor/journeys-program-c4d3`  
**Trunk:** `main`. Production is the CI-gated `production` pointer.

## Honest count (this checkpoint)

| Metric | Value |
|---|---|
| Cases verified on the actual platform | **0 / 48** |
| Scenario records passed (CUS/OP/TAL/DIFF/REC) | **0 / ~240** — C06 path proofs, C01-CUS *deposit requested*, C09 class paths + C09-DIFF last-seat sold-out, C02-CUS last-resource + couples set, C02-DIFF competitor-after-couples, C12-CUS $0 ticket, C12-OP door Admit, C12-DIFF pay-at-door, C26-OP pickup handoff, C07-OP tab collect-at-close; no complete case. |
| Human QA rows executed | **0 / 16** |
| Isolated schema + SQL fixture on `qa-journeys` | **Yes** — seed applied; staff login on `qa-journeys.local:3103` verified. Set `JOURNEYS_FIXTURE_READY=1` only in gitignored isolated env. |
| P1-01 200 concurrent HTTP reserves | **Pass** — 12 `ok`, 188 `sold_out`. Evidence: `docs/plans/qa-evidence/P1-01/`. Not a browser case. |
| C06-OP walk-in cash | **Pass** on qa-journeys UI + DB. Evidence: `docs/plans/qa-evidence/C06-OP/walk-in-cash.md`. Not QR / courses / split. |
| C06-CUS public menu | **Pass** on qa-journeys storefront + DB. Evidence: `docs/plans/qa-evidence/C06-CUS/public-menu.md`. |
| C06-CUS table reservation | **Pass** on qa-journeys storefront + DB. Evidence: `docs/plans/qa-evidence/C06-CUS/reservation.md`. |
| C06-CUS reserve-then-order | **Pass** on qa-journeys storefront + DB. Evidence: `docs/plans/qa-evidence/C06-CUS/reserve-then-order.md`. C06-CUS basic, not C06 complete. |
| C01-CUS technician deposit | **Pass** as deposit *requested* on qa-journeys `/book` + DB. Evidence: `docs/plans/qa-evidence/C01-CUS/deposit.md`. Charge not collected — isolated Next has no Stripe secret. |
| C09-OP walk-in class | **Pass** on qa-journeys POS + DB. Evidence: `docs/plans/qa-evidence/C09-OP/walk-in-class.md`. Not website register, not attendance. |
| C09-CUS website register | **Pass** on qa-journeys storefront + DB. Evidence: `docs/plans/qa-evidence/C09-CUS/class-register.md`. Not attendance. |
| C09-DIFF last-seat sold-out | **Pass** on qa-journeys storefront + POS + DB. Evidence: `docs/plans/qa-evidence/C09-DIFF/same-pool-sold-out.md`. Website takes the 1-unit Last place pool; POS Collect cash refuses. Not attendance, not C09 complete. |
| C02-CUS last-resource | **Pass** on qa-journeys `/book` + DB. Evidence: `docs/plans/qa-evidence/C02-CUS/last-resource.md`. Massage books Therapist B; Couples refuses. |
| C02-CUS couples set | **Pass** on qa-journeys `/book` + DB. Evidence: `docs/plans/qa-evidence/C02-CUS/couples-set.md`. T1 + T2 + Room A held together. Not C02 complete. |
| C02-DIFF competitor-after-couples | **Pass** on qa-journeys `/book` + DB. Evidence: `docs/plans/qa-evidence/C02-DIFF/competitor-after-couples.md`. Couples holds the set; Massage slot on that window is hidden. |
| C12-CUS $0 night ticket | **Pass** on qa-journeys `/events/qa-night` + DB. Evidence: `docs/plans/qa-evidence/C12-CUS/ticket.md`. Paid 0 / admission minted / seat committed. Not card, not door. |
| C12-OP door Admit | **Pass** on qa-journeys `/admin/events/door` + DB. Evidence: `docs/plans/qa-evidence/C12-OP/door.md`. Walk-up Admit; `admitted_count=1` + `seated_at`. Not QR. |
| C12-DIFF pay-at-door | **Pass** on qa-journeys `/events/qa-night` + `/admin/events/door` + DB. Evidence: `docs/plans/qa-evidence/C12-DIFF/pay-at-door.md`. $20 hold blocks competitor; Cash settle commits seat + mints admission. Not card, not QR, not C12 complete. |
| C26-OP pickup handoff | **Pass** on qa-journeys POS + Preparation + DB. Evidence: `docs/plans/qa-evidence/C26-OP/pickup-handoff.md`. Cash pizza, pickup window, Mark ready, Confirm handoff. Not Friday stock, not C26-CUS. |
| C07-OP tab collect-at-close | **Pass** on qa-journeys Tables + POS + DB. Evidence: `docs/plans/qa-evidence/C07-OP/collect-at-close.md`. Open tab ≠ Open visit; unpaid Close refused; cash pizza; Close visit. Not guest tab, not booth. |

Skipped Playwright specs are not passes. Green unit tests and RPC helpers are supporting evidence only.

## Approved scope

Every documented case study functions end to end: customer, operator, applicable talent, difficult combination, money/capacity/fulfilment consistency, recovery. QA is a standing workstream (W-AUDIT), not a gate.

This file tracks P0–P8. P9 stays parked.

## Missing dependency

Isolated preview `qa-journeys` (`fxlankepwnvelxjrahwk`) answers SQL. Historical replay finished (763 files). Cheap-repair recorded some versions without function bodies; `reserve_capacity` / `upsert_capacity_pool` / `reserve_capacity_batch`, `reserve_resource_set` (hold-only sets), POS money-spine columns, appointment hours, `booking_transactions`, `btree_gist` / `talent_holds_firm_no_overlap` / expire reaper, `reserve_resource_set` EXCEPTION unwind, `public.events` (plus `sessions.event_id`, ticket columns on `talent_offering_variants`, `admissions.line_seq`, `sessions_select_public`, door columns on `admissions`, `check_in`) were repaired on **qa-journeys only** via MCP DDL. **Do not reset or rebase** the branch (that replays from zero). **Do not re-apply** `20261230000700` or these repairs to production (`pluhdapdnuiulvxmyspd`). Production already has the gist constraint, `events`, and `check_in`. C12 fixture is in `seed_journeys_program.sql`; C12-CUS $0 ticket, C12-OP door Admit, and C12-DIFF pay-at-door cash settle are recorded.

SQL fixture is applied: two workspaces (`3333…3333` / `3333…3334`), hosts `qa-journeys.local` / `qa-journeys-b.local`, venue + table/room, Gel / pizza / class / reservation plus Therapist B, Massage, Couples (T1+T2+Room A), morning session, 12-place `session_tier` pool, Room A 1-unit `space` pool. Five auth users + owner/viewer/B-owner memberships + two talent profiles + customer row exist on that branch.

Password and `service_role` for the branch belong in gitignored `web/.env.capacity-isolated.local` — never git. P1-01 used those isolated credentials against qa-journeys only.

Product sources are in [`docs/product/`](../../product/).

## Current state

| Item | Status |
|---|---|
| P0-01 product docs verbatim | Implemented, awaiting focused verification — both files in `docs/product/` |
| P0-02 START-HERE / ledger / decisions / defects | implementing — this checkpoint |
| P0-03 48 case files | Implemented, awaiting focused verification — sampled against Journeys-POS. Browser still not started |
| P0-04 five contracts | Implemented → `decisions.md` + decision-log L52–L56. Do not reopen |
| P0-05 db:check + stale docs | Remote applied `20261230000200`–`00600` on `pluhdapdnuiulvxmyspd`. **Do not re-apply to production.** `20261230000700` RPCs are on this branch and on qa-journeys, not production |
| P0-06 fixture harness | SQL + auth users applied. Isolated-app login on `qa-journeys.local:3103` verified. Set `JOURNEYS_FIXTURE_READY=1` only in gitignored isolated env. Guards refuse production / Impronta |
| P0-07 Playwright tablet/mobile + case scaffold | Smoke specs still skip unless the isolated env flag is set. C06 restaurant paths, C01-CUS deposit-requested, C09 class paths + C09-DIFF, C02-CUS last-resource + couples set, C02-DIFF, C12-CUS $0 ticket, C12-OP door Admit, C12-DIFF pay-at-door, C26-OP pickup handoff, and C07-OP tab collect-at-close are real journeys. |
| P1-01 isolated capacity proof | Verified in test environment: 200 HTTP callers, exactly 12 wins, zero oversell. See `qa-evidence/P1-01/` |
| P2-01 type catalog | ~120 searchable types; `custom` outside; accent-fold search; handyman ES `mantenimiento del hogar` |
| P2-04 Sales | Combined read: orders + bookings/reservations/registrations without manufacturing orders |
| P3 POS | F01 expectedVersion on mutate/cancel; F03 cancel RPC; F04 zero-total completion; F07 contact only when `total_cents > 0`; F09 `booking.payment.request`; live POS on `pos-client.tsx`; pickup destination + promised window |
| P4 collection | Point amount-aware refund / `partial_unsupported`; Terminal token alone is not readiness; live refund events still ops |
| P5 restaurant engine | C07-OP tab collect-at-close proven; prep ready notify + pickup copy; promised-at shown on prep board |
| P6 multi-resource | `reserve_resource_set` RPC preferred; TS unwind remains fallback. qa-journeys gist + RPC EXCEPTION now deletes earlier holds on `slot_taken`. |
| P7 C39 | `drawdown_lesson_package` RPC; attendance hop admission → order → booking → package |
| P8 hybrids | Unchanged. Production reserve stays `createPurchase` holds/capacity |
| W-AUDIT | Isolation unit coverage in. Browser paths: C06 restaurant paths; C01-CUS deposit requested (not collected); C09 class paths + C09-DIFF last-seat sold-out; C02-CUS last-resource + couples set; C02-DIFF; C12-CUS $0 ticket; C12-OP door Admit; C12-DIFF pay-at-door cash settle; C26-OP pickup handoff; C07-OP tab collect-at-close. |
| P9 | Parked. Do not start |

## Task order (this cycle)

1. Continue browser journeys on qa-journeys: C01 paid deposit (needs Stripe test keys), C02-OP / TAL / REC, then remaining representatives, then 38 deltas. C06 DIFF / complete restaurant path (QR, courses, split) still open. C09 attendance / REC still open. C12-CUS $0 ticket, C12-OP walk-up Admit, and C12-DIFF cash settle are recorded; card ticket and QR scan are not. C07-OP tab collect-at-close is recorded; guest tab / booth / performer fee are not.  
2. Keep `JOURNEYS_FIXTURE_READY=1` in the gitignored isolated env only.  
3. P9 stays parked.

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

- Browser journeys need the Next app on the isolated URL + host `qa-journeys.local` (production `agency_domains` does not include that host; a `*.vercel.app` preview still 404s).  
- Mercado Pago live charges wait on merchant credentials.  
- Live Stripe `refund.failed` / `refund.updated` endpoint change is ops, not this PR.

## Next action

C06 restaurant paths, C01-CUS deposit-requested, C09 class paths + C09-DIFF last-seat sold-out, C02-CUS last-resource + couples set, C02-DIFF, C12-CUS $0 ticket, C12-OP door Admit, C12-DIFF pay-at-door cash settle, C26-OP pickup handoff, and C07-OP tab collect-at-close are recorded. Next: Stripe test deposit collect, C02-OP assign (Calendar New booking does not pick therapist + room), C01-OP balance, or remaining representatives (C08, C13, C24, C27, C31). Do not merge #1934 as complete. Do not start P9. Do not re-apply production migrations. Do not reset the qa-journeys branch.

## Owner claim

**Owner:** cloud agent on `cursor/journeys-program-c4d3`  
**Claimed:** 2026-09-08T17:15Z
