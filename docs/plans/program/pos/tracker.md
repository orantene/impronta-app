# Authoritative tracker (linked views)

One place for status. Sources: task rows in `execution-plan.md` (v2); case-role records in PR #1934 `scenario-matrix.md`; blueprint scenarios in PR #1934 `scenario-register-404.md`. Update the status column here when a task moves; the plan keeps the definition.

## 1. Tasks (69) — status

| ID | Project | Task | Status | Deps | Owns | Next ready |
|---|---|---|---|---|---|---|
| POS-1.1a | Foundation | Resolve PR #1934 conflicts against main | Not started | approval | whole PR tree | POS-1.1b |
| POS-1.1b | Foundation | Isolated schema verified on qa-journeys | Not started | POS-1.1a | migrations | POS-1.1c, POS-1.2 |
| POS-1.1c | Foundation | Program records land | Implemented, awaiting focused verification (records written; validator green) | POS-1.1a | docs | — |
| POS-1.2 | Foundation | Payment attempt state machine + POS UI kit | Not started | POS-1.1b | `lib/pos/collection.ts`, new `lib/pos/attempt.ts`, `components/pos/*` | POS-3.1 |
| POS-1.3 | Foundation | Device-size verification (keyboards, PIN pads, footers) | Not started | POS-1.2 | e2e config | — |
| POS-1.4 | Foundation | Lock / switch operator / drawer ownership (M30) | Not started | POS-1.1b | `lib/pos/shift.ts`, migration | POS-3.8 |
| POS-1.5 | Foundation | ES system labels; merchant names verbatim | Not started | POS-1.1b | i18n map | — |
| POS-1.6 | Foundation | Resource identity decision (bounded discovery) | Not started | POS-1.1b | schema proposal | POS-4.1, POS-10.1, POS-7.1 (seats) |
| POS-1.7 | Foundation | Server-side mode & action permissions | Not started | POS-1.1b | `admin/pos/actions.ts` | POS-2.1 |
| POS-1.8 | Foundation | Create-and-return component | Not started | POS-1.1b | `components/pos/create-and-return.tsx` | POS-2.2 |
| POS-1.9 | Foundation | Missing-setup & first-run states (C32) | Not started | POS-1.7 | `admin/pos/readiness.ts` | — |
| POS-2.1a | Counter loop | Identity rule by product, not by amount | Not started | POS-1.1b | `orders` constraint, `talent_offerings` flag | POS-2.1 |
| POS-2.1 | Counter loop | New sale → options → cash → receipt → next (C02–C05, M01–M03, M13, D01–D07) | Not started | POS-2.1a, POS-1.7 | `pos-client.tsx` counter view | POS-2.2, POS-2.5 |
| POS-2.2 | Counter loop | Customer search/create/attach (C06–C10) | Not started | POS-2.1, POS-1.8 | customers read model | POS-2.6 |
| POS-2.3 | Counter loop | Discounts (C13) | Not started | POS-2.1 | promo modules | — |
| POS-2.4 | Counter loop | Custom amount + approval (C14–C15) | Not started | POS-2.1 | new `lib/pos/approval.ts` | — |
| POS-2.5 | Counter loop | Hold / expired hold / sold-out-on-charge (C16–C18) | Not started | POS-2.1 | draft persistence | — |
| POS-2.6 | Counter loop | Link a booking (C11 → B03) | Not started | POS-2.2 | booking-shell | POS-5.6 |
| POS-2.7 | Counter loop | Orders list, pickup handoff, duplicate guard (C21, C25–C26) | Not started | POS-2.1 | fulfilment quantities | — |
| POS-2.8 | Counter loop | Scanner ready + product toast (C23–C24) | Not started | POS-2.1 | scan router | POS-7.3 |
| POS-2.9 | Counter loop | Measured quantity, returns, restock/waste (C30–C31) | Not started | POS-2.1 | new `lib/pos/returns.ts` | — |
| POS-2.10 | Counter loop | Multi-seller separation (M32) | Not started | POS-2.1 | checkout split | — |
| POS-2.11 | Counter loop | Offline policy: cash-only degraded mode, connection screen, sync conflict (C27, M28, M29) | Not started | POS-2.1, POS-1.4 | new `lib/pos/offline.ts` | — |
| POS-3.1 | Payments & recovery | Shared orchestration + Stripe adapter (M05–M08) | Not started | POS-1.2 | `lib/payments/pos-orchestration.ts` | POS-3.2, POS-3.7 |
| POS-3.2 | Payments & recovery | Two methods / partial failure (M09–M10) | Not started | POS-3.1 | — | — |
| POS-3.3 | Payments & recovery | Cross-device ownership / takeover (M11–M12) | Not started | POS-3.1 | — | — |
| POS-3.4 | Payments & recovery | Refund lifecycle (M16–M19) | Not started | POS-3.1 | refund modules | POS-7.2 |
| POS-3.5 | Payments & recovery | Issues inbox + detail (M24–M25) | Not started | POS-3.1 | issues read model | — |
| POS-3.6 | Payments & recovery | Exception: collect another way (M26) | Not started | POS-3.5 | — | — |
| POS-3.7 | Payments & recovery | Mercado Pago Point adapter | Not started | POS-3.1; MP sandbox account | adapter file | POS-3.10 |
| POS-3.8 | Payments & recovery | Cash sessions (M21–M23) | Not started | POS-1.4 | shift | — |
| POS-3.9 | Payments & recovery | Receipts list/detail/reprint; fiscal hook (M14–M15) | Not started | POS-2.1 | receipts read model | — |
| POS-3.10 | Payments & recovery | Physical reader verification | Not started | POS-3.7 or Stripe Terminal decision (D-POS-4) | — | — |
| POS-3.11 | Payments & recovery | Payment links (O02) | Not started | POS-3.1 | `lib/payments/links.ts` | — |
| POS-4.1 | Tables & preparation | Floor / timeline / list on real visits (T01–T03) | Not started | POS-1.6 | floor read model | POS-4.2 |
| POS-4.2 | Tables & preparation | Seat / walk-in / waitlist offer (T05–T08) | Not started | POS-4.1 | — | POS-4.3 |
| POS-4.3 | Tables & preparation | Table order by seat/course; send delta; station acks (T09–T11) | Not started | POS-4.1 | prep dispatch | POS-4.4, POS-4.8 |
| POS-4.4 | Tables & preparation | Move / join / merge-same-party / change server / reset (T12–T17, T24) | Not started | POS-4.3 | visit ops | POS-4.5 |
| POS-4.5 | Tables & preparation | Split by items / quantity; paid check locked (T18–T19) | Not started | POS-4.4 | check ops | — |
| POS-4.6 | Tables & preparation | Cancel sent item; comp/void/replace (T20, M20) | Not started | POS-4.3 | — | — |
| POS-4.7 | Tables & preparation | Guest QR ordering, substitution, pay my share (T21, Q01–Q07) | Not started | POS-4.3, POS-3.1 | guest visit surface | — |
| POS-4.8 | Tables & preparation | Kitchen station screen (T26) | Not started | POS-4.3 | station UI | — |
| POS-4.9 | Tables & preparation | Minimum spend met / short (T25, T28) | Not started | POS-4.3 | — | — |
| POS-5.0a | Appointments, classes, benefits | Appointment phases decision (bounded discovery) | Not started | POS-1.1b | schema proposal | POS-5.0 |
| POS-5.0 | Appointments, classes, benefits | Booking from POS/customer: A01–A06 | Not started | POS-5.0a, POS-1.8 | booking composer | POS-5.1, POS-5.6, POS-5.9 |
| POS-5.1 | Appointments, classes, benefits | Waitlists (K02, B06, K07) | Not started | POS-5.0 | waitlist | — |
| POS-5.2 | Appointments, classes, benefits | Customer credits/passes ledger (K03–K05, C20) | Not started | POS-5.0 | entitlements | POS-5.3, POS-5.4 |
| POS-5.3 | Appointments, classes, benefits | Memberships incl. pause/cancel/renewal failure (P04, P09) | Not started | POS-5.2 | memberships | — |
| POS-5.4 | Appointments, classes, benefits | Gift cards / stored value (P05, P07, P08) | Not started | POS-3.1 | stored value | — |
| POS-5.5 | Appointments, classes, benefits | Class enrollment, check-in, released place, course (K01, B05, B06, K06) | Not started | POS-5.2 | sessions | — |
| POS-5.6 | Appointments, classes, benefits | Add extra with time re-check; balance (B01–B02) | Not started | POS-5.0, POS-2.6 | — | — |
| POS-5.7 | Appointments, classes, benefits | Customer manage + professional day (A07, A08) | Not started | POS-5.0 | portal/talent views | — |
| POS-5.8 | Appointments, classes, benefits | Reschedule / cancel as operations (A09, A10) | Not started | POS-5.0 | pipeline actions | — |
| POS-5.9 | Appointments, classes, benefits | Travel buffers & zone table for mobile services | Not started | POS-5.0 | travel module | POS-9.1 |
| POS-6.1 | Reservations & packages | Reservation create / unavailable / confirm / amend (R01–R05) | Not started | POS-4.1 | reservations | — |
| POS-6.2 | Reservations & packages | Layout versions share capacity (R06) | Not started | POS-6.1, POS-1.6 | layouts | — |
| POS-6.3 | Reservations & packages | Hybrid package configure/unavailable/issued/refund (P01–P03, P06) | Not started | POS-3.4, POS-6.1 | packages | — |
| POS-6.4 | Reservations & packages | Benefit redemption at table (meal in package) | Not started | POS-6.3 | — | — |
| POS-7.1 | Tickets, gate, projects | Presale E01–E07, multi-day E14 | Not started | POS-3.1, POS-1.6 | presale UI | POS-7.2, POS-7.3 |
| POS-7.2 | Tickets, gate, projects | Lookup, name, transfer, exchange with dependents, partial cancel, comp, delivery (E09–E13, E15) | Not started | POS-7.1, POS-3.4 | ticket ops | — |
| POS-7.3 | Tickets, gate, projects | Gate states G01–G07 + customer ticket E08 | Not started | POS-7.1 | gate | — |
| POS-7.4 | Tickets, gate, projects | Projects: due, projects, amendment (O01, O03, O06) | Not started | POS-3.1 | projects views | POS-7.5 |
| POS-7.5 | Tickets, gate, projects | Talent assignment & customer project views (O04, O05) | Not started | POS-7.4 | — | — |
| POS-9.1 | Field Services | Jobs today, job detail, arrive/start (F01–F02) | Not started | POS-5.9 | field mobile views | POS-9.2 |
| POS-9.2 | Field Services | Work record, extra work acceptance, complete & collect (F03–F05) | Not started | POS-9.1, POS-3.1 | — | POS-9.3 |
| POS-9.3 | Field Services | Problems, recurring occurrences, offline (F06–F08) | Not started | POS-9.2, POS-2.11 | — | — |
| POS-10.1 | Spaces & Resources | Availability timeline + allocations (S01, S03) | Not started | POS-1.6 | spaces mode | POS-10.2 |
| POS-10.2 | Spaces & Resources | Reserve unit, arrive/start/extend/move/release, blocked/reset (S02, S04, S05) | Not started | POS-10.1, POS-3.1 | — | POS-10.3 |
| POS-10.3 | Spaces & Resources | Rental custody & security deposit (S06) | Not started | POS-10.2 | custody | — |

