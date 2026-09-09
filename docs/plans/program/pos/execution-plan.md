# POS execution plan — projects → milestones → tasks (v2)

Conventions: task ids `POS-<project>.<n>`; statuses per `README.md` (all **Not started** unless stated); case ids `C01–C48` with role suffixes; blueprint scenarios by family (`tracker.md`). Paths are as found on `main` (7661c795d) or in PR #1934 (marked **PR**, head a6b04b8c60, draft, **CONFLICTING with main**). Commands are the ones present in `web/package.json` (`journeys:*` exist only in the PR). Evidence: `docs/plans/qa-evidence/<case-role>/<slug>.md` (+ screenshots). Every task: bounded retries (2 same-approach attempts), forward-fix after dependent writes, next-ready named, ownership column names the files/schema a task holds so parallel lanes do not collide.

Execution capability (verified 9 Sep): no scheduler, background runner or auto-restart exists. `scripts/agent/run-phase.mjs` (Cursor SDK, `CURSOR_API_KEY`) runs one phase per invocation. Gates are queue-wrapped (`gate-queue.sh` lint cap 1 / tests cap 2; `tsc-queue.sh` serialised). Concurrency proofs only on the isolated `qa-journeys` DB (`journeys:audit` **PR**, `verify:capacity-concurrency`). Production migration targets: `pluhdapdnuiulvxmyspd` has `20261230000200–000600` applied; the full local range is `20261230000200–20261230002200` (21 files, `20261231*` reserved for money/capacity hardening, no files yet); everything after `000600` exists only on the PR and on qa-journeys. **Planning and test execution do not authorize production changes.**

Gates for every code task: `cd web && npm run typecheck && npm run lint` + the named lanes. Migrations: timestamp sorts after the newest existing file; `db:push` before merge; park-restore on collision (`web/docs/migrations-and-remote-history.md`).

Provider-dependent verification is separated from shared interfaces: cash, free bookings, resources, customer surfaces and all UI states proceed without a card reader; anything needing Stripe test mode or a Mercado Pago sandbox is a distinct task marked **Awaiting external verification** until run.

## POS-1 · Foundation and shared system (P0)

| ID | Task | Deps | Objective / acceptance | Reuse | Config / migration / permissions | Checks & evidence | Owns | Next ready |
|---|---|---|---|---|---|---|---|---|
| POS-1.1a | Resolve PR #1934 conflicts against main | approval | Rebase `cursor/journeys-program-c4d3` (or cherry-pick the POS, visits, outbox, MP and docs commits) onto a fresh branch off `main`; conflicts resolved; `typecheck`, `lint`, `test:money`, `test:capacity` green | PR #1934 file set (`baseline.md`) | none | CI green on the new PR; evidence = PR checks | whole PR tree | POS-1.1b |
| POS-1.1b | Isolated schema verified on qa-journeys | POS-1.1a | `20261230000200–20261230002200` applied on qa-journeys; `journeys:audit` passes; **no production apply** | `check-migrations-applied.mjs`, `journeys:audit` **PR** | targets: qa-journeys only | `journeys:audit` output in `qa-evidence/POS-1.1b/` | migrations | POS-1.1c, POS-1.2 |
| POS-1.1c | Program records land | POS-1.1a | `docs/plans/program/pos/*` + `scripts/program/validate-pos-program.mjs` on the branch; validator exit 0 | this folder | none | `node scripts/program/validate-pos-program.mjs` | docs | — |
| POS-1.2 | Payment attempt state machine + POS UI kit | POS-1.1b | `PaymentAttempt` (waiting · unknown · declined · approved · late-approved · cancel-pending) drives M05–M08, M11–M12; kit tokens per deck (buttons, overlays, chips) as shared components | `lib/pos/collection.ts` **PR**, `payments/webhook-v2.ts`, `stripe_processed_events` | none | unit lane `test:money`; browser M05→M06→M08 forced timeout on qa-journeys | `lib/pos/collection.ts`, new `lib/pos/attempt.ts`, `components/pos/*` | POS-3.1 |
| POS-1.3 | Device-size verification (keyboards, PIN pads, footers) | POS-1.2 | iPad landscape/portrait + one Android tablet: C07, C09, C15, M26 footers above keyboard; 44 px targets; contrast checked | Playwright (`playwright.config.ts` projects — add tablet viewports) | none | screenshots `qa-evidence/POS-1.3/`; status **Awaiting prototype** until run | e2e config | — |
| POS-1.4 | Lock / switch operator / drawer ownership (M30) | POS-1.1b | PIN with throttle; drawer owner unchanged; unsynced work preserved | `lib/pos/shift.ts` **PR** | staff PIN column + audit (new migration) | P55, N05 | `lib/pos/shift.ts`, migration | POS-3.8 |
| POS-1.5 | ES system labels; merchant names verbatim | POS-1.1b | rail/mode/header/payment controls translated; product names untouched (C28, M04) | `lib/admin/dashboard-i18n.ts` | none | screenshot EN/ES | i18n map | — |
| POS-1.6 | Resource identity decision (bounded discovery) | POS-1.1b | **Output:** `docs/plans/program/pos/decisions/resources-model.md` + migration draft for a `resources` table (unit identity across layouts) or documented reuse of `space_assignments`; decision D-POS-1 recorded within 1 day | `spaces/*`, `space_assignments` | migration draft only | reviewed doc | schema proposal | POS-4.1, POS-10.1, POS-7.1 (seats) |
| POS-1.7 | Server-side mode & action permissions | POS-1.1b | every `admin/pos/actions.ts` command checks role, location and mode enablement; hidden modes are not access control (M33) | `admin/pos/actions.ts` **PR**, RLS | permission keys per action (`actions.md`) | N05, P58–P59 direct-request tests | `admin/pos/actions.ts` | POS-2.1 |
| POS-1.8 | Create-and-return component | POS-1.1b | shared drawer: preserve parent draft, save child once, attach by id, retry attachment (C07–C10, A02 room, E03 venue) | `ensure-customer.ts`, `SpacesEditor` | none | P04–P05, N09–N12 | `components/pos/create-and-return.tsx` | POS-2.2 |
| POS-1.9 | Missing-setup & first-run states (C32) | POS-1.7 | location readiness check (drawer, reader, price list, hours, stations, payment methods) with routes to fix; cash-only override with owner approval | settings routes | readiness query | N29-style | `admin/pos/readiness.ts` | — |

