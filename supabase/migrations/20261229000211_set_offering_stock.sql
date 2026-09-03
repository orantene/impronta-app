-- 20261229000211_set_offering_stock.sql — Phase 0.3c, editing stock safely.
--
-- The one RPC an editor may call to change an offering's stock. It exists
-- because a stock edit is NOT a number write, and every obvious shortcut is
-- wrong in a way that only shows up once someone has actually bought something.
--
-- WHY A NUMBER WRITE IS WRONG
-- ═══════════════════════════
-- An owner typing "20" into a stock field means "twenty AVAILABLE NOW". They do
-- not mean "twenty total including the three already sold", and they certainly
-- do not mean "cancel the three outstanding orders". So:
--
--   * Writing 20 into capacity_pools.units_total would silently shrink the
--     ceiling below what is already held whenever units are outstanding, and
--     the next release would then push remaining above the ceiling.
--   * Writing 20 into talent_offerings.inventory_qty alone would desync the
--     mirror from the pool, and the storefront reads the mirror — so the page
--     would start lying in whichever direction the drift went.
--
-- The correct arithmetic is `units_total = available + held`, computed under the
-- pool's row lock so a concurrent purchase cannot land between the read and the
-- write. That is the whole reason this is an RPC and not two UPDATEs in a server
-- action.
--
-- REDUCING BELOW WHAT IS HELD IS ALLOWED AND NEVER CANCELS A HOLD. An owner who
-- sets availability to 0 while three seats are sold gets units_total = 3,
-- remaining = 0: the shop is closed, the three buyers keep their seats. Taking
-- a seat back from someone who bought it is a refund decision, and refunds are
-- Finance's lane, not a side effect of an editor field.
--
-- TIMESTAMP: band 202612290002xx (Capacity), confirmed by the Director. Head at
-- authoring was 20261229000210. Do NOT pick a stamp from the local directory;
-- the remote ledger is ahead of it.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs`, never `db push`.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_offering_stock(
  p_offering_id uuid,
  p_available   int   -- NULL = unlimited
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_pool   uuid;
  v_held   int;
  v_total  int;
BEGIN
  SELECT tenant_id, capacity_pool_id INTO v_tenant, v_pool
    FROM public.talent_offerings WHERE id = p_offering_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'offering_not_found');
  END IF;

  IF p_available IS NOT NULL AND p_available < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'negative_stock');
  END IF;

  -- ── unlimited ─────────────────────────────────────────────────────────────
  -- Deactivate rather than delete: the pool's allocations are the record of what
  -- was sold while the offering WAS limited, and deleting the pool would cascade
  -- them away. An inactive pool consumes nothing and refuses nothing, because
  -- the offering no longer points at it.
  IF p_available IS NULL THEN
    IF v_pool IS NOT NULL THEN
      UPDATE public.capacity_pools SET is_active = false, updated_at = now()
       WHERE id = v_pool;
    END IF;
    UPDATE public.talent_offerings
       SET capacity_pool_id = NULL, inventory_qty = NULL, updated_at = now()
     WHERE id = p_offering_id;
    RETURN jsonb_build_object('ok', true, 'pool_id', NULL, 'available', NULL,
                              'held', 0, 'units_total', NULL);
  END IF;

  -- ── limited ───────────────────────────────────────────────────────────────
  IF v_pool IS NULL THEN
    v_pool := public.upsert_capacity_pool(
      p_tenant_id        => v_tenant,
      p_subject_kind     => 'offering',
      p_subject_id       => p_offering_id,
      p_units_total      => p_available,
      p_pool_key         => 'default',
      p_parent_pool_id   => NULL,
      p_overbook_units   => 0,
      p_hold_ttl_seconds => 900,
      p_unit_label       => 'unit',
      p_is_active        => true);
    UPDATE public.talent_offerings
       SET capacity_pool_id = v_pool WHERE id = p_offering_id;
  END IF;

  -- Lock the pool BEFORE counting, so a purchase landing between the count and
  -- the write cannot be erased by the total we compute from a stale read.
  PERFORM 1 FROM public.capacity_pools WHERE id = v_pool FOR UPDATE;

  SELECT COALESCE(SUM(units), 0) INTO v_held
    FROM public.capacity_allocations
   WHERE pool_id = v_pool
     AND (state = 'committed' OR (state = 'hold' AND expires_at > now()));

  v_total := p_available + v_held;

  UPDATE public.capacity_pools
     SET units_total = v_total, is_active = true, updated_at = now()
   WHERE id = v_pool;

  UPDATE public.talent_offerings
     SET inventory_qty = p_available, updated_at = now()
   WHERE id = p_offering_id;

  RETURN jsonb_build_object('ok', true, 'pool_id', v_pool, 'available', p_available,
                            'held', v_held, 'units_total', v_total);
END;
$$;

-- Service-role only, per 20261124000000: REVOKE FROM anon alone is a no-op
-- because PUBLIC is a separate grant. This one writes catalogue state, so it
-- must never be reachable from a browser session.
REVOKE ALL ON FUNCTION public.set_offering_stock(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_offering_stock(uuid, int) TO service_role;

COMMENT ON FUNCTION public.set_offering_stock(uuid, int) IS
  'Set an offering''s AVAILABLE stock. units_total becomes available + held, under the pool lock. NULL = unlimited. Never cancels an outstanding hold.';

COMMIT;
