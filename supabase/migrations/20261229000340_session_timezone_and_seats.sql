-- 20261229000340_session_timezone_and_seats.sql — Sessions & Classes P1.2.
--
-- Two things: the zone a series was AGREED in, and the one safe way to change a
-- session's seat count. No new table. `sessions` and `session_series` are
-- otherwise exactly as P1.1 (`20261229000214`) shipped them.
--
-- Plan: docs/plans/sessions-classes-plan.md
--
--
-- WHY A SERIES CARRIES ITS OWN TIMEZONE, WHICH LOOKS LIKE A DUPLICATE
-- ══════════════════════════════════════════════════════════════════
-- `venues.timezone` is `text NOT NULL DEFAULT 'UTC'`. Measured on production on
-- 2026-09-03: ALL THIRTEEN venues carry that default, including two named
-- "Riviera Maya Work" and one "Casa Muna", none of which is in UTC. So the
-- stored zone cannot distinguish "the operator chose UTC" from "nobody has ever
-- opened the venue screen". It is a value pretending to be a setting.
--
-- For most readers of that column, guessing wrong is cosmetic. For this feature
-- it is the whole feature: a class in Playa del Carmen materialises six hours
-- off, at instants that are every one of them valid, and the first signal is a
-- customer arriving to an empty room. Nothing downstream knows what hour was
-- intended, so there is no later check that could catch it.
--
-- Hence NULL, and hence the materialiser refusing on NULL rather than falling
-- back. Absence is structurally distinct from a value — the standing department
-- rule, applied to a column instead of a function.
--
-- And the duplication is deliberate, because the two columns answer different
-- questions:
--
--     venues.timezone          — where is this venue NOW
--     session_series.timezone  — what did the operator AGREE these classes
--                                recur in
--
-- A venue that moves city must not silently reschedule twelve weeks of sold
-- classes. This is the one second timezone store this area adds, on purpose,
-- and there will not be another.
--
--
-- WHY SEATS NEED AN RPC AND NOT AN UPDATE
-- ═══════════════════════════════════════
-- Copied in shape from `set_offering_stock` (`20261229000211`) rather than
-- re-derived, because that arithmetic is already ratified and proven:
--
--   units_total := available + held, under the pool's row lock.
--
-- Writing the raw number instead shrinks the ceiling below what is already
-- held, and the next release then pushes remaining ABOVE it. Two ratified
-- semantics come with it, unchanged here: reducing below what is held NEVER
-- cancels a hold (taking a seat back from someone who paid is a refund
-- decision, not a side effect of an editor field), and going unlimited
-- DEACTIVATES the pool rather than deleting it, because the allocations are the
-- record of what was sold and what settles a dispute.
--
-- One difference from the offering case, and it is an improvement: there is no
-- mirror column. `talent_offerings.inventory_qty` has to be kept in step with
-- its pool and can desync. A session's seat count lives ONLY on the pool, so
-- there is nothing to desync.
--
--
-- NOT IN THIS MIGRATION, DELIBERATELY
-- ═══════════════════════════════════
-- No `kind` column on `sessions`. An earlier revision of the plan added one for
-- a `meeting_point` guard; withdrawn, because there is no tour or departure
-- feature and no reader, and a column with no reader now is a column read
-- wrongly later. It costs nothing to add the day a departure exists.
--
--
-- TIMESTAMP: band 202612290003xx (Sessions & Classes, `…340`-`…359`), granted
-- by the Director and announced before applying. Verified free against the
-- REMOTE ledger, not the local directory: the highest rows are 320 (Appointments),
-- 400 and 500, so 340 is unclaimed and sorts above everything this depends on
-- (`capacity_subject_kinds` at 212, `sessions` at 214, `venues` at 220).
--
-- APPLY WITH `node web/scripts/apply-migration.mjs`, never `db push`.
-- DRY-RUN FIRST under BEGIN … ROLLBACK through the Management API.

BEGIN;

-- ─── 1. the agreed zone ─────────────────────────────────────────────────────

ALTER TABLE public.session_series
  ADD COLUMN IF NOT EXISTS timezone text;

-- Not NOT NULL, and not defaulted. NULL is the load-bearing value: it means no
-- human has confirmed a zone for this series, and the materialiser refuses.
-- A default here would recreate the exact defect this column exists to escape.
ALTER TABLE public.session_series
  DROP CONSTRAINT IF EXISTS session_series_timezone_nonblank;
ALTER TABLE public.session_series
  ADD CONSTRAINT session_series_timezone_nonblank
  CHECK (timezone IS NULL OR length(btrim(timezone)) > 0);

