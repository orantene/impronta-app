# START HERE / Resume Execution

**Program:** Tulala 48 Journeys  
**Plan:** [`PLAN.md`](PLAN.md) — the original 20-task plan (`tulala_48_journeys_program_1f5af7d3`). Do not replace it.  
**Branch:** `cursor/journeys-program-c4d3`  
**Trunk:** `main`. Production is the CI-gated `production` pointer.

## Honest count (this checkpoint)

| Metric | Value |
|---|---|
| Cases verified on the actual platform | **0 / 48** |
| Scenario records passed (CUS/OP/TAL/DIFF/REC) | **0 / ~240** — C06 path proofs, C01-CUS *deposit requested*, C09 class paths + C09-DIFF last-seat sold-out, C02-CUS last-resource + couples set, C02-DIFF competitor-after-couples, C12-CUS $0 ticket, C12-OP door Admit, C12-DIFF pay-at-door, C26-OP pickup handoff, C07-OP tab collect-at-close, C07-CUS guest check, C08-CUS directory inquiry submitted, C08-OP talent assigned + draft + sent offer, C08-TAL talent approved (client still pending); no complete case. |
| Human QA rows executed | **0 / 16** |
| Isolated schema on `qa-journeys` | **Verified 2026-09-09T04:10Z** — `npm run journeys:probe` exit 0, `npm run journeys:smoke` 10/10. Previously 16 objects were missing; see [`qa-evidence/schema-drift/isolated-branch-repair.md`](../qa-evidence/schema-drift/isolated-branch-repair.md). |
| SQL fixture on `qa-journeys` | **Workspace A yes, workspace B identity only.** A has catalog / spaces / sessions / pools; B has an `agencies` row, an active host and an owner and **zero** fixture rows. Staff login on `qa-journeys.local:3103` verified. Set `JOURNEYS_FIXTURE_READY=1` only in gitignored isolated env. |
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
| C07-CUS guest check | **Pass** on qa-journeys `/visit/<token>` + DB. Evidence: `docs/plans/qa-evidence/C07-CUS/guest-check.md`. Guest reads staff-opened tab; ended after Close. Guest cannot open a tab. |
| C08-CUS directory inquiry | **Pass** as inquiry *submitted* on qa-journeys `/directory` chat + DB. Evidence: `docs/plans/qa-evidence/C08-CUS/directory-inquiry.md`. Offer not accepted. |
| C08-OP assign + draft offer | **Pass** as talent *invited* + offer *draft* on qa-journeys `/admin/messages` + DB. Evidence: `docs/plans/qa-evidence/C08-OP/assign-and-draft-offer.md`. |
| C08-OP send offer | **Pass** as offer *sent* ($800) on qa-journeys `/admin/messages` + DB. Evidence: `docs/plans/qa-evidence/C08-OP/send-offer.md`. Offer not accepted. |
| C08-TAL accept offer | **Pass** as talent *approved* on qa-journeys `/talent/inbox` + DB. Evidence: `docs/plans/qa-evidence/C08-TAL/accept-offer.md`. Client still pending; offer still sent. |

Skipped Playwright specs are not passes. Green unit tests and RPC helpers are supporting evidence only.

## Approved scope

Every documented case study functions end to end: customer, operator, applicable talent, difficult combination, money/capacity/fulfilment consistency, recovery. QA is a standing workstream (W-AUDIT), not a gate.

This file tracks P0–P8. P9 stays parked.

**Which QA model governs.** The standing-workstream model above. A separate seven-blueprint parity plan was drafted with a "frozen QA" execution model, and its own developer review struck that model out; browser audit, code audit and integration testing run continuously, as `PLAN.md` L194 already said. If a document tells you to freeze verification until a milestone completes, it is the superseded draft.

## Blueprint parity work now on this branch

Twenty-two commits landed 2026-09-09 between 01:46Z and 04:09Z, after this file's previous checkpoint. **None of it is browser-verified.** It is on the branch, typechecks, lints, and passes its unit lanes; that is all that is claimed:

| Area | Landed | Verified how far |
|---|---|---|
| Event day | wrong-night ticket refused at the door; event cancellation cascades to sessions, pools, admissions and refunds (`cancel_event_cascade`) | unit + isolated smoke |
| Refund correctness | every `refund_admission` reply classified instead of logged-and-continued; `lineStateIncomplete` reported; money-safe `resumeRefundEffects` retry | unit (`test:money`) |
| POS | add-ons charged rather than only recorded; one booking shell per order on the card path; POS reads split out of `draft.ts` | unit |
| Purchase | age gates enforced server-side (`orders_age_gate_*` + paired CHECK) | unit + isolated smoke |
| Kept promises | real iCal subscription replaces the two-way sync mock; `/api/account/export` | unit; **not** checked against a real host |
| Platform | command envelope + transactional outbox (`command_idempotency`, `outbox_messages`, `claim_outbox_messages`); Exceptions inbox over the five silent-failure sources | unit + isolated smoke; **no** integration proof through a real command path |
| Design system | Tabs / Table / Dialog primitives, `ImpactPreview`, component catalog, `SearchOrCreatePicker`, axe-core CI lane, admin + POS bundle budgets | CI lanes (`test:design-system`, `test:axe`, `perf:app-budget`) |
| Web | menu board refreshes after paint like the other islands | unit |

