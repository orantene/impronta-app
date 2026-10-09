# Paid QA on the isolated stack (TUL-464)

One command, no human step beyond starting the stack:

```bash
cd web
# local production build running on :3001, pointed at the isolated project (fxlank),
# Stripe TEST keys, and the two `stripe listen` forwarders (US + MX) up.
set -a; . ../.paidqa.server.env; set +a        # the isolated env, never production
export JOURNEYS_ISOLATED=1
export PAID_QA_BASE_URL=http://hub.localhost:3001
export PAID_QA_PAY_URLS='{"success":"http://hub.localhost:3001/pay/<code1>","decline":"http://hub.localhost:3001/pay/<code2>","threeDS":"http://hub.localhost:3001/pay/<code3>"}'
npm run qa:paid-isolated
```

Evidence (a screenshot per step, `results.json`, `summary.md`) lands in
`docs/plans/qa-evidence/paid-qa-<date>/`.

## Safety rules (enforced in `global-setup.ts`, before any test)

- Supabase target must be the isolated project (`scripts/isolated-target-guard.mjs`); production or Impronta refuse.
- Every Stripe key must be a `*_test_*` key; any live key refuses.
- `PAID_QA_BASE_URL` and every pay URL must be a local host (`localhost`, `127.0.0.1`, `*.localhost`).
- The spec asserts the Stripe checkout page shows **Test mode** before it types a card.
- Only Stripe's published test cards are used (4242 success, 4000 0000 0000 0002 decline,
  4000 0000 0000 3220 3-D Secure).
- Database reads are GETs only. The spec never writes.

## Who runs it

A person or CI runs it. **Agent sessions do not run it**: it types card numbers on a stripe.com page.

## What is NOT covered yet

- Minting the pay links (book -> offer -> pay link) is still done by hand or by the end-to-end run; links are single use,
  so each case needs a fresh one. A missing case URL is reported as *skipped* (never as pass).
- MXN + USD variants: run once per currency by passing links created in each currency.
- Money page and full/partial refund steps: not automated in this first version.
- Status: written 2026-10-09, **not yet run**. First run: adjust `fillCard` selectors if Stripe changed its markup.
