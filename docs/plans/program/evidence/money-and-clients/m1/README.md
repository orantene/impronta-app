# M1 — Money definitions + read model

## Scope (Stage C)

- Definitions module (`mc_defs` vocabulary) — audit **3.1** / D8
- Pure Money read model (`summarizeMoneyLedger`) — audit **3.2**
- September 2026 ledger fixture MUST match store `docs/money-and-clients/LEDGER-CONTRACT.md` aggregates (`mc_ledger`)
- Remove static `CollectMethodsPanel` and the Money "Leave an agency" box
- **No new engines**; no live DB loader (M2+ wires UI)

## Files

| Path | Role |
|---|---|
| `web/src/lib/money/definitions.ts` | Collected / Outstanding / … meanings |
| `web/src/lib/money/money-read-model.ts` | Pure aggregates over payment/refund/payout/outstanding rows |
| `web/src/lib/money/september-ledger-contract.ts` | LEDGER-CONTRACT aggregate constants |
| `web/src/lib/money/september-ledger-fixture.ts` | MCP_ / MCR_ / MCO_ / mcOwed rows |
| `web/src/lib/money/september-ledger-fixture.test.ts` | Fixture asserts vs contract |
| `web/src/lib/money/money-page-cleanup.static.test.ts` | Panel removal guard |
| `web/src/components/talent/money/MoneyPage.tsx` | Drop CollectMethods + leave-agency |
| `web/src/components/talent/money/CollectMethodsPanel.tsx` | **Deleted** |
| `web/package.json` | `test:money` includes the two new tests |

## Fixture ↔ LEDGER-CONTRACT

| Key | Contract | Asserted via |
|---|---:|---|
| `collected_gross` | 18450 | `summarizeMoneyLedger` |
| `payments_count` | 24 | same |
| `by_method.card` | 12300 | same |
| `by_method.cash` | 4150 | same |
| `by_method.transfer` | 2000 | same |
| `recorded_outside_tulala` | 6150 | same |
| `refunded` | 120 | same |
| `collected_after_refunds` | 18330 | same |
| `outstanding_total` | 3420 | same |
| `outstanding_overdue` | 620 | Lucía BK-2274 left |
| `outstanding_today` | 2000 | Regina + Camila |
| `outstanding_later` | 800 | Ana Lucía |
| `due_by_today` | 2620 | overdue + today |
| `platform_paid_out` | 7751 | paid payout nets |
| `next_payout_estimated` | 5784 | PO-0925 net |

Note: LEDGER-CONTRACT outstanding table row for Lucía listed Paid 620 / Left 0; **aggregates** say overdue **620**. Fixture follows aggregates (paid 0, left 620). Sofía hold and AG-118 stay out of Outstanding.

## Gates

| Gate | Result |
|---|---|
| Unit: `september-ledger-fixture.test.ts` + cleanup static | **12 pass** (2026-09-25) |
| `npm run typecheck` | **exit 0** |
| `npm run lint` | **exit 0** |

## Base / rebase

- Branch: `feat/mc-m1-definitions-read-model` off `origin/main` @ `605e0567c` (#2273)
- Prefer rebase onto main after **A4** [#2274](https://github.com/orantene/impronta-app/pull/2274) lands (MoneyPage overlap)

## Not in M1

- Payments / Outstanding / Payouts UI (`mc_money` …) → **M2**
- Today tiles → **M3**
- Live loaders over `booking_transactions` / payouts tables → later PRs using this read model