Open M0 items, unchanged by the above: reserve-set unknown-outcome double reservation; POS reserved-outstanding, where two cashiers can each collect the full balance; safe-exchange reschedule; `talent_booking_hours` missing for every bookable offering, so public booking returns `no_booking_hours`.

## Isolated branch state (verify, do not trust this paragraph)

Isolated preview `qa-journeys` (`fxlankepwnvelxjrahwk`) answers SQL over both PostgREST and `DATABASE_URL`.

**The ledger on that branch is not evidence.** `supabase_migrations.schema_migrations` holds 763 rows up to `20261230000700` while objects belonging to versions *inside* that range did not exist: the historical replay recorded versions whose function bodies never ran. Anything that diffs local files against that table will report "in sync" over a schema missing functions the journeys call. `npm run check:migrations-applied` is separately blind here — it calls `list_applied_migrations`, which was itself never replayed, so it returns an error rather than a state.

So the branch has its own checks, and they are the evidence:

| Command | What it proves |
|---|---|
| `npm run journeys:probe` | Presence of a **curated** critical set, read-only. Counts fixture rows **per workspace**. Necessary and, on its own, weak — see below. |
| `npm run journeys:smoke` | Behaviour. Calls the functions inside one always-rolled-back transaction and asserts the structured refusals the TypeScript callers are written against. |
| `npm run journeys:audit` | **Completeness.** Derives what to expect from all 770 migration files *and* from `database.types.ts`, rather than from a list someone wrote. |
| `npm run journeys:repair <files…>` | Replays named migration files. Takes an explicit list because "pending" is not computable from a ledger that lies. |

**Do not take a green probe as a healthy branch.** The probe went green at 04:10Z and the branch was still missing 588 objects across 248 migrations; the dev server found six of them by crashing on them. A curated list proves what its author remembered. `journeys:audit` is the completeness check and it is the one to trust.

State at 2026-09-09T04:45Z: probe exit 0, smoke 10/10, P1-01 re-run 12 of 200 with zero oversell, the migration corpus replayed to a fixed point (588 → **99** remaining, causes in D-017), and the isolated storefront serving 200 with **zero** schema errors and zero verb-destination warnings. Full record: [`qa-evidence/schema-drift/isolated-branch-repair.md`](../qa-evidence/schema-drift/isolated-branch-repair.md).

Two defects came out of making this checkable, both of which shipped past every unit lane:

- **D-015 / D-016 are real product bugs**, not QA-environment noise. `cms_pages.blocks` is a column production has and no migration creates, so on any repo-built database every reserve button fell back to the chat cue. And the age-gate triple was assembled from three expressions that disagreed, so a buyer who confirmed their age could be refused with "Could not start the order". Both were invisible until the schema reached an environment the code actually runs in.
- **D-014 is the structural one: this repo cannot rebuild its own production schema.** 58 objects exist in `database.types.ts` with no migration behind them. Absence of a migration is not evidence a column is unused.

**Do not reset or rebase** the branch (that replays from zero). **Do not re-apply** `20261230000700` or the twelve replayed files to production (`pluhdapdnuiulvxmyspd`). Production already has the gist constraint, `events`, `check_in`, `engine_send_offer`, and `engine_submit_approval`.

Fixture, as counted rather than as claimed. **Workspace A** (`3333…3333`, host `qa-journeys.local`): venue + table/room, Gel / pizza / class / reservation plus Therapist B, Massage, Couples (T1+T2+Room A), morning session, 12-place `session_tier` pool, Room A 1-unit `space` pool — 2 spaces, 7 offerings, 3 sessions, 6 pools, 42 customers, 49 orders. C12 fixture is in `seed_journeys_program.sql`. **Workspace B** (`3333…3334`, host `qa-journeys-b.local`): an `agencies` row, an active domain and an owner membership, and nothing else — zero spaces, offerings, sessions, pools, customers and orders. That is enough for the negative isolation direction and not enough for any case where B must transact (D-011). Five auth users + owner/viewer/B-owner memberships + two talent profiles exist.

Password and `service_role` for the branch belong in gitignored `web/.env.capacity-isolated.local` — never git. P1-01 used those isolated credentials against qa-journeys only.

Product sources are in [`docs/product/`](../../product/).