## POS-2 · Counter loop (P0) — C06, C25, C26, C09-OP, C46

| ID | Task | Deps | Objective / acceptance | Reuse | Config / migration / permissions | Checks & evidence | Owns | Next ready |
|---|---|---|---|---|---|---|---|---|
| POS-2.1a | Identity rule by product, not by amount | POS-1.1b | Replace the PR F07 rule (`contact only when total_cents > 0`, constraint `orders_identified_before_payment`) with a per-offering `requires_identity` flag (named tickets, protected services); a paid anonymous sale of a product that needs no identity completes | `lib/pos/collection.ts` **PR**, `orders` constraint (PR migration) | new migration altering the constraint + offering flag | P08, R08; browser anonymous $95 cash sale | `orders` constraint, `talent_offerings` flag | POS-2.1 |
| POS-2.1 | New sale → options → cash → receipt → next (C02–C05, M01–M03, M13, D01–D07) | POS-2.1a, POS-1.7 | anonymous cash sale; drawer movement; display resets; double-tap = one order | `admin/pos/pos-client.tsx` **PR**, `lib/pos/{draft,addons,collection}.ts` | — | P01–P03, P11–P12, P57; C06-OP re-run | `pos-client.tsx` counter view | POS-2.2, POS-2.5 |
| POS-2.2 | Customer search/create/attach (C06–C10) | POS-2.1, POS-1.8 | cashier projection; duplicate as a choice; attach failure retry reuses record | `ensure-customer.ts` | field projection server-side | P04–P05, R01, R06 | customers read model | POS-2.6 |
| POS-2.3 | Discounts (C13) | POS-2.1 | before/after; combinability refusal; limit by role | `orders/promo-eligibility.ts`, `promo-resolve.ts` | discount limit per role | C21–C22 | promo modules | — |
| POS-2.4 | Custom amount + approval (C14–C15) | POS-2.1 | details first; PIN tries; denial no-op | — | approval audit row | P10 | new `lib/pos/approval.ts` | — |
| POS-2.5 | Hold / expired hold / sold-out-on-charge (C16–C18) | POS-2.1 | named hold; expiry offers re-hold/remove; sold-out preserves cart | `capacity/reserve.ts`, `hold-expiry.ts` | none | P06, A33, C09-DIFF | draft persistence | — |
| POS-2.6 | Link a booking (C11 → B03) | POS-2.2 | Link only vs Link & pay; other seller not selectable; class identity kept | `orders/booking-shell.ts` **PR** | none | P25–P26, N18 | booking-shell | POS-5.6 |
| POS-2.7 | Orders list, pickup handoff, duplicate guard (C21, C25–C26) | POS-2.1 | website order = same order; partial quantities; second handoff guarded | visits/prep **PR**, `orders-list.ts` | none | P36, P44, C26-OP | fulfilment quantities | — |
| POS-2.8 | Scanner ready + product toast (C23–C24) | POS-2.1 | one outcome per scan; unknown refused | `/q/[code]` | none | P09 | scan router | POS-7.3 |
| POS-2.9 | Measured quantity, returns, restock/waste (C30–C31) | POS-2.1 | scale reading with unit snapshot; return separates stock and money decisions | `refund-plan.ts` | waste/restock records (migration) | P49, new rows | new `lib/pos/returns.ts` | — |
| POS-2.10 | Multi-seller separation (M32) | POS-2.1 | two sellers → sequential checkouts; context kept | `purchase-policy.ts` | none | C04 (catalog), P21 | checkout split | — |
| POS-2.11 | Offline policy: cash-only degraded mode, connection screen, sync conflict (C27, M28, M29) | POS-2.1, POS-1.4 | local queue with stable ids; sign-out blocked with unsynced work; conflict resolution with named confirmation | `command_idempotency` **PR** | local encrypted store | P62, P64 | new `lib/pos/offline.ts` | — |

