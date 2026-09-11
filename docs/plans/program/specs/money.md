# Money: sales, payments, settlements, and the settings that feed them

Source: `docs/plans/program/pos/`  -  screen-index.md, actions.md, modes.md, decisions.md, v3.1-corrections.md, coverage-matrix.md. Data verified against `supabase/migrations/*.sql` and `web/src/lib/{pos,orders,payments}` in this worktree on 2026-09-09.

## 1. The journey

A cashier is trying to collect what is owed, correctly, whatever the sale's origin (a counter item, a table check, a booking deposit, a class enrollment, an event ticket, a project milestone), and to reach one of a small number of clear end states: paid, declined-and-retryable, or unknown-and-needing-a-human. A manager is trying to authorize the exceptions the cashier cannot: a discount over their limit, a refund, an alternate-collection method when a payment attempt's outcome is unknown. A shift owner is trying to open and close a cash drawer with a count that reconciles. Everyone touching money is trying to never lose track of "was this actually collected," even across a declined card, a crashed browser, or two devices racing to close the same sale.

Every product journey in the program funnels through the same shared payment states (M01–M12) with the product supplying only the amount, the record, and the return destination  -  coverage-matrix.md's "shared M" convention.

## 2. Screens in this slice

1. **M01** Cash · tender  -  enter cash received.
2. **M02** Cash · not enough  -  tender is short; confirm stays disabled.
3. **M03** Cash · drawer open, change  -  change is stated, drawer opens.
4. **M04** Cash · Spanish  -  the same M01 flow, ES labels.
5. **M05** Card · waiting  -  a reader attempt is in flight.
6. **M06** Card · checking  -  outcome unknown; new payment disabled until resolved.
7. **M07** Card · declined  -  sale is intact, retry available.
8. **M08** Card · received after cancel  -  a late success on an attempt the operator gave up on; applied once.
9. **M09** Two methods · setup  -  split payment configuration.
10. **M10** Two methods · second failed  -  partial collected amount stated in both panels.
11. **M11** Another device is collecting  -  attempt ownership is visible.
12. **M12** Takeover · waiting for the other reader.
13. **M13** Paid · receipt & next  -  the shared success state.
14. **M14** Receipts  -  list.
15. **M15** Receipt detail.
16. **M16** Refund · choose & effects  -  what a refund will do before it happens.
17. **M17** Refund · pending.
18. **M18** Refund · failed  -  only provider-supported fallbacks offered, never a disguised card refund.
19. **M19** Refund · completed.
20. **M20** Comp, void or replace  -  a line-level money-free effect.
21. **M21** Drawer · not open.
22. **M22** Drawer · open, movements, handover.
23. **M23** Drawer · close & count.
24. **M24** Issues  -  the list of things needing a human.
25. **M25** Issue detail.
26. **M26** Collect another way · authorized exception  -  the policy-gated alternate-collection path.
27. **M27** Devices.
28. **M28** Connection  -  offline/degraded state.
29. **M29** Back online · conflict  -  reconciling what happened while offline, never inventing a correction.
30. **M30** Locked.
31. **M31** Not allowed · get approval.
32. **M32** Two sellers · separate checkouts (remaining states).
33. **M33** Switch mode · safe (remaining states).
34. **D01–D08** Customer display  -  idle, review & tip, custom tip, confirm, waiting, declined, paid & receipt, receipt contact.

Related settings, outside this slice's screen numbering but supplying it: **W20** Settings › POS (modes, devices, drawers), **W21** Settings › Payments & providers, **W22** Settings › Roles & limits (POS action limits), **W25** Payments · reconciliation.

## 3. Data per screen

