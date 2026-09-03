-- 20261229000200_capacity_engine.sql — Phase 0.2, the capacity engine.
--
-- "Sell the Room" §04. Everything the Platform Features department builds next
-- (classes, tickets, tables, VIP tables, stock) needs one sentence the platform
-- cannot say today: "N units of something over a time window". This file is that
-- sentence and nothing else.
--
-- WHAT THE PLATFORM CAN SAY TODAY, verified on origin/main @ 2e2868ef3:
--   * talent_holds carries a btree_gist EXCLUDE (appointments_v1.sql:551) with no
--     quantity term, and it is `WHERE hold_strength = 'firm'` — soft holds already
--     overlap freely. It is the N=1 special case of this engine.
--   * talent_offerings.inventory_qty is one global integer with no time dimension,
--     no hold, no ledger. Exactly ONE row on the whole platform sets it.
-- Neither is touched here. This migration adds tables and functions; it changes
-- no existing behaviour. Callers arrive in 0.3.
--
-- TIMESTAMP: the filenames in this repo are a FUTURE-DATED LOCAL SEQUENCE, not
-- wall clock (see 20261124000000's header). At authoring time the local directory
-- head was 20261226000010 but the REMOTE ledger head was 20261228000141 — reading
-- the directory to pick a stamp would have collided. 20261229000200 sorts above
-- both. Announced to the Director before push, per the department rules.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`, never
-- `db push` and never the MCP apply_migration tool: migrations applied from
-- unmerged branches make `--include-all` unsafe, and the MCP tool stamps its own
-- now() version instead of the filename (four recorded occurrences).
--
--
-- WHY A ROW LOCK AND NOT A SECOND EXCLUSION CONSTRAINT
-- ════════════════════════════════════════════════════
-- An EXCLUDE constraint compares an incoming row against OTHER ROWS. It cannot
-- compare it against a TOTAL that lives on a different table's row. Making an
-- EXCLUDE possible would mean denormalising units_total onto every allocation,
-- and then a single capacity edit has to rewrite every live allocation or the
-- guard silently disagrees with the pool. That is fragile in exactly the way a
-- capacity guard must not be.
--
-- Per-pool `SELECT … FOR UPDATE` is the serialisation reserve_offering_stock
-- already uses today, and a pool is one venue-thing (a table, a class, a tier),
-- so contention is bounded by how many people are buying the SAME table in the
-- same instant. The concurrency proof for this design is 200 concurrent reserves
-- against a 12-unit pool committing exactly 12.
--
-- Ancestors are locked ROOT-FIRST (ascending position in pool_path) so two
-- reserves on sibling tables can never deadlock on their shared room.
--
--
-- WHY 'released' IS A THIRD STATE AND NOT A DELETE
-- ═══════════════════════════════════════════════
-- Remaining capacity here is DERIVED from rows, never stored as a counter. That
-- is what makes a double release structurally impossible to inflate: the second
-- call finds the row already released and changes nothing. A DELETE would clamp
-- equally well, but it throws away which order line released how many units and
-- when — which refunds-by-line (0.8) and the no-show roll-up both want.
--
--
-- WHY THE REAPER IS HYGIENE HERE AND WAS CORRECTNESS FOR talent_holds
-- ══════════════════════════════════════════════════════════════════
-- The gist constraint on talent_holds CANNOT see expires_at, so a lapsed firm
-- hold deadlocks the slot until a row is deleted — shipping that constraint
-- without its reaper would have been a bug. Here, the remaining-units rule
-- ignores expired holds by definition, so a late reaper costs table size and
-- nothing else. The lazy reap runs inside the pool lock at the top of a reserve;
-- the cron is the sweep for pools nobody is currently buying.

BEGIN;

-- ─── 1. capacity_pools ──────────────────────────────────────────────────────
-- "N units of subject S." A pool knows units. A pool NEVER knows prices: money
-- lives on order lines, and Finance owns it.

CREATE TABLE IF NOT EXISTS public.capacity_pools (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  subject_kind      text NOT NULL CHECK (subject_kind IN
                      ('offering','space','space_group','session_tier','person')),
  subject_id        uuid NOT NULL,
  -- A subject may carry more than one pool: a table sold as four seats AND as a
  -- single buy-out; an offering with a per-session tier. 'default' is the common
  -- case and every consumer that needs only one pool can ignore this column.
  pool_key          text NOT NULL DEFAULT 'default'
                      CHECK (pool_key ~ '^[a-z0-9][a-z0-9_-]{0,48}$'),
  parent_pool_id    uuid REFERENCES public.capacity_pools(id) ON DELETE RESTRICT,
  -- Materialised ancestor chain, ROOT-FIRST, INCLUDING self. Maintained by the
  -- trigger below; never written by hand. This is what makes "a child's
  -- allocations count against every ancestor" one indexed scan per ancestor
  -- instead of a recursive CTE per check.
  pool_path         uuid[] NOT NULL,
  units_total       int  NOT NULL CHECK (units_total >= 0),
  overbook_units    int  NOT NULL DEFAULT 0 CHECK (overbook_units >= 0),
  -- 0.9: the hold TTL is per pool, replacing the hardcoded 48h in
  -- reservation-hold.ts. Tickets want ten minutes, tables fifteen, a quoted job
  -- still wants two days. 30s floor, 7d ceiling.
  hold_ttl_seconds  int  NOT NULL DEFAULT 900
                      CHECK (hold_ttl_seconds BETWEEN 30 AND 604800),
  unit_label        text,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Depth cap bounds the reserve walk. Venue > room > area > table > seat is 5.
  CONSTRAINT capacity_pools_depth CHECK (array_length(pool_path, 1) BETWEEN 1 AND 6)
);

CREATE UNIQUE INDEX IF NOT EXISTS capacity_pools_subject_uniq
  ON public.capacity_pools (tenant_id, subject_kind, subject_id, pool_key);
CREATE INDEX IF NOT EXISTS capacity_pools_tenant_idx
  ON public.capacity_pools (tenant_id);
CREATE INDEX IF NOT EXISTS capacity_pools_parent_idx
  ON public.capacity_pools (parent_pool_id) WHERE parent_pool_id IS NOT NULL;

COMMENT ON TABLE public.capacity_pools IS
  'Capacity engine (Sell the Room 0.2): N units of a subject. Units only, never prices.';
COMMENT ON COLUMN public.capacity_pools.pool_path IS
  'Materialised ancestor chain, root-first, includes self. Trigger-maintained.';

-- ─── 2. capacity_allocations ────────────────────────────────────────────────
-- "k units of pool P from t1 to t2, held until expiry or committed by order
-- line L." A NULL range is timeless stock.

CREATE TABLE IF NOT EXISTS public.capacity_allocations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  pool_id        uuid NOT NULL REFERENCES public.capacity_pools(id) ON DELETE CASCADE,
  -- Copy of the pool's pool_path at insert time.
  pool_path      uuid[] NOT NULL,
  -- FK deliberately absent: order_lines does not exist until Orders 0.5, which
  -- adds the constraint. Until then this is a free-form correlation id.
  order_line_id  uuid,
  starts_at      timestamptz,
  ends_at        timestamptz,
  units          int  NOT NULL CHECK (units > 0),
  state          text NOT NULL DEFAULT 'hold'
                   CHECK (state IN ('hold','committed','released')),
  expires_at     timestamptz,
  released_at    timestamptz,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capacity_allocations_range_check
    CHECK ((starts_at IS NULL) = (ends_at IS NULL)
           AND (ends_at IS NULL OR ends_at > starts_at)),
  CONSTRAINT capacity_allocations_hold_expires
    CHECK (state <> 'hold' OR expires_at IS NOT NULL),
  CONSTRAINT capacity_allocations_released_stamp
    CHECK ((state = 'released') = (released_at IS NOT NULL))
);

-- The hot path: "live allocations charged against pool X". Partial on state so
-- released rows (which accumulate forever) never enter the index.
CREATE INDEX IF NOT EXISTS capacity_allocations_path_gin
  ON public.capacity_allocations USING gin (pool_path)
  WHERE state <> 'released';
CREATE INDEX IF NOT EXISTS capacity_allocations_pool_window_idx
  ON public.capacity_allocations (pool_id, starts_at, ends_at)
  WHERE state <> 'released';
CREATE INDEX IF NOT EXISTS capacity_allocations_reap_idx
  ON public.capacity_allocations (expires_at) WHERE state = 'hold';
CREATE INDEX IF NOT EXISTS capacity_allocations_order_line_idx
  ON public.capacity_allocations (order_line_id) WHERE order_line_id IS NOT NULL;

COMMENT ON TABLE public.capacity_allocations IS
  'Capacity engine (Sell the Room 0.2): k units of a pool over a window, held or committed. NULL range = timeless stock.';

-- ─── 3. pool_path maintenance ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.capacity_pools_set_path()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_parent public.capacity_pools;
  v_allocs int;
BEGIN
  -- Re-parenting a pool that already carries allocations would leave every one
  -- of those allocations charging the OLD chain. Refuse; rebuild instead.
  IF TG_OP = 'UPDATE' AND NEW.parent_pool_id IS DISTINCT FROM OLD.parent_pool_id THEN
    SELECT count(*) INTO v_allocs
      FROM public.capacity_allocations
     WHERE pool_id = NEW.id AND state <> 'released';
    IF v_allocs > 0 THEN
      RAISE EXCEPTION 'capacity: cannot re-parent a pool with % live allocation(s)', v_allocs
        USING ERRCODE = 'CP014';
    END IF;
  END IF;

  IF NEW.parent_pool_id IS NULL THEN
    NEW.pool_path := ARRAY[NEW.id];
  ELSE
    SELECT * INTO v_parent FROM public.capacity_pools WHERE id = NEW.parent_pool_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'capacity: parent pool not found' USING ERRCODE = 'CP010';
    END IF;
    IF v_parent.tenant_id <> NEW.tenant_id THEN
      RAISE EXCEPTION 'capacity: parent pool belongs to another tenant' USING ERRCODE = 'CP011';
    END IF;
    IF NEW.id = ANY(v_parent.pool_path) THEN
      RAISE EXCEPTION 'capacity: parent pool would create a cycle' USING ERRCODE = 'CP012';
    END IF;
    NEW.pool_path := v_parent.pool_path || NEW.id;
  END IF;

  IF array_length(NEW.pool_path, 1) > 6 THEN
    RAISE EXCEPTION 'capacity: pool depth exceeds 6' USING ERRCODE = 'CP013';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capacity_pools_set_path_biu ON public.capacity_pools;
CREATE TRIGGER capacity_pools_set_path_biu
  BEFORE INSERT OR UPDATE ON public.capacity_pools
  FOR EACH ROW EXECUTE FUNCTION public.capacity_pools_set_path();

-- ─── 4. the reaper ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reap_capacity_allocations(p_limit int DEFAULT 500)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
BEGIN
  WITH lapsed AS (
    SELECT id FROM public.capacity_allocations
     WHERE state = 'hold' AND expires_at <= now()
     ORDER BY expires_at
     LIMIT GREATEST(COALESCE(p_limit, 500), 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.capacity_allocations a
     SET state = 'released', released_at = now()
    FROM lapsed
   WHERE a.id = lapsed.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ─── 5. reserve ─────────────────────────────────────────────────────────────
--
-- THE ONE RULE EVERYTHING DERIVES FROM. For pool P over window W:
--
--   remaining(P, W) = P.units_total + P.overbook_units
--                   - Σ units of allocations A where
--                         A.pool_path @> ARRAY[P.id]     -- P or any descendant
--                     AND (A.state = 'committed'
--                          OR (A.state = 'hold' AND A.expires_at > now()))
--                     AND overlaps(A, W)
--
-- overlaps(A, W) is true when EITHER side is timeless, and otherwise when the
-- half-open ranges intersect. A timeless allocation counting against every
-- windowed reserve is deliberate: that is what makes stock work.
--
-- A reserve of k units on P succeeds iff remaining(A, W) >= k for EVERY A in
-- P.pool_path. That is the ancestor rule: a room buy-out is an allocation on the
-- room pool, and it drives every table beneath it to zero without touching them.
--
-- Internal, and RAISES on refusal, so reserve_capacity_batch gets all-or-nothing
-- for free from the enclosing transaction.

CREATE OR REPLACE FUNCTION public._capacity_reserve_locked(
  p_pool_id       uuid,
  p_starts_at     timestamptz,
  p_ends_at       timestamptz,
  p_units         int,
  p_ttl_seconds   int,
  p_order_line_id uuid,
  p_created_by    uuid
)
RETURNS public.capacity_allocations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_seed  public.capacity_pools;
  v_pool  public.capacity_pools;
  v_anc   public.capacity_pools;
  v_chain public.capacity_pools[] := '{}';
  v_used  int;
  v_ttl   int;
  v_alloc public.capacity_allocations;
BEGIN
  IF p_units IS NULL OR p_units <= 0 THEN
    RAISE EXCEPTION 'invalid_units' USING ERRCODE = 'CP001';
  END IF;
  IF (p_starts_at IS NULL) <> (p_ends_at IS NULL)
     OR (p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at) THEN
    RAISE EXCEPTION 'invalid_window' USING ERRCODE = 'CP002';
  END IF;

  -- Unlocked read, only to learn the chain. Every row is re-read under lock
  -- below, and re-parenting a pool with live allocations is refused, so the
  -- chain cannot shift underneath a live reserve.
  SELECT * INTO v_seed FROM public.capacity_pools WHERE id = p_pool_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pool_not_found' USING ERRCODE = 'CP003';
  END IF;

  -- Lock the whole chain ROOT-FIRST. LockRows sits above Sort, so rows are
  -- locked in pool_path order: two reserves on sibling tables acquire their
  -- shared room in the same sequence and cannot deadlock.
  FOR v_anc IN
    SELECT p.*
      FROM unnest(v_seed.pool_path) WITH ORDINALITY AS a(pool_id, ord)
      JOIN public.capacity_pools p ON p.id = a.pool_id
     ORDER BY a.ord
       FOR UPDATE OF p
  LOOP
    v_chain := v_chain || v_anc;
  END LOOP;

  IF array_length(v_chain, 1) IS DISTINCT FROM array_length(v_seed.pool_path, 1) THEN
    RAISE EXCEPTION 'pool_not_found' USING ERRCODE = 'CP003';
  END IF;

  -- Lazy reap, inside the lock, scoped to this tree. Hygiene only: the count
  -- below already ignores expired holds. Doing it here rather than in a BEFORE
  -- INSERT trigger keeps it serialised and off the write path of every insert.
  UPDATE public.capacity_allocations
     SET state = 'released', released_at = now()
   WHERE pool_path @> ARRAY[v_chain[1].id]
     AND state = 'hold'
     AND expires_at <= now();

  FOREACH v_anc IN ARRAY v_chain LOOP
    IF NOT v_anc.is_active THEN
      RAISE EXCEPTION 'pool_inactive' USING ERRCODE = 'CP004', DETAIL = v_anc.id::text;
    END IF;

    SELECT COALESCE(SUM(al.units), 0) INTO v_used
      FROM public.capacity_allocations al
     WHERE al.pool_path @> ARRAY[v_anc.id]
       AND (al.state = 'committed'
            OR (al.state = 'hold' AND al.expires_at > now()))
       AND (al.starts_at IS NULL OR p_starts_at IS NULL
            OR tstzrange(al.starts_at, al.ends_at, '[)')
               && tstzrange(p_starts_at, p_ends_at, '[)'));

    IF v_used + p_units > v_anc.units_total + v_anc.overbook_units THEN
      IF v_anc.id = p_pool_id THEN
        RAISE EXCEPTION 'sold_out' USING ERRCODE = 'CP005', DETAIL = v_anc.id::text;
      ELSE
        RAISE EXCEPTION 'ancestor_full' USING ERRCODE = 'CP006', DETAIL = v_anc.id::text;
      END IF;
    END IF;

    IF v_anc.id = p_pool_id THEN
      v_pool := v_anc;
    END IF;
  END LOOP;

  v_ttl := COALESCE(p_ttl_seconds, v_pool.hold_ttl_seconds);
  IF v_ttl < 30 OR v_ttl > 604800 THEN
    RAISE EXCEPTION 'invalid_ttl' USING ERRCODE = 'CP007';
  END IF;

  INSERT INTO public.capacity_allocations
    (tenant_id, pool_id, pool_path, order_line_id,
     starts_at, ends_at, units, state, expires_at, created_by)
  VALUES
    (v_pool.tenant_id, v_pool.id, v_pool.pool_path, p_order_line_id,
     p_starts_at, p_ends_at, p_units, 'hold',
     now() + make_interval(secs => v_ttl), p_created_by)
  RETURNING * INTO v_alloc;

  RETURN v_alloc;
END;
$$;

-- Public single-pool wrapper: catches the refusal and returns it as DATA, so a
-- caller can distinguish "sold out" from "the database is broken".
CREATE OR REPLACE FUNCTION public.reserve_capacity(
  p_pool_id       uuid,
  p_starts_at     timestamptz DEFAULT NULL,
  p_ends_at       timestamptz DEFAULT NULL,
  p_units         int         DEFAULT 1,
  p_ttl_seconds   int         DEFAULT NULL,   -- NULL ⇒ the pool's hold_ttl_seconds
  p_order_line_id uuid        DEFAULT NULL,
  p_created_by    uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_alloc  public.capacity_allocations;
  v_reason text;
  v_detail text;
BEGIN
  v_alloc := public._capacity_reserve_locked(
    p_pool_id, p_starts_at, p_ends_at, p_units, p_ttl_seconds,
    p_order_line_id, p_created_by);
  RETURN jsonb_build_object(
    'ok', true,
    'allocation_id', v_alloc.id,
    'expires_at', v_alloc.expires_at,
    'units', v_alloc.units);
EXCEPTION
  WHEN SQLSTATE 'CP001' OR SQLSTATE 'CP002' OR SQLSTATE 'CP003'
    OR SQLSTATE 'CP004' OR SQLSTATE 'CP005' OR SQLSTATE 'CP006'
    OR SQLSTATE 'CP007' THEN
    GET STACKED DIAGNOSTICS v_reason = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
    RETURN jsonb_build_object(
      'ok', false,
      'reason', v_reason,
      'blocking_pool_id', NULLIF(v_detail, ''));
END;
$$;

-- All-or-nothing across pools: dinner plus show, table plus two seats.
-- Requests are ordered by pool_path text before any lock is taken, so two
-- concurrent batches over the same set of pools take them in the same order.
CREATE OR REPLACE FUNCTION public.reserve_capacity_batch(
  p_requests      jsonb,   -- [{pool_id, starts_at, ends_at, units}, …]
  p_ttl_seconds   int  DEFAULT NULL,
  p_order_line_id uuid DEFAULT NULL,
  p_created_by    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req    record;
  v_alloc  public.capacity_allocations;
  v_ids    uuid[] := '{}';
  v_min_exp timestamptz;
  v_reason text;
  v_detail text;
BEGIN
  IF p_requests IS NULL OR jsonb_typeof(p_requests) <> 'array'
     OR jsonb_array_length(p_requests) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'empty_batch');
  END IF;

  FOR v_req IN
    SELECT (r->>'pool_id')::uuid            AS pool_id,
           (r->>'starts_at')::timestamptz   AS starts_at,
           (r->>'ends_at')::timestamptz     AS ends_at,
           COALESCE((r->>'units')::int, 1)  AS units
      FROM jsonb_array_elements(p_requests) AS r
      LEFT JOIN public.capacity_pools p ON p.id = (r->>'pool_id')::uuid
     ORDER BY p.pool_path::text NULLS LAST, (r->>'pool_id')
  LOOP
    v_alloc := public._capacity_reserve_locked(
      v_req.pool_id, v_req.starts_at, v_req.ends_at, v_req.units,
      p_ttl_seconds, p_order_line_id, p_created_by);
    v_ids := v_ids || v_alloc.id;
    v_min_exp := LEAST(v_min_exp, v_alloc.expires_at);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'allocation_ids', to_jsonb(v_ids),
                            'expires_at', v_min_exp);
EXCEPTION
  WHEN SQLSTATE 'CP001' OR SQLSTATE 'CP002' OR SQLSTATE 'CP003'
    OR SQLSTATE 'CP004' OR SQLSTATE 'CP005' OR SQLSTATE 'CP006'
    OR SQLSTATE 'CP007' THEN
    -- The whole block rolls back: nothing is written.
    GET STACKED DIAGNOSTICS v_reason = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
    RETURN jsonb_build_object('ok', false, 'reason', v_reason,
                              'failed_pool_id', NULLIF(v_detail, ''));
END;
$$;

-- ─── 6. commit ──────────────────────────────────────────────────────────────
-- hold → committed. Idempotent on rows already committed. REFUSES on an expired
-- hold: those units are already promised to whoever reserved after the lapse,
-- so committing would oversell. That refusal is the reason the front end must
-- treat a TTL as a real deadline and not a hint.

CREATE OR REPLACE FUNCTION public.commit_capacity(
  p_allocation_ids uuid[],
  p_order_line_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bad_id    uuid;
  v_bad_state text;
  v_found     int;
  v_count     int;
BEGIN
  IF p_allocation_ids IS NULL OR array_length(p_allocation_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'committed', 0);
  END IF;

  SELECT count(*) INTO v_found
    FROM public.capacity_allocations WHERE id = ANY(p_allocation_ids);
  IF v_found <> cardinality(p_allocation_ids) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing');
  END IF;

  SELECT id,
         CASE WHEN state = 'released' THEN 'released' ELSE 'expired' END
    INTO v_bad_id, v_bad_state
    FROM public.capacity_allocations
   WHERE id = ANY(p_allocation_ids)
     AND (state = 'released'
          OR (state = 'hold' AND expires_at <= now()))
   LIMIT 1;

  IF v_bad_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', v_bad_state,
                              'allocation_id', v_bad_id);
  END IF;

  UPDATE public.capacity_allocations
     SET state = 'committed',
         expires_at = NULL,
         order_line_id = COALESCE(p_order_line_id, order_line_id)
   WHERE id = ANY(p_allocation_ids)
     AND state = 'hold';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'committed', v_count);
END;
$$;

-- ─── 7. release, with the clamp ─────────────────────────────────────────────
-- The clamp is structural, not arithmetic: remaining is derived from rows, so
-- there is no counter to inflate. Releasing an already-released allocation
-- changes nothing and is reported separately so a caller can tell the
-- difference between "I freed 4" and "someone else already did".

CREATE OR REPLACE FUNCTION public.release_capacity(p_allocation_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_released int;
  v_found    int;
BEGIN
  IF p_allocation_ids IS NULL OR array_length(p_allocation_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'released', 0, 'already_released', 0);
  END IF;

  SELECT count(*) INTO v_found
    FROM public.capacity_allocations WHERE id = ANY(p_allocation_ids);

  UPDATE public.capacity_allocations
     SET state = 'released', released_at = now()
   WHERE id = ANY(p_allocation_ids)
     AND state <> 'released';
  GET DIAGNOSTICS v_released = ROW_COUNT;

  RETURN jsonb_build_object('ok', true,
                            'released', v_released,
                            'already_released', GREATEST(v_found - v_released, 0));
END;
$$;

-- ─── 8. pool authoring ──────────────────────────────────────────────────────
-- There is no INSERT policy on capacity_pools, so this is the only way a pool
-- comes into existence. Spaces & Seating, Sessions and Menu all arrive here.

CREATE OR REPLACE FUNCTION public.upsert_capacity_pool(
  p_tenant_id        uuid,
  p_subject_kind     text,
  p_subject_id       uuid,
  p_units_total      int,
  p_pool_key         text    DEFAULT 'default',
  p_parent_pool_id   uuid    DEFAULT NULL,
  p_overbook_units   int     DEFAULT NULL,
  p_hold_ttl_seconds int     DEFAULT NULL,
  p_unit_label       text    DEFAULT NULL,
  p_is_active        boolean DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.capacity_pools AS cp
    (tenant_id, subject_kind, subject_id, pool_key, parent_pool_id,
     units_total, overbook_units, hold_ttl_seconds, unit_label, is_active, pool_path)
  VALUES
    (p_tenant_id, p_subject_kind, p_subject_id, COALESCE(p_pool_key, 'default'),
     p_parent_pool_id, p_units_total, COALESCE(p_overbook_units, 0),
     COALESCE(p_hold_ttl_seconds, 900), p_unit_label, COALESCE(p_is_active, true),
     '{}')  -- overwritten by the BEFORE trigger; never trusted from the caller
  ON CONFLICT (tenant_id, subject_kind, subject_id, pool_key) DO UPDATE
    SET units_total      = EXCLUDED.units_total,
        parent_pool_id   = EXCLUDED.parent_pool_id,
        overbook_units   = COALESCE(p_overbook_units, cp.overbook_units),
        hold_ttl_seconds = COALESCE(p_hold_ttl_seconds, cp.hold_ttl_seconds),
        unit_label       = COALESCE(p_unit_label, cp.unit_label),
        is_active        = COALESCE(p_is_active, cp.is_active)
  RETURNING cp.id INTO v_id;
  RETURN v_id;
END;
$$;

-- ─── 9. the one public reader ───────────────────────────────────────────────
-- A deliberate exception to "service-role only". A storefront has to be able to
-- say "3 left" without a round trip through a server action. It returns ONE
-- INTEGER for a pool id the caller must already possess, and never a row: anon
-- learns how many units remain, never who holds them, for whom, or until when.
-- NULL means "no such pool, or the pool is off".

CREATE OR REPLACE FUNCTION public.capacity_remaining_public(
  p_pool_id   uuid,
  p_starts_at timestamptz DEFAULT NULL,
  p_ends_at   timestamptz DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_seed public.capacity_pools;
  v_anc  public.capacity_pools;
  v_used int;
  v_rem  int;
  v_min  int;
BEGIN
  SELECT * INTO v_seed FROM public.capacity_pools WHERE id = p_pool_id;
  IF NOT FOUND OR NOT v_seed.is_active THEN
    RETURN NULL;
  END IF;

  -- The answer is the tightest constraint anywhere in the chain, which is what
  -- a buyer actually experiences: a free table in a bought-out room is not free.
  FOR v_anc IN
    SELECT p.* FROM unnest(v_seed.pool_path) AS a(pool_id)
      JOIN public.capacity_pools p ON p.id = a.pool_id
  LOOP
    IF NOT v_anc.is_active THEN
      RETURN 0;
    END IF;
    SELECT COALESCE(SUM(al.units), 0) INTO v_used
      FROM public.capacity_allocations al
     WHERE al.pool_path @> ARRAY[v_anc.id]
       AND (al.state = 'committed'
            OR (al.state = 'hold' AND al.expires_at > now()))
       AND (al.starts_at IS NULL OR p_starts_at IS NULL
            OR tstzrange(al.starts_at, al.ends_at, '[)')
               && tstzrange(p_starts_at, p_ends_at, '[)'));
    v_rem := GREATEST(v_anc.units_total + v_anc.overbook_units - v_used, 0);
    v_min := LEAST(COALESCE(v_min, v_rem), v_rem);
  END LOOP;

  RETURN COALESCE(v_min, 0);
END;
$$;

-- ─── 10. RLS ────────────────────────────────────────────────────────────────
-- Reads for staff of the tenant. NO write policy of any kind: every write goes
-- through an RPC above, and service_role bypasses RLS.

ALTER TABLE public.capacity_pools       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacity_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS capacity_pools_select_staff ON public.capacity_pools;
CREATE POLICY capacity_pools_select_staff ON public.capacity_pools
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS capacity_allocations_select_staff ON public.capacity_allocations;
CREATE POLICY capacity_allocations_select_staff ON public.capacity_allocations
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

-- ─── 11. grants ─────────────────────────────────────────────────────────────
-- Following 20261124000000. CREATE FUNCTION grants EXECUTE to PUBLIC by default,
-- and PUBLIC is a SEPARATE grant from any role grant: `REVOKE … FROM anon` alone
-- leaves the function reachable through PUBLIC. `FROM PUBLIC` is the operative
-- statement. Every one of these is SECURITY DEFINER and would otherwise be an
-- unauthenticated write into capacity.

REVOKE ALL ON FUNCTION public._capacity_reserve_locked(uuid, timestamptz, timestamptz, int, int, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_capacity(uuid, timestamptz, timestamptz, int, int, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_capacity_batch(jsonb, int, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_capacity(uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_capacity(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reap_capacity_allocations(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_capacity_pool(uuid, text, uuid, int, text, uuid, int, int, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capacity_pools_set_path() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._capacity_reserve_locked(uuid, timestamptz, timestamptz, int, int, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_capacity(uuid, timestamptz, timestamptz, int, int, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_capacity_batch(jsonb, int, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_capacity(uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_capacity(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.reap_capacity_allocations(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_capacity_pool(uuid, text, uuid, int, text, uuid, int, int, text, boolean) TO service_role;

-- The single intentional exception, justified in section 9 above.
REVOKE ALL ON FUNCTION public.capacity_remaining_public(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capacity_remaining_public(uuid, timestamptz, timestamptz)
  TO anon, authenticated, service_role;

-- Supabase's default privileges grant ALL on new public tables to anon as well
-- as authenticated. RLS with no anon policy is already a complete deny, so this
-- is defense in depth rather than remediation — but it is the same shape as the
-- hole 20261124000000 was written to close, and an allocation row names a tenant,
-- an order line and a person's booking window. `authenticated` keeps its grant
-- because the staff SELECT policy above needs it.
-- Note the shape: the default grant is ALL, so `authenticated` arrives holding
-- INSERT/UPDATE/DELETE as well. RLS has no write policy, so those were already
-- dead, but a table whose only sanctioned writer is an RPC should not advertise
-- write privileges to a role at all. Revoke everything, then grant back SELECT.
REVOKE ALL ON TABLE public.capacity_pools       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.capacity_allocations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.capacity_pools       TO authenticated;
GRANT SELECT ON TABLE public.capacity_allocations TO authenticated;

COMMIT;