## POS-3 · Payments and recovery (P0)

| ID | Task | Deps | Objective / acceptance | Reuse | Config / migration / permissions | Checks & evidence | Owns | Next ready |
|---|---|---|---|---|---|---|---|---|
| POS-3.1 | Shared orchestration + Stripe adapter (M05–M08) | POS-1.2 | orchestration (attempt lock on the payable, idempotent apply) separated from provider adapter; Stripe PI adapter; late success applied once | `stripe-payment-intent.ts`, `webhook-v2.ts` | Stripe test keys in isolated env (`stripe:sandbox`) | P13–P16; webhook replay | `lib/payments/pos-orchestration.ts` | POS-3.2, POS-3.7 |
| POS-3.2 | Two methods / partial failure (M09–M10) | POS-3.1 | first tender kept; remaining primary; part-paid keeps booking done | orchestration | none | P17; P20+P25 | — | — |
| POS-3.3 | Cross-device ownership / takeover (M11–M12) | POS-3.1 | payable lock by device+owner; cancel request; unlock on reader confirm | attempt lock | none | P18; P14+P18 | — | — |
| POS-3.4 | Refund lifecycle (M16–M19) | POS-3.1 | pending/failed/completed; access effects immediate; provider-supported destinations only; failed → Issues | `refund-plan.ts`, `refund-execute-lines.ts`, `refund-admissions.ts`, `payments/refunds.ts` | verify `refund_admission` RPC on target (PR `20261230000900`) | P49–P52, X62–X66; failure-injection for the RPC branch | refund modules | POS-7.2 |
| POS-3.5 | Issues inbox + detail (M24–M25) | POS-3.1 | one safe action per row; reconciliation default; continue other sales | outbox **PR** | none | P60–P64 | issues read model | — |
| POS-3.6 | Exception: collect another way (M26) | POS-3.5 | manager PIN; both payments recorded; overpayment flagged; refund via provider by owner; guest told | — | overpayment flag (migration) | P14+P18 combined | — | — |
| POS-3.7 | Mercado Pago Point adapter | POS-3.1; MP sandbox account | Point amount-aware refund, `partial_unsupported`, token ≠ readiness; status polling | `mercado-pago-collection.ts` **PR**, `p4-mercado-pago-discovery.md` | MP sandbox credentials — **Awaiting external verification** | P13–P16 on MP | adapter file | POS-3.10 |
| POS-3.8 | Cash sessions (M21–M23) | POS-1.4 | float, movements, handover, denomination count, blind count, variance | `lib/pos/shift.ts` **PR** | none | P54–P56 | shift | — |
| POS-3.9 | Receipts list/detail/reprint; fiscal hook (M14–M15) | POS-2.1 | search; refund entries linked; marked reprint; CFDI deferred with honest state | `receipt-code.ts` | fiscal integration out of launch scope | P57 | receipts read model | — |
| POS-3.10 | Physical reader verification | POS-3.7 or Stripe Terminal decision (D-POS-4) | real device × OS × browser proof; disconnect mid-attempt | — | hardware | P13, P62 — **Awaiting external verification** | — | — |
| POS-3.11 | Payment links (O02) | POS-3.1 | create/send/opened/paid/expired; resend without duplicate | none exists | new table + provider link | new rows (register add) | `lib/payments/links.ts` | — |

