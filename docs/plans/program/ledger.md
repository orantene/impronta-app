# Program ledger — one tracker

This merges three sets of task ids into one table:

- **T-ids** — this takeover session's own task board. Only `T0` was found, with evidence
  sub-items `T0-04` and `T0-06` under `docs/plans/program/evidence/`. `T1`–`T7` are
  **unverified**: no file, commit, or evidence directory in this worktree names them.
  What would verify them: the session or person who assigned `T0`–`T7` supplying the
  missing items, or a search of their own working notes outside this repo.
- **P/M-ids and W-AUDIT** — the fired developer's task ids, defined in `PLAN.md` and
  tracked (before this merge) in this file. Status and evidence here are carried over
  verbatim from that source; this merge does not re-verify them.
- **POS-ids** — the design program's task ids, defined in `pos/execution-plan.md` on the
  (unpushed, local) `docs/pos-program-2026-09` branch. **Application implementation of
  the POS program is NOT authorized yet** — these rows describe planned work, not
  completed work, unless a status says otherwise.

Do not invent statuses. Where a row's real status could not be read from a source
document, it says "unverified" and names what would verify it.

Claim stale after 6 hours if the session is gone. Shared schema/service changes name a
single coordinating task.

## This session's own tasks (T-ids)

| ID | What | Owner-area | Status | Evidence | Also known as |
|---|---|---|---|---|---|
| T0 | Prove the isolated QA runtime is real (three `staging-qa-*` hosts, bound to the candidate branch, isolated database only) | qa-harness | verified in test environment | `evidence/T0-04/README.md` | — |
| T0-04 | Runtime binding proof: hosts, Vercel Authentication + bypass header, cookie proof, C01 operator smoke pass, PERM-cross-workspace 5/5 | qa-harness | verified in test environment | `evidence/T0-04/README.md` | — |
| T0-06 | Isolated schema state: `journeys:probe` exit 0, `journeys:smoke` exit 0, `journeys:audit` exit 1 (reported 56 objects at the time; re-run 2026-09-09 during this merge reported 54 — see D-103) | migrations / qa-harness | in active audit | `evidence/T0-06/README.md` | D-014, D-103 |
| T1–T7 | Unverified | unverified | unverified | none found | — |

## Fired developer's tasks (P/M-ids, W-AUDIT)

Statuses as recorded in the source ledger before this merge. Full detail and dated
claims: `START-HERE.md`, `defects.md`, `cases/`. "Also known as" links a row only where
a POS-id or T-id names the same concrete piece of work; most rows have none, because the
POS program has not started implementation.

