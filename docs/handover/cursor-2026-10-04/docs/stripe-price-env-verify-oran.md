# Oran checklist — Vercel `STRIPE_PRICE_*` vs Stripe US catalog

**Status (2026-10-02):** Could **not** run a read-only verify from the cloud agent.  
`VERCEL_TOKEN` and `STRIPE_SECRET_KEY` are unset in this environment; no prices invented below.

## Important code fact

Checkout no longer reads `STRIPE_PRICE_*` for what to charge. Source of truth is the DB catalog:

- Code: `web/src/lib/stripe/price-catalog.ts` → `product_prices.stripe_price_id`
- Vocabulary only remains in `web/src/lib/stripe/price-ids.ts`
- `.env.example` still lists ten `STRIPE_PRICE_*` keys (legacy / docs drift)

So a stale Vercel `STRIPE_PRICE_*` set may be **harmless to checkout** but still confusing for ops and for anything that still documents env-based prices (`web/docs/third-party-integration-register.md`).

---

## Exact Oran steps (read-only)

### A. List Vercel production env (US)

```bash
cd ~/Desktop/impronta-app/web
# or any checkout with Vercel linked
vercel env ls production | rg 'STRIPE_PRICE_'
# pull values without printing into chat if possible — write to a local notes file:
vercel env pull /tmp/tulala-prod-stripe-prices.env --environment=production --yes
rg '^STRIPE_PRICE_' /tmp/tulala-prod-stripe-prices.env
```

Record each key → `price_…` id (and age / last updated if the CLI shows it). Expected key names:

- `STRIPE_PRICE_STUDIO_MONTHLY` / `_ANNUAL`
- `STRIPE_PRICE_AGENCY_MONTHLY` / `_ANNUAL`
- `STRIPE_PRICE_NETWORK_MONTHLY` / `_ANNUAL` (often unset — sales-assisted)
- `STRIPE_PRICE_TALENT_PRO_MONTHLY` / `_ANNUAL`
- `STRIPE_PRICE_TALENT_PORTFOLIO_MONTHLY` / `_ANNUAL`

### B. List Stripe US live product catalog

```bash
stripe login   # US account acct_1TdcQX5C0mUEeRd1
stripe prices list --limit 100 --active=true
# or Dashboard: Product catalog → Products → each Price id
```

For each active Price used for Tulala plans, note: `price_id`, product name, unit amount, interval, currency.

### C. List DB catalog (shared Supabase)

```sql
select t.slug, p.interval, p.currency, p.stripe_price_id, p.is_active, p.archived_at
from product_prices p
join product_tiers t on t.id = p.tier_id
where p.currency = 'USD'
order by t.slug, p.interval;
```

### D. Compare (fill mismatches — do not invent)

| Plan / interval | Vercel `STRIPE_PRICE_*` | DB `product_prices.stripe_price_id` | Stripe US catalog | Match? |
|---|---|---|---|---|
| studio / month | | | | |
| studio / year | | | | |
| agency / month | | | | |
| agency / year | | | | |
| network / month | | | | |
| network / year | | | | |
| talent_pro / month | | | | |
| talent_pro / year | | | | |
| talent_portfolio / month | | | | |
| talent_portfolio / year | | | | |

**Mismatch rules for Oran:**

1. If **DB ≠ Stripe** → fix DB (or archive bad Stripe price); checkout is wrong.
2. If **Vercel ≠ DB** but DB = Stripe → safe to clear / ignore env vars after confirming nothing else reads them; update the integration register.
3. If **Vercel set and Stripe price deleted/archived** → remove or replace env to avoid future footguns.
4. Network unset on purpose is OK while sales-assisted.

Paste the filled table into this file or a sibling notes path when done; do not paste secret keys.
