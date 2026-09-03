-- 20261229000212_capacity_tenant_and_subject_integrity.sql — Phase 0.10.
--
-- Two holes in the capacity engine's own contract, both found by the managers
-- who consume it rather than from inside the engine.
--
--
-- 1. set_offering_stock CHECKED NOTHING ABOUT WHO WAS ASKING
-- ═════════════════════════════════════════════════════════
-- Found by the Menu Workspace Manager (#1535), who wrote a tenant guard in their
-- server action and explained why it was not redundant with the RPC:
--
--   "setOfferingStock runs service-role and takes an offering id, so without
--    this an authenticated staff member of ANY workspace could set stock on ANY
--    offering."
--
-- They are right and it was my omission. Every other RPC in this engine re-checks
-- tenant ownership; this one took an offering id and checked nothing, because I
-- reasoned that service-role means trusted. The real trust boundary is not the
-- role, it is the SERVER ACTION reachable by any authenticated staff member —
-- and that action is the caller. A guard that lives only in one caller protects
-- only that caller.
--
-- `p_tenant_id` is added with a DEFAULT NULL so this is additive and nothing
-- breaks: the existing call keeps working while Menu switches over. When it IS
-- supplied, an offering belonging to another tenant is refused.
--
-- NOT made mandatory in this migration, deliberately. Making it required is a
-- second change with a different risk (every caller must be updated in the same
-- release or stock editing breaks), and it belongs in its own PR once the call
-- sites have moved. Recorded here so it is not forgotten.
--
--
-- 2. subject_id IS POLYMORPHIC, SO NOTHING STOPPED A POOL POINTING AT NOTHING
-- ══════════════════════════════════════════════════════════════════════════
-- Raised by the Spaces & Seating Manager, who asked whether they should own a
-- trigger refusing a 'space' pool whose subject_id is not a spaces row. The
-- answer is no, and neither should each future feature: that is N triggers with
-- N chances to diverge. Nor can the engine reference `spaces` directly — the
-- engine would then depend on a feature table, inverting the layering.
--
-- So the mapping lives in DATA. `capacity_subject_kinds` records which table
-- backs each subject_kind, and upsert_capacity_pool validates against it.
--
-- WHY A TABLE AND NOT A CASE STATEMENT INSIDE THE FUNCTION. A hardcoded
-- `to_regclass('public.spaces')` check fails OPEN when the table does not exist
-- yet or when I guessed the name wrong — a guard that silently measures nothing,
-- which this repo has shipped six times. A registry row is an explicit act by
-- the table's OWNER when their table exists. An unregistered kind is visibly
-- unvalidated rather than invisibly unvalidated, and the accompanying test lists
-- exactly which kinds are unregistered so the gap cannot hide.
--
-- Registered today: offering, person. Spaces & Seating register 'space' and
-- 'space_group' in their own migration when those tables exist; Sessions
-- register 'session_tier'.
--
-- TIMESTAMP: band 202612290002xx (Capacity). Remote head at authoring was
-- 20261229000400; this file only needs to sort after 20261229000211, which it
-- does, and it collides with nothing.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs`, never `db push`.

BEGIN;

-- ─── 1. the subject registry ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.capacity_subject_kinds (
  subject_kind text PRIMARY KEY,
  -- Unqualified table name in `public`. Validated on insert, so a typo is
  -- refused at registration rather than silently disabling the check.
  table_name   text NOT NULL,
  registered_by text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capacity_subject_kinds_table_name_shape
    CHECK (table_name ~ '^[a-z_][a-z0-9_]{0,62}$')
);

COMMENT ON TABLE public.capacity_subject_kinds IS
  'subject_kind -> backing table, so upsert_capacity_pool can refuse a pool pointing at a row that does not exist. Feature owners register their own kind when their table ships.';

-- A registration naming a table that does not exist would disable the very check
-- it is supposed to enable, so refuse it at registration time.
CREATE OR REPLACE FUNCTION public.capacity_subject_kinds_verify()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF to_regclass('public.' || quote_ident(NEW.table_name)) IS NULL THEN
    RAISE EXCEPTION 'capacity: cannot register subject_kind % — public.% does not exist',
      NEW.subject_kind, NEW.table_name
      USING ERRCODE = 'CP020';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capacity_subject_kinds_verify_biu ON public.capacity_subject_kinds;
CREATE TRIGGER capacity_subject_kinds_verify_biu
  BEFORE INSERT OR UPDATE ON public.capacity_subject_kinds
  FOR EACH ROW EXECUTE FUNCTION public.capacity_subject_kinds_verify();

ALTER TABLE public.capacity_subject_kinds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS capacity_subject_kinds_select ON public.capacity_subject_kinds;
CREATE POLICY capacity_subject_kinds_select ON public.capacity_subject_kinds
  FOR SELECT TO authenticated USING (true);   -- a public mapping, no tenant data

REVOKE ALL ON TABLE public.capacity_subject_kinds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.capacity_subject_kinds TO authenticated;

INSERT INTO public.capacity_subject_kinds (subject_kind, table_name, registered_by) VALUES
  ('offering', 'talent_offerings', 'capacity-0.10'),
  ('person',   'talent_profiles',  'capacity-0.10')
ON CONFLICT (subject_kind) DO NOTHING;

-- ─── 2. upsert_capacity_pool validates the subject ──────────────────────────

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
  v_id    uuid;
  v_table text;
  v_ok    boolean;
BEGIN
  -- Validate the subject when, and only when, its kind is registered. An
  -- unregistered kind is deliberately permitted: the alternative is that the
  -- engine blocks a feature until it registers, and the test enumerates the
  -- unregistered kinds so the gap is visible rather than silent.
  SELECT table_name INTO v_table
    FROM public.capacity_subject_kinds WHERE subject_kind = p_subject_kind;

  IF v_table IS NOT NULL THEN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', v_table)
      INTO v_ok USING p_subject_id;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'capacity: no % row with id % to attach a pool to',
        v_table, p_subject_id USING ERRCODE = 'CP021';
    END IF;
  END IF;

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

-- ─── 3. set_offering_stock re-checks the tenant ─────────────────────────────

CREATE OR REPLACE FUNCTION public.set_offering_stock(
  p_offering_id uuid,
  p_available   int,           -- NULL = unlimited
  p_tenant_id   uuid DEFAULT NULL  -- when supplied, the offering must belong to it
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

  -- The caller is a server action reachable by any authenticated staff member,
  -- so "service-role only" says nothing about WHICH workspace is asking.
  -- Reported as offering_not_found rather than a distinct reason: a caller from
  -- the wrong tenant learns nothing about whether the id exists.
  IF p_tenant_id IS NOT NULL AND v_tenant IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'offering_not_found');
  END IF;

  IF p_available IS NOT NULL AND p_available < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'negative_stock');
  END IF;

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

-- The 2-arg signature from 20261229000211 would otherwise remain as a second,
-- unguarded overload that any caller could reach. Drop it: the 3-arg version has
-- a DEFAULT, so every existing 2-arg call still resolves.
DROP FUNCTION IF EXISTS public.set_offering_stock(uuid, int);

-- ─── 4. grants ──────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.upsert_capacity_pool(uuid, text, uuid, int, text, uuid, int, int, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_offering_stock(uuid, int, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capacity_subject_kinds_verify() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_capacity_pool(uuid, text, uuid, int, text, uuid, int, int, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_offering_stock(uuid, int, uuid) TO service_role;

COMMIT;
