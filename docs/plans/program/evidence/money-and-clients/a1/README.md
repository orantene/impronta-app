# A1 — One money unit for `total_client_revenue`

## Contract

`agency_bookings.total_client_revenue` is **NUMERIC major units** (e.g. `950.00` MXN),
not integer cents. Agenda previously treated it as cents (Calendar record / pay-link
amount disagreed with the row).

Shared helper: `web/src/lib/money/total-client-revenue.ts`
- `totalClientRevenueToCents` / `majorMoneyToCents`
- wired into `talent-agenda/load.ts`, `load-map.ts`, `booking-actions.ts`
  (cash collect + pay link)

## Proof (SQL, read-only)

On a real booking with `total_client_revenue = 950` (major):

```sql
SELECT id, total_client_revenue, currency_code, payment_status, deposit_amount_cents
FROM agency_bookings
WHERE total_client_revenue > 0
ORDER BY created_at DESC
LIMIT 5;
```

Expected after A1:
- Agenda `money.totalCents` = `round(total_client_revenue * 100)` (e.g. 95000)
- Minted pay-link `amount_cents` = same integer
- Cash-collect remainder compares in cents

Fixture unit test: `web/src/lib/money/total-client-revenue.test.ts`
Agenda mapper fixtures updated to pass **major** values into `total_client_revenue`.
