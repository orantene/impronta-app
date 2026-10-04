# Mexico tax withholding — decision (2026-10-02)

**Status:** Locked for now · accountant review required before live MX volume  
**Owner:** Oran · recorded by Track C (code)

## Decision

**No platform tax withholding for Mexico for now.**

Tulala does not calculate, withhold, or remit Mexican tax (ISR / IVA / CFDI split) on Connect payouts or booking settlements at the platform layer today. Stripe fee handling and the platform commission / processing pass-through rule remain separate from tax withholding.

## Why

- Pre-launch; MX live volume is not shipping yet.
- Tax treatment for marketplace / Connect in MX needs accountant sign-off (CFDI, withholding agent status, residency of talent and platform).
- Shipping a wrong withhold formula into production is harder to unwind than shipping none and adding it later behind a clear flag.

## Before live MX volume

1. Accountant review of platform obligations as marketplace / payment facilitator for MX Connect sellers.
2. Explicit product decision on who issues CFDI (talent vs platform vs neither for foreign platform).
3. If withholding is required: schema + payout math + receipt copy + tests; do not improvise at launch week.
4. Update this doc and the payments plan with the accountant outcome before enabling MX booking for real money.

## Related

- Owner decisions in [cursor-next-2026-10-02.md](./cursor-next-2026-10-02.md) §1
- Board: [plans/PM-BOARD.md](./plans/PM-BOARD.md) (Track C-code)
- Lawyer / CFDI items remain in Track G (do not start until Oran says)