## 2. Blueprint scenarios — 404 rows by family, POS applicability

These are acceptance procedures from the eight blueprints (PR #1934 `scenario-register-404.md`). They are **not** the same coverage as the 240 case-role records and are never summed with them.

| Family | Range | Count | POS-applicable (this program) | Elsewhere (destination) |
|---|---|---|---|---|
| Events | X01–X84 | 84 | ~62 (setup rows with venue/ticket config, event-day, changes/refunds, agency links) | X-rows on page builder/SEO → Website; registry/theme → Settings |
| Spaces | S01–S64 | 64 | 52 (S13–S64) | S01–S12 setup/editor → Spaces workspace |
| POS | P01–P64 | 64 | 64 | — |
| Appointments | A01–A64 | 64 | 55 | A09 (template duration), A24 (external calendar), A56 (calendar import), A61–A62 (theme, analytics) → Catalog/Settings/Analytics |
| Catalog | C-01–C-32 | 32 | 20 (channels, packages, credits, offers at POS, refunds) | C-01–C-02, C-26–C-28 item editing/archive/import → Catalog |
| Website | W01–W32 | 32 | 0 | all → Website builder (widgets bind to the same records) |
| CRM | R01–R32 | 32 | 15 (R03, R06, R08–R12, R17–R20, R29–R32) | imports/merge/segments/AI (R21–R28) → Customers |
| Master / Nav | N01–N32 | 32 | 19 (N05, N07–N12, N17–N23, N25–N27, N29–N31) | N01–N04, N13–N16 registry/preset/theme → Settings; N28, N32 program-level |
| **Total** | | **404** | **≈287** | **≈117** |

Exact per-row applicability is recorded when each row is first executed (status untested until then). Counts marked ≈ are the planning estimate from the row texts; the register itself is the source.

## 3. Case-role records — 240 (48 × CUS · OP · TAL · DIFF · REC)

Status lives in `case-progress.md` (mirrors PR #1934 `scenario-matrix.md`). Evidence dirs: `docs/plans/qa-evidence/<Cxx-ROLE>/`. Partial proofs exist for C01, C02, C06, C07, C08, C09, C12, C26 and count as nothing until the role record is complete.

## 4. Screens

`screen-index.md` — 189 deck screens with stable codes; `coverage-matrix.md` binds them to products; `actions.md` to commands.

## 5. Evidence conventions

Per executed scenario: scenario id, environment (qa-journeys A/B), roles, setup, exact steps, expected visible result, persisted business result, negative/recovery cases, test/procedure, evidence path, severity. Provider/device-dependent rows: **Awaiting external verification** with the exact remaining procedure written in the evidence file.