| ID | What | Owner-area | Status | Evidence | Also known as |
|---|---|---|---|---|---|
| P0-01 | Source product documents verbatim under `docs/product/` | docs | implemented, awaiting focused verification | `Tulala-Business-Journeys-POS.md`, `Business-specific-labels-Workspace-Theme.md` | — |
| P0-02 | START-HERE / ledger / decisions / defects checkpoint | docs | implementing | this file, `START-HERE.md` | — |
| P0-03 | 48 case files | docs / cases | implemented, awaiting focused verification | `cases/` | — |
| P0-04 | Five shared contracts (visit/order/payment/allocation/preparation; POS command; resource coordination; refund effects; theme layers) | docs / architecture | implemented, awaiting focused verification | `decisions.md`, decision-log L52–L56 | — |
| P0-05 | db:check + stale docs; migration range on production | migrations / docs | implemented, awaiting focused verification | `20261230000200`–`00600` on production; full local range `20261230000200`–`20261230002200` (21 files); `20261231*` reserved, no files yet | POS-1.1b (isolated schema apply, not yet run) |
| P0-06 | Fixture harness: workspaces A and B seeded and verified | fixture | verified in test environment | `seed_journeys_program.sql`, D-011 | — |
| P0-07 | Playwright tablet/mobile + case scaffold | qa-harness | implemented, awaiting focused verification | `e2e/cases/` | POS-1.3 (device-size verification, not yet run) |
| W-AUDIT | Standing QA workstream: isolation coverage across POS, visits, hybrid, prep, shifts; schema drift found and closed (D-012) | qa-harness | implementing | `qa-evidence/`, `defects.md` | POS-8 (Continuous QA extension, not yet started) |
| P1-01 | Isolated capacity proof: 200 concurrent HTTP `reserve_capacity` vs 12-unit pool | capacity | verified in test environment | `qa-evidence/P1-01/` | — |
| P1-02 | Compensation for a paid order that lost its seat (`ticket_refund_intents`) | orders | implementing | `capacity-lost-compensation.ts`, D-001 | — |
| P1-03 | `sweepExpiredOrders` cron + heartbeat | orders | implementing | `expire-orders.ts`, `/api/cron/expire-orders`, D-002 | — |
| P1-04 | Promo field on the guest picker | events | implementing | `ticket-picker-island.tsx`, D-003 | — |
| P1-05 | Refund effects (five) + Orders desk form; C12-DIFF pay-at-door cash settle proven | events / orders | verified in test environment (cash only; card not run) | `qa-evidence/C12-DIFF/pay-at-door.md` | POS-3.4 (refund lifecycle), POS-7.3 (gate) |
| P1-06 | Five refund effects + Orders desk form | orders | implemented, awaiting focused verification | — | POS-3.4 |
| P1-07 | Sessions collision list + static enrolled test | catalog / sessions | implemented, awaiting focused verification | — | — |
| P2-01 | ≥120-type catalog, accent-fold search | catalog | implemented, awaiting focused verification | — | — |
| P2-02 | Theme layers (`theme-layers.ts`); roster not hidden for solo businesses | theme / roles | implemented, awaiting focused verification | — | D-POS-9 (people model, design only) |
| P2-03 | Nine POS destinations | pos | implemented, awaiting focused verification | — | POS-1 through POS-10 (mode set, design only) |
| P2-04 | Combined Sales read (orders + bookings/reservations/registrations); C08 inquiry/offer flows | catalog / client-work | implemented, awaiting focused verification; C08-CUS accept not reached green (D-022) | `qa-evidence/C08-*/` | POS-7.4 (Projects mode, not yet built) |
| P2-05 | Discounts over `tenant_promo_codes` | catalog | implemented, awaiting focused verification | — | POS-2.3 |
| P3-01 | POS command module (draft/line/reprice/submit/collect/finalize) | pos | implemented, awaiting focused verification | — | L53 shared contract; POS-1.2 |
| P3-02 | `/admin/pos` counter: walk-in draft, collect refuses without contact | pos | implemented, awaiting focused verification | — | POS-2.1, POS-2.1a |
| P3-04 | POS shell sells appointment offerings as lines | pos / appointments | implemented, awaiting focused verification | — | — |
| P3-05 | Session `session_tier` pool held at collect; C09-DIFF last-seat sold-out proven | pos / catalog | implemented, awaiting focused verification (browser proof for C09-DIFF only) | `qa-evidence/C09-DIFF/same-pool-sold-out.md` | POS-5.5, POS-2.5 |
| P4-01 | Collection interface + Stripe adapter at Checkout; cash via settle | payments | implemented, awaiting focused verification | — | POS-1.2, POS-3.1 |
| P4-02 | Mercado Pago Point adapter (`mercado-pago-collection.ts`) | payments | implemented, awaiting focused verification; live half awaits credentials | `p4-mercado-pago-discovery.md` | POS-3.7 (D-POS-4 undecided: Stripe Terminal vs MP Point) |
| P5-01 | C07-OP collect-at-close + C07-CUS guest `/visit/<token>`; guest cannot open a tab | tables / bar | implemented, awaiting focused verification | `qa-evidence/C07-OP/collect-at-close.md`, `qa-evidence/C07-CUS/guest-check.md` | POS-4.7 (guest QR ordering) |
| P5-02 | Pickup destination and `promised_at` on one prep ticket | preparation | implemented, awaiting focused verification | — | POS-2.7 |
| P5-03 | Ready state + guest email / staff in-app notify | preparation | implemented, awaiting focused verification | — | — |
| P5-04 | Preparation tickets + revisions (amendment bumps revision) | preparation | implemented, awaiting focused verification | `/admin/preparation` | POS-4.3, POS-4.6 |
| P5-05 | Shift open/close on `/admin/pos`; one open per tenant | pos / cash | implemented, awaiting focused verification | remote `20261230000300` applied | POS-3.8 (cash sessions) |
| P5-06 | One order, several cash allocations (three-way split) | pos / orders | implemented, awaiting focused verification | L52 amendment | POS-4.5 (split by items/quantity) |
| P5-07 | Remaining minimum spend displayed, not charged | spaces | implemented, awaiting focused verification | — | POS-4.9 |
| P5-08 | C26-OP pickup handoff browser proof | pos / pickup | implemented, awaiting focused verification (Friday stock windows not run) | `qa-evidence/C26-OP/pickup-handoff.md` | POS-2.7 |
| P6-01 | `reserveResourceSet`: capacity first, talent holds by id, unwind, deadlock retries | capacity / resources | implemented, awaiting focused verification | `reserve-set.ts` | POS-1.6 (resource identity, decision drafted not ratified — D-POS-1), POS-5.0 |
| P6-02 | Stations/rooms as `capacity_pools` (`subject_kind: space`) | capacity / spaces | implemented, awaiting focused verification | — | POS-10.1 |
| P6-03 | Travel/setup buffers extend the hold window | scheduling | implemented, awaiting focused verification | — | POS-5.9 (travel buffers, zone table) |
| P6-04 | `markAttendance` via `check_in`, tenant-scoped, no payment write | attendance | implemented, awaiting focused verification | — | POS-5.5 |
| P6-05 | `listPrivateClients` refuses cross-workspace reads | permissions | implemented, awaiting focused verification | — | POS-6.5 (people model access hat) |
| P7-01 | `booking_deliverables` + `selected_asset_ids` (C37 photographer) | catalog / deliverables | implemented, awaiting focused verification | remote applied | POS-7.5 (talent assignment & deliverables) |
| P7-02 | Recurring agreement = `session_series`; skip one visit without deactivating series | scheduling | implemented, awaiting focused verification | — | POS-9.3 (recurring occurrences) |
| P7-03 | `visitFitsServiceArea` against `talent_service_areas` | field services | implemented, awaiting focused verification | — | POS-9.1 |
| P7-04 | Agreed change inserts a new `inquiry_offers` version | client-work | implemented, awaiting focused verification | — | POS-7.4 (amendment keeps prior version) |
| P7-05 | Departure = session + admissions manifest; vehicle cap via capacity | events / tours | implemented, awaiting focused verification | — | — |
| P7-06 | Appointment phases flatten into one `reserveResourceSet` | scheduling | implemented, awaiting focused verification | — | POS-5.0a (D-POS-2 appointment phases, decision drafted not ratified) |
| P8-01 | Component cancel, supervised set, tournament/breakouts, exclusive kitchen, retreat days | mixed / hybrids | implemented, awaiting focused verification | — | POS-6.3, POS-6.4 (hybrid packages) |

