-- Phase 0.5, hygiene — revoke what was missed, and ASSERT every revoke took.
--
-- FOUND BY AUDIT, not by failure. The Director generalised a guard I had added
-- almost by reflex into a rule — "a migration that is only safe because of a
-- measurement must assert the measurement" — and asked me to go back over the
-- migrations I thought I had got away with. This is what that found.
--
-- `public.offer_major_to_cents(numeric)` was left EXECUTABLE by `authenticated`.
-- 20261228000143 wrote:
--
--     REVOKE ALL ON FUNCTION ... FROM PUBLIC;
--     REVOKE EXECUTE ON FUNCTION ... FROM anon;
--
-- Supabase grants EXECUTE to `authenticated` EXPLICITLY on every new function,
-- and an explicit grant survives a revoke from PUBLIC. This is the same shape as
-- the recorded incident "REVOKE FROM anon is a NO-OP" — that one was revoking
-- from a role when the grant was on PUBLIC; this is the mirror image, revoking
-- from PUBLIC when the grant is also on a role. Both halves are always required.
--
-- SEVERITY: low, and saying so plainly matters more than dressing it up. The
-- function is IMMUTABLE pure arithmetic — numeric in, bigint out, no table
-- access, no side effects. An authenticated caller learns nothing and changes
-- nothing. Every SECURITY DEFINER function in this track was already correctly
-- locked; the one that leaked is the one that could not do harm.
--
-- The finding that IS worth keeping is the shape: I asserted table grants with
-- has_table_privilege in three migrations and asserted FUNCTION grants in none.
-- The assertion is what turns "I revoked it" into "it is revoked", and it is
-- cheap enough that there is no reason to write the first without the second.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.offer_major_to_cents(NUMERIC) FROM PUBLIC, anon, authenticated;

-- Belt and braces on the rest of the track. These already measured correct;
-- re-issuing is a no-op and keeps one place that states the intent.
REVOKE EXECUTE ON FUNCTION public.ensure_customer_for_tenant(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bookings_write_order()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_customer_rollups(UUID)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.orders_refresh_customer_rollups()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.orders_touch_updated_at()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.customers_touch_updated_at()          FROM PUBLIC, anon, authenticated;

-- ── The assertion the earlier migrations should have carried. ────────────────
DO $$
DECLARE
  r        RECORD;
  v_leaked TEXT := '';
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'offer_major_to_cents', 'ensure_customer_for_tenant', 'bookings_write_order',
         'recompute_customer_rollups', 'orders_refresh_customer_rollups',
         'orders_touch_updated_at', 'customers_touch_updated_at'
       )
  LOOP
    IF has_function_privilege('anon', r.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      v_leaked := v_leaked || r.proname || ' ';
    END IF;

    -- The mirror check. A revoke that also removed service_role would break the
    -- purchase pipeline silently, which is a worse outcome than the leak.
    IF NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'orders: service_role lost EXECUTE on % — the pipeline would fail', r.proname;
    END IF;
  END LOOP;

  IF v_leaked <> '' THEN
    RAISE EXCEPTION 'orders: client roles still hold EXECUTE on: %', v_leaked;
  END IF;
END $$;

COMMIT;