- **M01–M04 cash**: `pos_shifts` (confirmed table: `status` open/closed, `opening_cash_cents`, `closing_cash_cents`, `expected_cash_cents`, `version` for optimistic concurrency) via `lib/pos/shift.ts` (confirmed present). The tender/change/drawer-movement itself is computed against the payable's total (`orders.total_cents` or the product's shared context)  -  cash received is not separately persisted as a row today beyond the shift's own running totals; **not in the database yet**: a per-transaction cash-movement or denomination-count table. `pos_shifts` has only aggregate `opening_cash_cents`/`closing_cash_cents`/`expected_cash_cents` columns, no child table for individual movements, reasons, or denominations  -  confirmed by grep across every migration for a movement/denomination table, none found. This is what blocks M22's "movements, handover" beyond a single running total, and M23's "denomination count" beyond a single closing figure.
- **M05–M12 card**: Stripe path via `web/src/lib/payments/{stripe-checkout,stripe-payment-intent,webhook-v2,refunds,transfers}.ts` (all confirmed present) and `stripe_processed_events` (confirmed table, idempotency). Mercado Pago path via `web/src/lib/payments/mercado-pago-collection.ts` (confirmed present, on this candidate branch). An "attempt" itself  -  decisions.md and actions.md both refer to a stable attempt id, and `command_idempotency`/`outbox_messages` (confirmed table, `supabase/migrations/20261230001300_command_envelope_and_outbox.sql`) is the mechanism that gives a charge command one stable id whose retries dedupe rather than double-charge. M11/M12 (another device collecting / takeover) needs attempt ownership (which device/operator holds the live attempt)  -  **unverified** which column on which table records that ownership; would verify by reading the actual attempt-creation code in `lib/pos/collection.ts`.
- **M13 paid**: on success, writes through `lib/orders/complete-order.ts` (confirmed) to `orders.status = 'paid'`, and whatever allocation/issuance the product needs (an `admissions` row for a ticket/session, a `booking_talent`/`agency_bookings` update for a deposit, etc.)  -  each product's own issued-record column in coverage-matrix.md names the specific table.
- **M14–M15 receipts**: `orders`/`order_lines` plus `lib/orders/receipt-code.ts` (confirmed present) for the customer-facing code. Reprint tracking and receipt history UI are named in baseline.md as not built ("receipt history UI, reprint tracking"  -  Not anywhere).
- **M16–M19 refunds**: `lib/orders/{refund-plan,refund-execute-lines,refund-admissions}.ts` (all confirmed present) plus the provider's own `lib/payments/refunds.ts` (confirmed present). `ticket_refund_intents` (confirmed table, `supabase/migrations/20261229000807_ticket_refund_intents.sql`) is the pending/failed/completed state machine for M17–M19 specifically for admission-bearing refunds. v3.1-corrections.md (page 98) is binding here: only a provider-supported retry to the same card, or store credit with consent, or an owner-approved manual disbursement stated explicitly as "not a card refund"  -  never a disguised alternate-card refund.
- **M20 comp/void/replace**: a line-level effect on `order_lines`/`preparation_ticket_revisions` (see tables.md T20) with no money movement  -  a waste/comp record. **Unverified** whether a dedicated waste-record table exists distinct from the preparation ticket revision snapshot; would verify by reading the M20 command once written.
- **M21–M23 drawer**: `pos_shifts`, as above. The gap (no movements/denominations table) applies here directly.
- **M24–M25 issues**: **Unverified** backing table. Actions.md's evidence column for these rows cites scenario ids (P14, P16, P18, P60–P64) rather than a named table, and no `pos_issues` or equivalent table was found in `supabase/migrations/`. Given M06 (unknown card outcome), M11/M12 (attempt takeover), and M26 (alternate-collection exception) all need something to land in when a human must intervene, and none of them named a table either, this is likely the same missing capability as the movements gap: **not in the database yet**, an issues/exceptions queue that these several screens all feed.
- **M26 collect-another-way**: policy-gated per D-POS-7 (decisions.md: "Keep, only with the M26 policy... both records, provider-only refund, owner approval"). Writes a second payment attempt flagged as an overpayment candidate, per actions.md  -  depends on the same attempt-ownership mechanism as M11/M12 and the same issues queue as M24/M25 if either payment later needs reconciling.
- **M27–M29 devices/connection/conflict**: device registry is named in baseline.md as "Not anywhere" (terminal device registry). Connection/offline state (M28, M29) has a design (C27/M28/M29 per preserved-changed-added-unverified.md) but "no offline implementation exists"  -  confirmed by that document directly. D-POS-5 (decisions.md) rules the launch scope as "Online + cash-only degraded mode," which does not require a local capacity model.
- **M30–M31 lock/not-allowed**: `agency_memberships`/`staff_permissions` (see people.md), PIN-gated per-device user switch. **Not in the database yet**: the POS-specific role layer (cashier/server/host/kitchen/gate) that M31's "get approval" would check against  -  same gap as people.md's Access hat section.
- **M32/M33**: no new tables; M33 (switch mode) is a server-side permission check (actions.md: "server check (POS-1.7)") over the same Access data, confirming a saved sale, drawer, and attempt ownership survive the switch.
- **D01–D08 customer display**: reads the same `orders`/attempt state as the paired cashier screen; no separate table. Hardware-dependent (baseline.md: "Awaiting external... hardware").