## POS-4 · Tables and preparation (P0) — C06, C07, C11, C25

| ID | Task | Deps | Objective / acceptance | Reuse | Config / migration / permissions | Checks & evidence | Owns | Next ready |
|---|---|---|---|---|---|---|---|---|
| POS-4.1 | Floor / timeline / list on real visits (T01–T03) | POS-1.6 | states from visits; overrun vs next commitment | visits **PR**, `spaces/*`, `reservations/*` | resource identity (POS-1.6) | S34–S38 | floor read model | POS-4.2 |
| POS-4.2 | Seat / walk-in / waitlist offer (T05–T08) | POS-4.1 | visit start; invitation with expiry | `reservations/walkin.ts` | waitlist table (POS-5.1) | S34, S40 | — | POS-4.3 |
| POS-4.3 | Table order by seat/course; send delta; station acks (T09–T11) | POS-4.1 | only delta dispatched; per-station ack; bounded retry | prep tickets **PR** | routing per station | P39–P42, P48 | prep dispatch | POS-4.4, POS-4.8 |
| POS-4.4 | Move / join / merge-same-party / change server / reset (T12–T17, T24) | POS-4.3 | destination validated; merge only same party with named payer | `check-partition.ts` **PR** | other-server permission | P20–P21, P45, S36 | visit ops | POS-4.5 |
| POS-4.5 | Split by items / quantity; paid check locked (T18–T19) | POS-4.4 | totals conserve; paid check immutable | `check-partition.ts` **PR** | none | P19–P20 | check ops | — |
| POS-4.6 | Cancel sent item; comp/void/replace (T20, M20) | POS-4.3 | reason + effect; kitchen amendment ack | — | comp limit per role | P41, P53 | — | — |
| POS-4.7 | Guest QR ordering, substitution, pay my share (T21, Q01–Q07) | POS-4.3, POS-3.1 | current visit only; substitution needs guest OK; share allocation; simultaneous payments; already-paid recovery | `/visit/<token>` **PR**, `guest-session.ts` | QR purpose/expiry registry | P37, S54, W14, R29, C07-CUS | guest visit surface | — |
| POS-4.8 | Kitchen station screen (T26) | POS-4.3 | no cashier nav; amendments need Got it | prep board **PR** | station role | P43–P47 | station UI | — |
| POS-4.9 | Minimum spend met / short (T25, T28) | POS-4.3 | counted vs excluded; shortfall line | — | reservation terms field | S45, C11 | — | — |

## POS-5 · Appointments, classes, benefits (P0) — C01–C05, C09, C14, C28, C39, C40

