-- TUL-1375 · Link a service to its shared resources AND create any missing 1-unit pools
-- in ONE transaction (consultant condition): either the link and every pool it needs
-- exist, or nothing changed.
--
-- HELD in _pending_pm (PM-reserved slot). Additive only: one new function. While it is
-- absent the app falls back to "pools first (idempotent), then link", which can leave an
-- unused 1-unit pool behind on a failed link but never a link without a pool.
--
-- The pool plan (create / raise to 1 / use, and the SS-1 parent) is computed by the app
-- (planSpacePoolForLink) from the same rows; this function executes it through the
-- engine's own upsert_capacity_pool and writes the link. Service role only: the calling
-- server action has already authorized workspace staff for p_tenant_id.
--
-- ROLLBACK: DROP FUNCTION IF EXISTS public.link_offering_resources(uuid, uuid, uuid[], jsonb);

BEGIN;

CREATE OR REPLACE FUNCTION public.link_offering_resources(
  p_tenant_id   uuid,
  p_offering_id uuid,
  p_space_ids   uuid[],
  p_pools       jsonb   -- [{ "space_id", "parent_pool_id", "units", "unit_label" }] to create or raise
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attrs jsonb;
  v_set   jsonb;
  v_p     jsonb;
BEGIN
  SELECT attributes INTO v_attrs
    FROM public.talent_offerings
   WHERE id = p_offering_id AND tenant_id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Every linked space must be this workspace's.
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_space_ids, '{}')) sid
     WHERE NOT EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = sid AND s.tenant_id = p_tenant_id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;

  FOR v_p IN SELECT * FROM jsonb_array_elements(COALESCE(p_pools, '[]'::jsonb)) LOOP
    PERFORM public.upsert_capacity_pool(
      p_tenant_id,
      'space',
      (v_p->>'space_id')::uuid,
      GREATEST(1, COALESCE((v_p->>'units')::int, 1)),
      'default',
      NULLIF(v_p->>'parent_pool_id', '')::uuid,
      NULL,
      NULL,
      v_p->>'unit_label',
      true
    );
  END LOOP;

  v_set := COALESCE(v_attrs->'resourceSet', '{}'::jsonb) - 'spaceId';
  v_set := jsonb_set(v_set, '{spaceIds}', to_jsonb(COALESCE(p_space_ids, '{}')));

  UPDATE public.talent_offerings
     SET attributes = jsonb_set(COALESCE(v_attrs, '{}'::jsonb), '{resourceSet}', v_set)
   WHERE id = p_offering_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.link_offering_resources(uuid, uuid, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_offering_resources(uuid, uuid, uuid[], jsonb) TO service_role;

COMMIT;