## Design program's tasks (POS-ids)

Source: `pos/execution-plan.md`. **Not started** unless this table says otherwise — the
POS program's own README states application implementation is not yet authorized. Full
task detail (deps, acceptance, files) stays in that source file; this row set is for
cross-reference against the P/M-ids and T-ids above, not a replacement.

| ID | What | Owner-area | Status | Also known as |
|---|---|---|---|---|
| POS-1.1a | Resolve PR #1934 conflicts against main | infra | not started | — |
| POS-1.1b | Isolated schema verified on qa-journeys, full migration range applied | migrations | not started (production range already partly applied by P0-05; isolated apply not confirmed under this id) | P0-05 |
| POS-1.1c | Program records + validator land on the branch | docs | not started | this document, produced under T0/this session, not under a POS-1.1c claim |
| POS-1.2 | Payment attempt state machine + POS UI kit | pos / payments | not started | P3-01, P4-01 (overlapping ground already built under the P-ids) |
| POS-1.3 | Device-size verification (tablets) | qa-harness | not started | P0-07 (Playwright tablet/mobile scaffold exists; device run not done) |
| POS-1.4 | Lock / switch operator / drawer ownership | pos | not started | — |
| POS-1.5 | ES system labels; merchant names verbatim | i18n | not started | — |
| POS-1.6 | Resource identity decision (D-POS-1) | schema / decision | not started as a POS task; the underlying schema already exists as `capacity_pools` with `subject_kind: space` | P6-02 |
| POS-1.7 | Server-side mode & action permissions | permissions | not started | P6-05 (cross-workspace refusal already exists for one surface) |
| POS-1.8 | Create-and-return component | pos / ui | not started | — |
| POS-1.9 | Missing-setup & first-run states | pos / onboarding | not started | — |
| POS-2.1a | Identity rule by product, not by amount (D-POS-6) | orders | not started; contradicts the currently shipped rule (`orders_identified_before_payment`, F07) | — |
| POS-2.1 | New sale → options → cash → receipt → next | pos / counter | not started | P3-01, P3-02 |
| POS-2.2 | Customer search/create/attach | pos / customers | not started | — |
| POS-2.3 | Discounts | catalog | not started | P2-05 |
| POS-2.4 | Custom amount + approval | pos | not started | — |
| POS-2.5 | Hold / expired hold / sold-out-on-charge | pos / capacity | not started | P3-05 (C09-DIFF proves the sold-out-on-charge case already) |
| POS-2.6 | Link a booking | pos / bookings | not started | — |
| POS-2.7 | Orders list, pickup handoff, duplicate guard | pos / fulfilment | not started | P5-02, P5-08 |
| POS-2.8 | Scanner ready + product toast | pos | not started | — |
| POS-2.9 | Measured quantity, returns, restock/waste | pos / inventory | not started | — |
| POS-2.10 | Multi-seller separation | pos | not started | — |
| POS-2.11 | Offline policy (cash-only degraded mode) | pos / offline | not started | D-POS-5 |
| POS-3.1 | Shared payment orchestration + Stripe adapter | payments | not started as a POS task; a Stripe collection path already exists (P4-01) | P4-01 |
| POS-3.2 | Two payment methods / partial failure | payments | not started | — |
| POS-3.3 | Cross-device payment ownership / takeover | payments | not started | — |
| POS-3.4 | Refund lifecycle (five effects) | payments | not started as a POS task; the five effects are already the accepted contract (L55) and P1-05/P1-06 implement parts of it | L55, P1-05, P1-06 |
| POS-3.5 | Issues inbox + detail | payments / ops | not started | — |
| POS-3.6 | Exception: collect another way | payments | not started | D-POS-7 |
| POS-3.7 | Mercado Pago Point adapter | payments | not started as a POS task; the code-level adapter already exists (P4-02) awaiting credentials | P4-02, D-POS-4 |
| POS-3.8 | Cash sessions (float, movements, handover, variance) | pos / cash | not started as a POS task; shift open/close already shipped (P5-05) | P5-05 |
| POS-3.9 | Receipts list/detail/reprint; fiscal hook | pos / receipts | not started | D-POS-8 (fiscal invoicing deferred) |
| POS-3.10 | Physical card reader verification | hardware | not started; awaiting external verification once started (no device, no D-POS-4 decision) | D-POS-4 |
| POS-3.11 | Payment links | payments | not started | — |
| POS-4.1 | Floor / timeline / list on real visits | tables | not started | — |
| POS-4.2 | Seat / walk-in / waitlist offer | tables | not started | POS-5.1 |
| POS-4.3 | Table order by seat/course; station acks | tables | not started as a POS task; preparation tickets already exist (P5-04) | P5-04 |
| POS-4.4 | Move / join / merge-same-party / change server / reset | tables | not started | — |
| POS-4.5 | Split by items / quantity | tables | not started as a POS task; three-way split by cash allocation already shipped (P5-06) | P5-06 |
| POS-4.6 | Cancel sent item; comp/void/replace | tables | not started | — |
| POS-4.7 | Guest QR ordering, substitution, pay-my-share | tables / guest | not started as a POS task; guest tab read already shipped for C07-CUS (P5-01) | P5-01 |
| POS-4.8 | Kitchen station screen | tables | not started | — |
| POS-4.9 | Minimum spend met / short | tables | not started as a POS task; the display-only version already shipped (P5-07) | P5-07 |
| POS-5.0a | Appointment phases decision (D-POS-2) | scheduling / decision | not started as a decision; P7-06 already flattens phases into one reservation | P7-06 |
| POS-5.0 | Booking from POS/customer (A01–A18) | appointments | not started | P6-01 (the underlying `reserveResourceSet` already exists) |
| POS-5.1 | Waitlists | appointments | not started | — |
| POS-5.2 | Customer credits/passes ledger | entitlements | not started as a POS task; `drawdown_lesson_package` RPC already exists (P7 area, C39) | — |
| POS-5.3 | Memberships incl. pause/cancel/renewal | subscriptions | not started | — |
| POS-5.4 | Gift cards / stored value | payments | not started | — |
| POS-5.5 | Class enrollment, check-in, released place, course | sessions | not started as a POS task; attendance and session-pool holds already exist (P6-04, P3-05) | P6-04, P3-05 |
| POS-5.6 | Add extra with time re-check; balance | appointments | not started | — |
| POS-5.7 | Customer manage + professional day | appointments / portal | not started | — |
| POS-5.8 | Reschedule / cancel as operations | appointments | not started | — |
| POS-5.9 | Travel buffers & zone table for mobile services | field services | not started as a POS task; buffer extension already exists at the reservation level (P6-03) | P6-03 |
| POS-6.1 | Reservation create / unavailable / confirm / amend | reservations | not started | — |
| POS-6.2 | Layout versions share capacity | spaces | not started | D-POS-3 |
| POS-6.3 | Hybrid package configure/unavailable/issued/refund | packages | not started as a POS task; component cancel and supervised sets already exist (P8-01) | P8-01 |
| POS-6.4 | Benefit redemption at table | packages / tables | not started | — |
| POS-7.1 | Presale, multi-day tickets | events | not started | — |
| POS-7.2 | Lookup, name, transfer, exchange, partial cancel, comp, delivery | events | not started | — |
| POS-7.3 | Gate states + customer ticket | events | not started as a POS task; walk-up Admit already proven (P1-05, C12-OP) | P1-05 |
| POS-7.4 | Projects: due, projects, amendment | client-work | not started as a POS task; the combined read and C08 inquiry/offer flow already exist (P2-04) | P2-04 |
| POS-7.5 | Talent assignment & customer project views | client-work | not started as a POS task; `booking_deliverables` already exists (P7-01) | P7-01 |
| POS-9.1 | Jobs today, job detail, arrive/start | field services | not started as a POS task; `visitFitsServiceArea` already exists (P7-03) | P7-03 |
| POS-9.2 | Work record, extra work, complete & collect | field services | not started | — |
| POS-9.3 | Problems, recurring occurrences, offline | field services | not started as a POS task; recurring skip-one-visit already exists (P7-02) | P7-02 |
| POS-10.1 | Availability timeline + allocations | spaces | not started as a POS task; station/room pools already exist (P6-02) | P6-02 |
| POS-10.2 | Reserve unit, arrive/start/extend/move/release | spaces | not started | — |
| POS-10.3 | Rental custody & security deposit | spaces | not started | — |
| POS-8 | Continuous QA extension over the POS program | qa-harness | not started as a distinct workstream; already the model this whole program uses (W-AUDIT) | W-AUDIT |

## Case matrix (overall)

See [`cases/`](cases/) for the developer's per-case files, and [`scenario-matrix.md`](scenario-matrix.md)
for the 240 case-role records. [`pos/case-progress.md`](pos/case-progress.md) is retired
and points back here. No case is complete. See `START-HERE.md` for the honest count
(0/48) and the partial proofs recorded so far.

## Defects

See [`defects.md`](defects.md). Blocking and high-risk open a GitHub issue. Normal and
cosmetic stay here.
