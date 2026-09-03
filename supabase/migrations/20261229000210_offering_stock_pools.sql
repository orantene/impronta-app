-- 20261229000210_offering_stock_pools.sql — Phase 0.3a, stock onto pools.
--
-- "Sell the Room" §10b 0.3. `talent_offerings.inventory_qty` is a single global
-- integer with no time dimension, no hold and no ledger. This moves the truth
-- onto a timeless capacity pool per offering and leaves every existing caller
-- working, so 0.3b can change behaviour in one reviewable step.
--
-- EXPAND, NOT CONTRACT. `inventory_qty` is NOT dropped here and NOT frozen. It
-- is kept as a MIRROR, written by the wrappers below, because four live readers
-- still use it:
--   web/src/app/t/[profileCode]/_shared/StorefrontBody.tsx:43,113   (sold-out badge)
--   web/src/app/t/[profileCode]/_shared/OfferingInstantMount.tsx:100 (max quantity)
--   web/src/app/t/[profileCode]/_shared/OfferingCta.tsx:88
--   web/src/lib/inquiry/instant-book-engine.ts:317                   (the reserve gate)
-- Freezing the column instead of mirroring it would leave a published page
-- showing "12 spots" forever. 0.3b repoints those readers at the pool; a later
-- release drops the column. Never drop a column in the release that stops
-- reading it.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO: it does not change who can buy
-- what. `reserve_offering_stock` still only gets called for `kind='product'`
-- (instant-book-engine.ts:317), so the live 12-spot course — which is
-- `kind='package'` — remains oversellable until 0.3b deletes that gate. The
-- backfill below gives it a correct pool so the fix is a one-line change rather
-- than a data migration under time pressure.
--
-- TIMESTAMP: local sequence, future-dated. Remote ledger head at authoring was
-- 20261229000200 (capacity_engine, mine). Band 202612290002xx confirmed by the
-- Director. Do NOT pick a stamp by reading the local migrations directory.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs`, never `db push`.

BEGIN;

-- ─── 1. the catalog's pool reference ────────────────────────────────────────
-- Engine owns the column, feature owns the UI (Director's rule). These are pool
-- references and meaningless without the capacity engine, so they live here;
-- the editor control that writes them is the Menu Workspace Manager's.

ALTER TABLE public.talent_offerings
  ADD COLUMN IF NOT EXISTS capacity_pool_id uuid
    REFERENCES public.capacity_pools(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consumes_units int NOT NULL DEFAULT 1
    CHECK (consumes_units > 0);

ALTER TABLE public.talent_offering_variants
  ADD COLUMN IF NOT EXISTS capacity_pool_id uuid
    REFERENCES public.capacity_pools(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consumes_units int NOT NULL DEFAULT 1
    CHECK (consumes_units > 0);

CREATE INDEX IF NOT EXISTS talent_offerings_capacity_pool_idx
  ON public.talent_offerings (capacity_pool_id) WHERE capacity_pool_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS talent_offering_variants_capacity_pool_idx
  ON public.talent_offering_variants (capacity_pool_id) WHERE capacity_pool_id IS NOT NULL;

COMMENT ON COLUMN public.talent_offerings.capacity_pool_id IS
  'Capacity pool this offering sells from. NULL = unlimited. Truth for stock; inventory_qty is a transitional mirror.';
COMMENT ON COLUMN public.talent_offerings.consumes_units IS
  'Units of the pool one purchase consumes. A "table for 4" consumes 4 seats.';

-- ─── 2. backfill ────────────────────────────────────────────────────────────
-- One timeless pool per offering that carries a stock number today. Timeless
-- (NULL range on its allocations) is what makes plain stock work through the
-- same rule as a seated table.
--
-- units_total is the ORIGINAL stock, not the remaining stock, because a pool's
-- remaining is derived from its allocations. There are no allocations yet, so
-- seeding units_total = inventory_qty is only correct while inventory_qty has
-- never been decremented. Verified before writing this: the sole row with a
-- stock number is the 12-spot course, it is kind='package', and the ONLY writer
-- of inventory_qty is reserve_offering_stock, which is gated on kind='product'
-- and therefore has never run against it. Its 12 is untouched, so 12 is both
-- the original and the remaining. If that ever stops being true for some row,
-- this backfill would silently restore already-sold units — hence the guard.

DO $$
DECLARE
  v_row record;
  v_pool uuid;
  v_made int := 0;
BEGIN
  FOR v_row IN
    SELECT id, tenant_id, inventory_qty, title
      FROM public.talent_offerings
     WHERE inventory_qty IS NOT NULL
       AND capacity_pool_id IS NULL
  LOOP
    v_pool := public.upsert_capacity_pool(
      p_tenant_id        => v_row.tenant_id,
      p_subject_kind     => 'offering',
      p_subject_id       => v_row.id,
      p_units_total      => v_row.inventory_qty,
      p_pool_key         => 'default',
      p_parent_pool_id   => NULL,
      p_overbook_units   => 0,
      -- Stock is not a seat someone is walking to: a checkout hold of fifteen
      -- minutes is generous and a lapsed one costs nothing.
      p_hold_ttl_seconds => 900,
      p_unit_label       => 'unit',
      p_is_active        => true);

    UPDATE public.talent_offerings SET capacity_pool_id = v_pool WHERE id = v_row.id;
    v_made := v_made + 1;
    RAISE NOTICE 'capacity: pool % seeded with % units for offering % (%)',
      v_pool, v_row.inventory_qty, v_row.id, v_row.title;
  END LOOP;
  RAISE NOTICE 'capacity: % offering pool(s) created', v_made;
END $$;

-- ─── 3. the old RPCs become thin wrappers ───────────────────────────────────
-- Signatures unchanged on purpose, so instant-book-engine.ts keeps working
-- untouched and 0.3b is a code review about behaviour rather than a rename.
--
-- The old contract had no hold: it decremented at reserve and incremented at
-- cancel. These wrappers reproduce that exactly by committing the allocation
-- immediately, so nothing in the current pipeline observes a behaviour change.
-- The hold path is what 0.3b moves callers onto.

CREATE OR REPLACE FUNCTION public.reserve_offering_stock(p_offering_id uuid, p_qty int DEFAULT 1)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pool  uuid;
  v_alloc public.capacity_allocations;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN false;
  END IF;

  SELECT capacity_pool_id INTO v_pool
    FROM public.talent_offerings WHERE id = p_offering_id;

  -- No pool means unlimited, which is what a NULL inventory_qty always meant.
  IF v_pool IS NULL THEN
    RETURN true;
  END IF;

  BEGIN
    v_alloc := public._capacity_reserve_locked(v_pool, NULL, NULL, p_qty, 900, NULL, NULL);
  EXCEPTION
    WHEN SQLSTATE 'CP005' OR SQLSTATE 'CP006' OR SQLSTATE 'CP004' THEN
      RETURN false;   -- sold out, ancestor full, or the pool is switched off
  END;

  -- Old semantics: committed at reserve time, no hold to lapse.
  UPDATE public.capacity_allocations
     SET state = 'committed', expires_at = NULL
   WHERE id = v_alloc.id;

  -- Transitional mirror for the four readers still on inventory_qty.
  UPDATE public.talent_offerings
     SET inventory_qty = GREATEST(COALESCE(inventory_qty, 0) - p_qty, 0),
         updated_at = now()
   WHERE id = p_offering_id AND inventory_qty IS NOT NULL;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_offering_stock(p_offering_id uuid, p_qty int DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pool   uuid;
  v_left   int;
  v_row    record;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN;
  END IF;

  SELECT capacity_pool_id INTO v_pool
    FROM public.talent_offerings WHERE id = p_offering_id;

  IF v_pool IS NOT NULL THEN
    -- COMPATIBILITY SHIM, and it is lossy on purpose. The old signature releases
    -- a QUANTITY, but an allocation ledger releases IDENTITIES, and the caller
    -- never learned an id. So we release live allocations newest-first until the
    -- quantity is satisfied. That can release a different allocation than the
    -- one the caller reserved. It cannot over-release (the loop stops at p_qty
    -- and release_capacity clamps), and it cannot leak units, but it is why
    -- 0.3b stamps the allocation id on the inquiry and deletes this branch.
    v_left := p_qty;
    FOR v_row IN
      SELECT id, units FROM public.capacity_allocations
       WHERE pool_id = v_pool AND state <> 'released'
       ORDER BY created_at DESC
    LOOP
      EXIT WHEN v_left <= 0;
      PERFORM public.release_capacity(ARRAY[v_row.id]);
      v_left := v_left - v_row.units;
    END LOOP;
  END IF;

  -- Transitional mirror. Clamped to the pool's total so a double release cannot
  -- push the displayed number above the real ceiling.
  UPDATE public.talent_offerings o
     SET inventory_qty = LEAST(
           COALESCE(o.inventory_qty, 0) + p_qty,
           COALESCE((SELECT p.units_total + p.overbook_units
                       FROM public.capacity_pools p WHERE p.id = o.capacity_pool_id),
                    COALESCE(o.inventory_qty, 0) + p_qty)),
         updated_at = now()
   WHERE o.id = p_offering_id AND o.inventory_qty IS NOT NULL;
END;
$$;

-- Grants unchanged from 20260708190802 + 20261124000000: service-role only.
REVOKE ALL ON FUNCTION public.reserve_offering_stock(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_offering_stock(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_offering_stock(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_offering_stock(uuid, int) TO service_role;

COMMIT;