| ID | Task | Deps | Objective / acceptance | Reuse | Config / migration / permissions | Checks & evidence | Owns | Next ready |
|---|---|---|---|---|---|---|---|---|
| POS-5.0a | Appointment phases decision (bounded discovery) | POS-1.1b | **Output:** `decisions/appointment-phases.md` + migration draft for service segments (apply / process keeps chair / finish) — D-POS-2 within 1 day | `scheduling/*`, `talent_offering_variants` | draft only | reviewed doc | schema proposal | POS-5.0 |
| POS-5.0 | Booking from POS/customer: A01–A06 | POS-5.0a, POS-1.8 | service-first → people/place → times with reasons → details → review → deposit via shared M; confirm reserves atomically | `scheduling/*`, `reserve_resource_set` **PR**, `talent_holds`, `agency_bookings` | segments migration | A01–A18, A47; C01-CUS → collected | booking composer | POS-5.1, POS-5.6, POS-5.9 |
| POS-5.1 | Waitlists (K02, B06, K07) | POS-5.0 | queue, invitation with expiry, acceptance re-checks | none | `waitlist_entries` migration | A37–A40 | waitlist | — |
| POS-5.2 | Customer credits/passes ledger (K03–K05, C20) | POS-5.0 | issued/reserved/consumed/restored/expired; last credit atomic; consumption on attendance | `drawdown_lesson_package` RPC **PR** | ledger tables | C13–C15, A32–A36, C29 | entitlements | POS-5.3, POS-5.4 |
| POS-5.3 | Memberships incl. pause/cancel/renewal failure (P04, P09) | POS-5.2 | billing schedule ≠ occurrences; lapsed bookings kept and flagged | `stripe-talent-subscription.ts` | agreement tables | A34–A35, C16 | memberships | — |
| POS-5.4 | Gift cards / stored value (P05, P07, P08) | POS-3.1 | liability until used; partial use; exhausted/concurrent refused | none | table + redemption at Collect | new rows (register add) | stored value | — |
| POS-5.5 | Class enrollment, check-in, released place, course (K01, B05, B06, K06) | POS-5.2 | individuals; attendance ≠ payment; all-dates rule | `sessions/*`, `session_series` | equipment positions | A25–A31, A41–A45, C09 | sessions | — |
| POS-5.6 | Add extra with time re-check; balance (B01–B02) | POS-5.0, POS-2.6 | revised end/person/balance before commit | scheduling re-check | none | A48, P25 | — | — |
| POS-5.7 | Customer manage + professional day (A07, A08) | POS-5.0 | reschedule keeps original; cross-business busy without private data | `client/hub`, talent `today` | none | A21–A23, R09, R25 | portal/talent views | — |
| POS-5.8 | Reschedule / cancel as operations (A09, A10) | POS-5.0 | replacement reserved first; deposit/resource/reminder effects | `_pipeline-actions.ts` (direct timestamp write → replace) | none | A46, A54 | pipeline actions | — |
| POS-5.9 | Travel buffers & zone table for mobile services | POS-5.0 | travel as buffer both sides from a zone table; no GPS | scheduling buffers | zone table (migration) | A19–A20, F09 | travel module | POS-9.1 |

## POS-6 · Reservations and packages (P0/P1) — C06, C11, C12, C21, C24

| ID | Task | Deps | Objective / acceptance | Reuse | Config / migration / permissions | Checks & evidence | Owns | Next ready |
|---|---|---|---|---|---|---|---|---|
| POS-6.1 | Reservation create / unavailable / confirm / amend (R01–R05) | POS-4.1 | deposit via shared M; guarantee vs preference; amend re-validates full interval incl. buffers | `reservations/{book,availability,rules,windows}.ts` | pacing + buffer settings | S13–S33, C06-CUS | reservations | — |
| POS-6.2 | Layout versions share capacity (R06) | POS-6.1, POS-1.6 | activation previews affected bookings; event allocation blocks dining | `spaces/*` | layout model (D-POS-3) | S06–S12, S14 | layouts | — |
| POS-6.3 | Hybrid package configure/unavailable/issued/refund (P01–P03, P06) | POS-3.4, POS-6.1 | all-or-nothing holds; alternatives respect capacity + sequence; allocations sum; dependency-aware refund | `product_packages`, `purchase-pricing.ts` | allocation + dependency fields | C09–C12 (catalog), C23–C24 | packages | — |
| POS-6.4 | Benefit redemption at table (meal in package) | POS-6.3 | consume once; kitchen task linked | admissions + prep **PR** | none | P31–P32, S55 | — | — |

## POS-7 · Tickets, gate, projects (P0) — C07, C08, C12, C27, C38, C47, C48

| ID | Task | Deps | Objective / acceptance | Reuse | Config / migration / permissions | Checks & evidence | Owns | Next ready |
|---|---|---|---|---|---|---|---|---|
| POS-7.1 | Presale E01–E07, multi-day E14 | POS-3.1, POS-1.6 | future occurrences; phase/limit/pool; hold expiry; paid-but-not-issued kept as issue | `events/{tiers,ticket-purchase,mint-on-paid,mint-admissions}.ts`, `capacity/reserve.ts` | seat resources (POS-1.6) | X ticket rows, C12-CUS → card | presale UI | POS-7.2, POS-7.3 |
| POS-7.2 | Lookup, name, transfer, exchange with dependents, partial cancel, comp, delivery (E09–E13, E15) | POS-7.1, POS-3.4 | replaced credential invalid immediately; dependents re-validated; comp from allocation; per-channel delivery status | `refund-intents.ts`, `refund-admissions.ts` | transfer/exchange commands | X61–X63, X10 | ticket ops | — |
| POS-7.3 | Gate states G01–G07 + customer ticket E08 | POS-7.1 | one outcome per scan; requested vs confirmed refund policy; cancelled; per-person admission | `check_in` **PR**, `sessions/door*.ts` | scanner binding | P28–P30, C12-OP | gate | — |
| POS-7.4 | Projects: due, projects, amendment (O01, O03, O06) | POS-3.1 | milestone due-now vs later; amendment keeps prior version; effects on outstanding and talent fees | `inquiry_offers`, `inquiry_offer_line_items` | none | C17–C20, C08 | projects views | POS-7.5 |
| POS-7.5 | Talent assignment & customer project views (O04, O05) | POS-7.4 | fee/earned/payable/paid distinct; versioned approval | talent `money`, `booking-payouts-ledger.ts` | none | N22, R13–R15 | — | — |