COMMENT ON COLUMN public.session_series.timezone IS
  'IANA zone the operator CONFIRMED for this series. NULL = unconfirmed, and the materialiser refuses rather than falling back to venues.timezone, whose NOT NULL DEFAULT ''UTC'' cannot tell "chosen" from "never set". Not a cache of the venue: a venue that moves city must not reschedule sold classes.';

-- ─── 2. set_session_seats ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_session_seats(
  p_session_id uuid,
  p_available  int,
  p_tenant_id  uuid DEFAULT NULL,
  p_tier_key   text DEFAULT 'default'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_pool   uuid;
  v_held   int;
  v_total  int;
  v_key    text := COALESCE(NULLIF(btrim(p_tier_key), ''), 'default');
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_not_found');
  END IF;

  -- The caller is a server action reachable by any authenticated staff member,
  -- so "service-role only" says nothing about WHICH workspace is asking.
  -- Reported as session_not_found rather than a distinct reason: a caller from
  -- the wrong tenant learns nothing about whether the id exists.
  IF p_tenant_id IS NOT NULL AND v_tenant IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_not_found');
  END IF;

  IF p_available IS NOT NULL AND p_available < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'negative_seats');
  END IF;

  SELECT id INTO v_pool FROM public.capacity_pools
   WHERE tenant_id = v_tenant AND subject_kind = 'session_tier'
     AND subject_id = p_session_id AND pool_key = v_key;

  -- NULL = unlimited. Deactivate, never delete: the allocations under this pool
  -- are the record of what was sold, and deleting the pool cascades them away.
  IF p_available IS NULL THEN
    IF v_pool IS NOT NULL THEN
      UPDATE public.capacity_pools SET is_active = false, updated_at = now()
       WHERE id = v_pool;
    END IF;
    RETURN jsonb_build_object('ok', true, 'pool_id', v_pool, 'available', NULL,
                              'held', 0, 'units_total', NULL);
  END IF;

  IF v_pool IS NULL THEN
    v_pool := public.upsert_capacity_pool(
      p_tenant_id        => v_tenant,
      p_subject_kind     => 'session_tier',
      p_subject_id       => p_session_id,
      p_units_total      => p_available,
      p_pool_key         => v_key,
      p_parent_pool_id   => NULL,
      p_overbook_units   => 0,
      p_hold_ttl_seconds => 900,
      p_unit_label       => 'seat',
      p_is_active        => true);
    RETURN jsonb_build_object('ok', true, 'pool_id', v_pool, 'available', p_available,
                              'held', 0, 'units_total', p_available);
  END IF;

  -- Serialise against concurrent reserves on this pool. Everything below reads
  -- and writes under this lock, which is what makes available + held atomic.
  PERFORM 1 FROM public.capacity_pools WHERE id = v_pool FOR UPDATE;

  -- Live units only: committed, or a hold that has not lapsed. An expired hold's
  -- units are already promised to somebody else and must not inflate the total.
  SELECT COALESCE(SUM(units), 0) INTO v_held
    FROM public.capacity_allocations
   WHERE pool_id = v_pool
     AND (state = 'committed' OR (state = 'hold' AND expires_at > now()));

  v_total := p_available + v_held;

  UPDATE public.capacity_pools
     SET units_total = v_total, is_active = true, updated_at = now()
   WHERE id = v_pool;

  RETURN jsonb_build_object('ok', true, 'pool_id', v_pool, 'available', p_available,
                            'held', v_held, 'units_total', v_total);
END;
$function$;

-- ─── 3. grants, both directions ─────────────────────────────────────────────
-- Supabase grants EXECUTE to `authenticated` explicitly on every new function,
-- and an explicit role grant SURVIVES a revoke from PUBLIC. So revoking from
-- PUBLIC alone is a no-op that reads as a fix. Both, then assert both.

REVOKE ALL ON FUNCTION public.set_session_seats(uuid, int, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_session_seats(uuid, int, uuid, text)
  TO service_role;

DO $assert$
DECLARE
  v_sig text := 'public.set_session_seats(uuid, int, uuid, text)';
BEGIN
  -- A guard that can only fail one way is half a guard. Assert the leak is
  -- closed AND that the caller that needs it still has it: a revoke that
  -- over-reached would break the editor silently, which is worse than the leak.
  IF has_function_privilege('anon', v_sig, 'EXECUTE')
     OR has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'set_session_seats is executable by a client role';
  END IF;
  IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'set_session_seats is NOT executable by service_role';
  END IF;
END;
$assert$;

-- ─── 4. assert what this migration claims to have done ──────────────────────
-- The migration ledger records that a file ran, never that it worked.

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'session_series'
       AND column_name = 'timezone' AND is_nullable = 'YES'
       AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'session_series.timezone missing, or not nullable-with-no-default';
  END IF;
END;
$verify$;

COMMIT;