## Current state

| Item | Status |
|---|---|
| P0-01 product docs verbatim | Implemented, awaiting focused verification — both files in `docs/product/` |
| P0-02 START-HERE / ledger / decisions / defects | implementing — this checkpoint |
| P0-03 48 case files | Implemented, awaiting focused verification — sampled against Journeys-POS. Browser still not started |
| P0-04 five contracts | Implemented → `decisions.md` + decision-log L52–L56. Do not reopen |
| P0-05 db:check + stale docs | Remote applied `20261230000200`–`00600` on `pluhdapdnuiulvxmyspd`. **Do not re-apply to production.** `20261230000700`–`001300` are on this branch and on qa-journeys, not production. `db:check` cannot see qa-journeys at all (D-012); use `journeys:probe` |
| P0-06 fixture harness | Workspace A seeded and verified; workspace B is identity-only (D-011). Isolated-app login on `qa-journeys.local:3103` verified. Set `JOURNEYS_FIXTURE_READY=1` only in gitignored isolated env. Guards refuse production / Impronta |
| P0-07 Playwright tablet/mobile + case scaffold | Smoke specs still skip unless the isolated env flag is set. C06 restaurant paths, C01-CUS deposit-requested, C09 class paths + C09-DIFF, C02-CUS last-resource + couples set, C02-DIFF, C12-CUS $0 ticket, C12-OP door Admit, C12-DIFF pay-at-door, C26-OP pickup handoff, C07-OP tab collect-at-close, C07-CUS guest check, C08-CUS directory inquiry submitted, C08-OP assign + draft + sent offer, and C08-TAL talent approve (client still pending) are real journeys. |
| P1-01 isolated capacity proof | Verified in test environment: 200 HTTP callers, exactly 12 wins, zero oversell. See `qa-evidence/P1-01/` |
| P2-01 type catalog | ~120 searchable types; `custom` outside; accent-fold search; handyman ES `mantenimiento del hogar` |
| P2-04 Sales | Combined read: orders + bookings/reservations/registrations without manufacturing orders |
| P3 POS | F01 expectedVersion on mutate/cancel; F03 cancel RPC; F04 zero-total completion; F07 contact only when `total_cents > 0`; F09 `booking.payment.request`; live POS on `pos-client.tsx`; pickup destination + promised window |
| P4 collection | Point amount-aware refund / `partial_unsupported`; Terminal token alone is not readiness; live refund events still ops |
| P5 restaurant engine | C07-OP tab collect-at-close proven; prep ready notify + pickup copy; promised-at shown on prep board |
| P6 multi-resource | `reserve_resource_set` RPC preferred; TS unwind remains fallback. qa-journeys gist + RPC EXCEPTION now deletes earlier holds on `slot_taken`. |
| P7 C39 | `drawdown_lesson_package` RPC; attendance hop admission → order → booking → package |
| P8 hybrids | Unchanged. Production reserve stays `createPurchase` holds/capacity |
| W-AUDIT | Isolation unit coverage in. Browser paths: C06 restaurant paths; C01-CUS deposit requested (not collected); C09 class paths + C09-DIFF last-seat sold-out; C02-CUS last-resource + couples set; C02-DIFF; C12-CUS $0 ticket; C12-OP door Admit; C12-DIFF pay-at-door cash settle; C26-OP pickup handoff; C07-OP tab collect-at-close; C07-CUS guest check; C08-CUS directory inquiry submitted; C08-OP talent invited + draft + sent offer; C08-TAL talent approved (client still pending; not accepted). |
| P9 | Parked. Do not start |

## Task order (this cycle)

1. Continue browser journeys on qa-journeys: C01 paid deposit (needs Stripe test keys), C02-OP / TAL / REC, then remaining representatives, then 38 deltas. C06 DIFF / complete restaurant path (QR, courses, split) still open. C09 attendance / REC still open. C12-CUS $0 ticket, C12-OP walk-up Admit, and C12-DIFF cash settle are recorded; card ticket and QR scan are not. C07-OP collect-at-close and C07-CUS guest check are recorded; guest cannot open a tab; booth / performer fee are not. C08-CUS inquiry submitted, C08-OP talent + draft + sent offer, and C08-TAL talent approve recorded; client accept not run.  
2. Keep `JOURNEYS_FIXTURE_READY=1` in the gitignored isolated env only.  
3. P9 stays parked.

## Test commands