## POS-9 · Field Services (P0) — C03, C30–C33, C41, C43, C46

| ID | Task | Deps | Objective / acceptance | Reuse | Config / migration / permissions | Checks & evidence | Owns | Next ready |
|---|---|---|---|---|---|---|---|---|
| POS-9.1 | Jobs today, job detail, arrive/start (F01–F02) | POS-5.9 | address/access, travel, masked call, arrive/start | talent `today` route, bookings | masked-contact channel | A19–A20, C03-TAL | field mobile views | POS-9.2 |
| POS-9.2 | Work record, extra work acceptance, complete & collect (F03–F05) | POS-9.1, POS-3.1 | notes/materials/time where billed; amendment with acceptance; collect or recorded balance | orchestration; amendment (POS-7.4 pattern) | none | C19, N20, C46-OP | — | POS-9.3 |
| POS-9.3 | Problems, recurring occurrences, offline (F06–F08) | POS-9.2, POS-2.11 | no access/late/reschedule/cancel/incomplete; skip occurrence without ending agreement; local preservation | `_pipeline-actions.ts` | agreement→occurrence model | A28, C30/C32-OP | — | — |

## POS-10 · Spaces & Resources mode (P0) — C13, C17, C18, C24, C35

| ID | Task | Deps | Objective / acceptance | Reuse | Config / migration / permissions | Checks & evidence | Owns | Next ready |
|---|---|---|---|---|---|---|---|---|
| POS-10.1 | Availability timeline + allocations (S01, S03) | POS-1.6 | units on one timeline; class holds room once; blocks | `spaces/*`, `reserve_resource_set` **PR** | resources table | S13–S26, N26 | spaces mode | POS-10.2 |
| POS-10.2 | Reserve unit, arrive/start/extend/move/release, blocked/reset (S02, S04, S05) | POS-10.1, POS-3.1 | combinations, buffers, price components; extension bounded by next commitment; reset gating | `reservations/*` | none | S17–S26, S37–S39 | — | POS-10.3 |
| POS-10.3 | Rental custody & security deposit (S06) | POS-10.2 | checkout/return/condition; hold not revenue; deduction reasoned | none | custody table; card hold via provider | new rows (register add) | custody | — |

## POS-8 · Continuous QA (W-AUDIT extension)
Runs from POS-1.1a onward. Per task: focused lanes + browser journey on qa-journeys (A and B) as owner, staff, cashier, talent, customer; shared regression on money/identity/capacity/permissions changes; concurrency only isolated; providers in test mode; MP and hardware **Awaiting external verification** with the exact remaining procedure in the evidence file. Priority list in `README.md`.

## Decisions for the owner (recommendation bold)
D-POS-1 resource identity — **new `resources` table** (POS-1.6 produces the draft). D-POS-2 appointment phases — **segments** (POS-5.0a). D-POS-3 layouts — **host-assigned first**, layout model behind POS-6.2. D-POS-4 card reader for launch — Stripe Terminal vs Mercado Pago Point: **needs seller arrangement + a sandbox account**; both adapters sit behind POS-3.1. D-POS-5 offline — **online + cash-only degraded** (POS-2.11).

## First ready execution cycle (after approval)
1. POS-1.1a resolve the PR conflict → 2. POS-1.1b isolated schema → 3. POS-1.1c records + validator → 4. POS-1.2 attempt state machine → 5. POS-2.1a identity-by-product → 6. POS-2.1 counter loop with C06-OP re-run → 7. POS-1.7 permissions → in parallel (disjoint files): POS-1.6 and POS-5.0a decision drafts, POS-1.5 ES labels, POS-3.8 cash sessions.
