-- HELD MIGRATION (D5, TUL-1268 M7): one live order per (tenant, clientOrderKey).
--
-- WHY. `createPurchase` takes a `clientOrderKey` documented as "the idempotency
-- anchor", and nothing stored or checked it: a double-tapped Pay minted two
-- orders, two payment rows and two Stripe Checkout sessions. The app now writes
-- the key to `orders.client_order_key` and looks it up before any write
-- (`web/src/lib/orders/purchase-idempotency.ts`); this index is the part a race
-- cannot get past. The loser's INSERT fails with 23505 on
-- `orders_tenant_client_order_key_uniq` and the app replays the winner.
--
-- PARTIAL on `status <> 'cancelled'`: a refused attempt is unwound to
-- `cancelled` by the pipeline, and the same key must be able to try again.
--
-- ORDER OF SHIPPING. Code first is safe: until this runs, the app sees 42703 on
-- the lookup, skips the column and behaves exactly as before. After it runs, the
-- same deploy starts enforcing with no code change. Existing rows get NULL and
-- are outside the index, so the build cannot fail on old duplicates.
--
-- ADDITIVE ONLY: one nullable column, one partial unique index. No backfill.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS client_order_key text;

COMMENT ON COLUMN public.orders.client_order_key IS
  'Per-intent idempotency key from the purchase caller (PurchaseInput.clientOrderKey). '
  'Unique per tenant among non-cancelled orders; a repeat submit replays the first order.';

CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_client_order_key_uniq
  ON public.orders (tenant_id, client_order_key)
  WHERE client_order_key IS NOT NULL AND status <> 'cancelled';

COMMIT;

-- ── Verification (read-only) ────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'client_order_key';
-- SELECT indexname, indexdef
--   FROM pg_indexes
--  WHERE schemaname = 'public' AND indexname = 'orders_tenant_client_order_key_uniq';
-- -- expected: 1 row each; indexdef ends with
-- -- WHERE ((client_order_key IS NOT NULL) AND (status <> 'cancelled'::order_status))
-- SELECT tenant_id, client_order_key, count(*)
--   FROM public.orders
--  WHERE client_order_key IS NOT NULL AND status <> 'cancelled'
--  GROUP BY 1, 2 HAVING count(*) > 1;
-- -- expected: 0 rows
--
-- ── Rollback ────────────────────────────────────────────────────────────────
-- Safe at any time: the app treats a missing column as "not applied yet".
-- BEGIN;
-- DROP INDEX IF EXISTS public.orders_tenant_client_order_key_uniq;
-- ALTER TABLE public.orders DROP COLUMN IF EXISTS client_order_key;
-- COMMIT;