```bash
cd web && npm run typecheck && npm run lint
cd web && npm run test:money
# Isolated only — never production. Each refuses a non-qa-journeys target
# before opening a socket:
cd web && npm run journeys:audit    # completeness — trust this one
cd web && npm run journeys:probe    # presence of the curated critical set
cd web && npm run journeys:smoke    # behaviour, always rolled back
# The isolated app, which is how the CMS/settings drift was found at all:
#   set -a && . ./.env.capacity-isolated.local && set +a && PORT=3008 npm run dev
#   (host proxy on 3103 rewrites Host to qa-journeys.local)
# npm run journeys:repair 20261230001300_command_envelope_and_outbox.sql
# npm run seed:journeys-program
# CAPACITY_PROOF_ISOLATED=1 node --env-file=.env.capacity-isolated.local scripts/verify-capacity-concurrency.mjs
```

Gates: queued scripts only. Never raw `tsc` or `eslint`.

## Blockers

- Browser journeys need the Next app on the isolated URL + host `qa-journeys.local` (production `agency_domains` does not include that host; a `*.vercel.app` preview still 404s).  
- Mercado Pago live charges wait on merchant credentials.  
- Live Stripe `refund.failed` / `refund.updated` endpoint change is ops, not this PR.

## First browser run on the repaired branch

The isolated app now runs clean — storefront 200, no schema errors, no verb-destination warnings — so browser journeys are possible again. C06 was run first and is **4 of 6 on chromium**:

| C06 test | Result |
|---|---|
| C06-CUS smoke (reachability, not a journey) | pass |
| C06-CUS public menu → send → Sales and DB agree | **pass** (after correcting the test — see below) |
| C06-CUS reservation: reserve_table → hold | fail — D-018, no slots offered |
| C06-CUS reserve-then-order | fail — D-018, same cause |
| C06-OP smoke (reachability, not a journey) | pass |
| C06-OP walk-in cash → collect | **pass** (after fixing D-019 — three stacked money faults) |

**The public-menu test had been passing against a broken storefront, and one of its assertions was a money lie.** It asserted the $18 pizza order was `paid` when nothing had been collected; the fixture seeds House pizza as `reserve_mode: 'full'`, so `pending_payment` is correct. Its name field locator also only worked while the class block was failing to render. Both corrected in d7c88aea0. This is the second time this week that repairing the environment revealed an assertion that was agreeing with a bug — worth assuming there are more.

C06 is not marked done: 0/48 stands, because a case needs its customer, operator and talent steps to pass.

## Next action

Finish C06 by closing D-018, then take the blueprint-parity commits, which still have **no browser evidence** at all: the event cancel-cascade refund path, the age gate at purchase (now that D-016 is fixed and the constraint is live there), POS add-on charging, and the Exceptions inbox against the outbox.

D-018 is not a fixture gap: a restaurant table is space-and-service-period availability, but the only availability source wired to the storefront block is `talent_booking_hours`, keyed on a talent profile the offering does not have. That is the same shape as `m0-appointments-dead`, and both C06-CUS reservation failures are that one cause.

### What D-019 cost, and what it says about the rest

D-019 was filed as "never shows `payment: paid`" and looked like a label bug. It was three stacked faults, each of which alone made POS cash and the event door **unable to record money at all** — the cashier takes the note, the order stays unpaid with the full amount outstanding, and the only signal is a generic "Could not record the cash."

1. The booking shell was private to the POS **card** path. The cash branch returned before reaching it, so `settleAtDoor` inserted `booking_transactions` with a null `booking_id` and the scope trigger refused the row.
2. `settleAtDoor` inserted `status: 'paid'`, which the transition trigger forbids on INSERT — only `draft` is legal.
3. `20260906100000_phase_8_corrective_hardening.sql` had reverted the off-platform receiver exemption (D-021), so cash was required to name a Stripe payout destination. There are zero `payout_accounts` rows on this workspace, which is the normal state for a venue that only takes cash.

Two lessons worth carrying into the remaining milestones. **A path with no happy-path test is not covered by having refusal tests** — `settle-at-door.test.ts` had three tests, all of them early refusals, and all three passed throughout. **A migration that re-creates a function silently owns every line of it**, so a body re-emitted to add one transition can drop an unrelated clause with nothing flagging it; there is no gate for this today.

Two open schema items sit behind all of it: D-017's 99 residual objects (taxonomy, profile fields, `agency_bookings.balance_due_at`, the publicly-listed triggers) and D-014's 58 unmigrated production objects. Neither blocks the storefront; both will block specific cases.

Still open from before: C08-CUS client accept / convert, Stripe test deposit collect, C02-OP assign (Calendar New booking does not pick therapist + room), C01-OP balance, remaining representatives (C13, C24, C27, C31).

Standing rules: **0 / 48 stays 0 / 48** until a case's customer, operator, talent, persistence and recovery steps all pass. Do not merge #1934 and do not take it out of draft. Do not start P9. Do not re-apply production migrations. Do not reset the qa-journeys branch.

## Owner claim

**Owner:** cloud agent on `cursor/journeys-program-c4d3`  
**Claimed:** 2026-09-09T04:15Z
