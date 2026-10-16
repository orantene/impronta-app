# promo_hold concurrency check (manual, test tenant only)

Goal: 10 parallel holds on a promo with `max_redemptions = 3` produce exactly 3
`held` rows and 7 `{ok:false, reason:'exhausted'}`. Run on the TEST tenant only,
after `20261231382000_promo_redemption_service.sql` is applied. Run as
`service_role` (the functions are revoked from anon/authenticated).

## 1. Setup (one transaction, note the ids it prints)

```sql
-- <TENANT> = the test tenant's agencies.id
WITH p AS (
  INSERT INTO public.tenant_promo_codes
    (tenant_id, code, kind, value, max_redemptions, per_customer_limit, label)
  VALUES ('<TENANT>', 'RACE3-' || substr(md5(random()::text), 1, 4), 'percent', 10, 3, 1, 'concurrency test')
  RETURNING id
), c AS (
  INSERT INTO public.customers (tenant_id, email)
  SELECT '<TENANT>', 'race' || g || '+' || substr(md5(random()::text), 1, 6) || '@example.test'
    FROM generate_series(1, 10) g
  RETURNING id
)
SELECT (SELECT id FROM p) AS promo_id, array_agg(c.id) AS customer_ids FROM c;
```

## 2. Fire 10 holds in parallel

Each hold needs its own session so they really contend on the row lock. With
`psql` and the service-role connection string in `$DB`:

```bash
PROMO=<promo_id>
for CUST in <10 customer ids, space separated>; do
  psql "$DB" -Atc "SELECT public.promo_hold('$PROMO', '$CUST', NULL, gen_random_uuid(), NULL, 10, 0, true, 'code', 'new');" &
done
wait
```

(`p_booking_id` is a fresh uuid per call so the booking anchor CHECK passes and
no two holds share a booking index slot.)

## 3. Expect

```sql
SELECT status, count(*) FROM public.tenant_promo_redemptions
 WHERE promo_code_id = '<promo_id>' GROUP BY status;
-- held | 3
```

and exactly 7 of the 10 printed results are
`{"ok": false, "reason": "exhausted"}`. Any count other than 3 is a bug: stop
and report.

## 4. Extra checks (optional)

- Expiry frees a seat: `UPDATE ... SET hold_expires_at = now() - interval '1 second'`
  on one held row, then one more `promo_hold` for a fresh customer returns ok.
- Same customer twice in parallel: only one `held`, the other `hold_exists`
  (or `customer_limit_reached`).
- Sweep: `SELECT public.promo_sweep_expired_holds(500);` returns `released >= 1`.

## 5. Cleanup

```sql
DELETE FROM public.tenant_promo_codes WHERE id = '<promo_id>';  -- cascades redemptions
DELETE FROM public.customers WHERE email LIKE 'race%@example.test' AND tenant_id = '<TENANT>';
```
