-- visit_transfer takes the version the screen saw (isolated race proof, 2026-09-11).
--
-- Two concurrent transfers of one visit to two different tables BOTH landed:
-- the row lock serialised them, but the second caller re-read the row after
-- the first had moved it and applied its own move on top (last writer wins,
-- version bumped twice). A host moving a party from a stale screen must be
-- told "this table changed since you looked", not silently win. The caller
-- now passes the version it read; NULL keeps the old behaviour for callers
-- that have no screen (none today; the TS wrapper always passes it).
BEGIN;

DROP FUNCTION IF EXISTS public.visit_transfer(uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.visit_transfer(
  p_tenant_id uuid,
  p_visit_id uuid,
  p_to_space uuid,
  p_operation_key text,
  p_expected_version integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visit public.visits%ROWTYPE;
  v_occ uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_visit_id IS NULL OR p_to_space IS NULL
     OR char_length(btrim(COALESCE(p_operation_key, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  SELECT * INTO v_visit FROM public.visits WHERE id = p_visit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_visit.tenant_id IS DISTINCT FROM p_tenant_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant'); END IF;
  IF v_visit.status IS DISTINCT FROM 'open' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_open'); END IF;
  IF p_expected_version IS NOT NULL AND v_visit.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v_visit.version);
  END IF;
  IF v_visit.space_id = p_to_space THEN
    RETURN jsonb_build_object('ok', true, 'visit_id', p_visit_id, 'space_id', p_to_space, 'already', true, 'version', v_visit.version);
  END IF;

  SELECT id INTO v_occ FROM public.visits
   WHERE tenant_id = p_tenant_id AND status = 'open' AND (space_id = p_to_space OR joined_space_id = p_to_space)
     AND id IS DISTINCT FROM p_visit_id
   FOR UPDATE;
  IF FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'space_occupied'); END IF;

  UPDATE public.visits
     SET space_id = p_to_space, version = v_visit.version + 1, updated_at = now()
   WHERE id = p_visit_id AND version = v_visit.version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;
  UPDATE public.orders SET space_id = p_to_space WHERE visit_id = p_visit_id AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object('ok', true, 'visit_id', p_visit_id, 'space_id', p_to_space, 'version', v_visit.version + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.visit_transfer(uuid, uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.visit_transfer(uuid, uuid, uuid, text, integer) TO service_role;

DO $proof$
BEGIN
  IF has_function_privilege('anon', 'public.visit_transfer(uuid, uuid, uuid, text, integer)', 'execute') THEN
    RAISE EXCEPTION 'visit_transfer must not be executable by anon';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.visit_transfer(uuid, uuid, uuid, text, integer)', 'execute') THEN
    RAISE EXCEPTION 'visit_transfer must be executable by service_role';
  END IF;
END
$proof$;

COMMIT;
