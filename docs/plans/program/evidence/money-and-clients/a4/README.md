# A4 — Money shows real numbers

## Defects

- #7 MXN talent saw USD $0 when multi-currency display was off
- #8 Ledger row opened fixture `TalentEarningsDetailDrawer` (`EARNINGS_ROWS`)
- #9 Load failure collapsed to empty/$0 instead of an error
- `partially_paid` alias — writers use `partial`

## Changes

- `applyOperatingCurrencyToEarnings` prefers talent `defaultCurrency` (MXN visible)
- `MoneyPage` / resolvers never fall back to `EARNINGS_ROWS` fixtures
- Ledger rows are not clickable into the fixture drawer (detail returns in M2)
- `TalentEarningsByCurrency.loadError` + error card on Money
- `mapBookingPayoutStatus` accepts `partial` (keeps legacy `partially_paid`)

## Proof

Unit: `web/src/lib/platform/operating-currency.test.ts`