## 4. Refusals and empty states

- M02: confirm stays disabled while tender is short (actions.md).
- M06: "New payment disabled until result"  -  a second charge attempt must not be offered while the first's outcome is unknown (actions.md, M06/M11–M12 row).
- M08: a late success on an attempt the operator moved past is applied once and only once, never silently ignored and never double-applied (v3.1-corrections.md page 81–90; actions.md: "late success applied once").
- M11: an attempt already owned by another device does not offer a new-payment control on this one (actions.md: "other seller not selectable" is the analogous rule stated for booking links; the direct M11 rule is in modes.md's safe-switching section: "an in-progress payment stays attached to its payable, device and owner").
- M18: only provider-supported retry, store credit with consent, or an explicitly-labelled non-card manual disbursement  -  never a fallback disguised as a card refund (v3.1-corrections.md page 98, binding).
- M22/M23 (today, given the schema gap above): the design's "movements, handover" and "denomination count" cannot be backed by more than the shift's single running total until a movements table exists  -  this must be stated as a known gap in any close-out UI, not implemented against a table that does not exist.
- M25/M26: "PIN is not evidence about the first charge, both payments recorded, overpayment refunded only via the provider by an authorized person, refund failure goes to Issues, guest told by the channel on file; no timing promised" (v3.1-corrections.md page 105–106, binding correction  -  supersedes an earlier draft that implied "cash is safe" and an automatic refund).
- M29: a sync conflict must offer the operator a choice among named, evidenced outcomes (separate handovers / duplicate entry / oversell / unknown)  -  never an invented "corrected stock" with no evidence (v3.1-corrections.md page 109).
- M30: PIN attempts are throttled after 3 (actions.md).
- General: "Payment in progress" or any attempt-context chip appears only while an attempt is actually open, otherwise "No payment in progress"  -  no stale label (v3.1-corrections.md page 81–90).

## 5. Definition of done

The one journey that must pass end to end on the QA host: a cash sale (M01→M03→M13) reaches a receipt (M14/M15) with the drawer's running total correctly updated, a refund of part of that sale (M16→M17→M19) correctly reduces the settled total and is reflected on the receipt, and a card attempt whose outcome is deliberately left unresolved (simulated) correctly disables a new payment (M06) rather than allowing a double charge. Card-terminal states (M05, M07–M12) beyond this simulated unknown-outcome case are Awaiting external verification per decisions.md (D-POS-4: no card reader arrangement or sandbox decided) and are out of this pass's done bar. Drawer movements/denominations (M22/M23) and the issues queue (M24/M25) cannot be verified beyond a single running total and scenario ids respectively, because their backing tables do not exist yet, named in §3.
