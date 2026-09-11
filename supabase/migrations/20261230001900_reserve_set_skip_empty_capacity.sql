-- reserve_resource_set must not call reserve_capacity_batch with an empty array.
--
-- The TypeScript caller always sends `p_capacity` as a JSON array, including
-- `[]` when the purchase is a talent slot with no pool — a gel manicure, a
-- massage, any 1:1 booking. The SQL treated "is an array" as "has legs":
--
--     IF p_capacity IS NOT NULL AND jsonb_typeof(p_capacity) = 'array' THEN
--       -- FOR over zero elements, then:
--       v_alloc := public.reserve_capacity_batch(p_capacity, …);
--
-- `reserve_capacity_batch` refuses an empty array with `reason: 'empty_batch'`,
-- and the resource-set mapper turns every reason other than sold_out /
-- slot_taken into "Could not hold those resources." So a booking that had
-- nothing to allocate was refused as if the engine had failed.
--
-- Measured on the isolated branch: C01 Gel manicure and C02 Massage both
-- returned that sentence after Confirm, stayed on `/book`, and wrote no order.
-- The couples path passed because it carries a room pool, so `p_capacity` was
-- non-empty. Same RPC, two shapes, only one of them worked.
--
-- The empty-batch check at the top of the function already allows
-- holds-without-capacity. This only stops the capacity LEG running when there
-- are no capacity requests. Holds-only and capacity-only are both still valid.

BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_resource_set(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_ttl_seconds integer,
  p_capacity jsonb,
  p_holds jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap jsonb;
  v_hold jsonb;
  v_pool_id uuid;
  v_tenant uuid;
  v_talent uuid;
  v_starts timestamptz;
  v_ends timestamptz;
  v_before int;
  v_after int;
  v_expires timestamptz;
  v_hold_id uuid;
  v_hold_ids uuid[] := '{}';
  v_alloc jsonb;
  v_alloc_ids uuid[] := '{}';
  v_reason text;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input', 'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  IF (p_capacity IS NULL OR jsonb_typeof(p_capacity) <> 'array' OR jsonb_array_length(p_capacity) = 0)
     AND (p_holds IS NULL OR jsonb_typeof(p_holds) <> 'array' OR jsonb_array_length(p_holds) = 0) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'empty_batch', 'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  -- LENGTH, not mere array-ness. An empty array is how the TypeScript caller
  -- says "no capacity legs", and forwarding it to reserve_capacity_batch is
  -- what made every 1:1 booking look like an engine failure.
  IF p_capacity IS NOT NULL
     AND jsonb_typeof(p_capacity) = 'array'
     AND jsonb_array_length(p_capacity) > 0 THEN
    FOR v_cap IN SELECT * FROM jsonb_array_elements(p_capacity)
    LOOP
      v_pool_id := NULLIF(v_cap->>'pool_id', '')::uuid;
      IF v_pool_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'failed_pool_id', NULL, 'failed_talent_id', NULL);
      END IF;
      SELECT tenant_id INTO v_tenant FROM public.capacity_pools WHERE id = v_pool_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'pool_not_found', 'failed_pool_id', v_pool_id, 'failed_talent_id', NULL);
      END IF;
      IF v_tenant IS DISTINCT FROM p_tenant_id THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant', 'failed_pool_id', v_pool_id, 'failed_talent_id', NULL);
      END IF;
    END LOOP;

    v_alloc := public.reserve_capacity_batch(p_capacity, p_ttl_seconds, NULL, p_actor_id);
    IF COALESCE((v_alloc->>'ok')::boolean, false) IS NOT TRUE THEN
      v_reason := COALESCE(v_alloc->>'reason', 'unavailable');
      RETURN jsonb_build_object(
        'ok', false,
        'reason', v_reason,
        'failed_pool_id', NULLIF(v_alloc->>'failed_pool_id', '')::uuid,
        'failed_talent_id', NULL
      );
    END IF;
    SELECT COALESCE(array_agg(x::uuid), '{}')
      INTO v_alloc_ids
      FROM jsonb_array_elements_text(COALESCE(v_alloc->'allocation_ids', '[]'::jsonb)) AS x;
    IF v_alloc ? 'expires_at' AND v_alloc->>'expires_at' IS NOT NULL THEN
      v_expires := (v_alloc->>'expires_at')::timestamptz;
    END IF;
  END IF;

  IF p_holds IS NOT NULL AND jsonb_typeof(p_holds) = 'array' THEN
    FOR v_hold IN
      SELECT value FROM jsonb_array_elements(p_holds) AS value
      ORDER BY value->>'talent_profile_id', value->>'starts_at'
    LOOP
      v_talent := NULLIF(v_hold->>'talent_profile_id', '')::uuid;
      v_starts := NULLIF(v_hold->>'starts_at', '')::timestamptz;
      v_ends := NULLIF(v_hold->>'ends_at', '')::timestamptz;
      v_before := COALESCE(NULLIF(v_hold->>'buffer_before_seconds', '')::int, 0);
      v_after := COALESCE(NULLIF(v_hold->>'buffer_after_seconds', '')::int, 0);
      IF v_talent IS NULL OR v_starts IS NULL OR v_ends IS NULL OR v_ends <= v_starts OR v_before < 0 OR v_after < 0 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'failed_pool_id', NULL, 'failed_talent_id', v_talent);
      END IF;
      v_starts := v_starts - make_interval(secs => v_before);
      v_ends := v_ends + make_interval(secs => v_after);

      INSERT INTO public.talent_holds (
        talent_profile_id,
        tenant_id,
        inquiry_id,
        title,
        starts_at,
        ends_at,
        all_day,
        hold_strength,
        expires_at,
        created_by_user_id
      )
      VALUES (
        v_talent,
        p_tenant_id,
        NULLIF(v_hold->>'inquiry_id', '')::uuid,
        COALESCE(NULLIF(trim(v_hold->>'title'), ''), 'Reservation'),
        v_starts,
        v_ends,
        false,
        'firm',
        CASE
          WHEN p_ttl_seconds IS NULL THEN now() + interval '48 hours'
          ELSE now() + make_interval(secs => p_ttl_seconds)
        END,
        p_actor_id
      )
      RETURNING id, expires_at INTO v_hold_id, v_expires;

      v_hold_ids := v_hold_ids || v_hold_id;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'hold_ids', to_jsonb(v_hold_ids),
    'allocation_ids', to_jsonb(v_alloc_ids),
    'expires_at', v_expires
  );
EXCEPTION
  WHEN exclusion_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slot_taken', 'failed_pool_id', NULL, 'failed_talent_id', v_talent);
  WHEN deadlock_detected OR serialization_failure THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deadlock', 'failed_pool_id', NULL, 'failed_talent_id', v_talent);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'failed_pool_id', NULL, 'failed_talent_id', v_talent, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_resource_set(uuid, uuid, integer, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_resource_set(uuid, uuid, integer, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.reserve_resource_set(uuid, uuid, integer, jsonb, jsonb) IS
  'F02: capacity batch and talent_holds inserts in one function so a later failure rolls back earlier holds. An empty p_capacity array is holds-only, not an empty capacity batch.';

-- ── executable proof ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tenant uuid;
  v_talent uuid;
  v_actor  uuid;
  v_res    jsonb;
  v_starts timestamptz := timestamptz '2099-01-01 10:00:00+00';
  v_ends   timestamptz := timestamptz '2099-01-01 10:45:00+00';
BEGIN
  SELECT id INTO v_tenant FROM public.agencies WHERE id = '33333333-3333-4333-8333-333333333333';
  IF v_tenant IS NULL THEN
    SELECT id INTO v_tenant FROM public.agencies ORDER BY created_at LIMIT 1;
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no tenant to prove against — refusing to apply an unproven change';
  END IF;

  SELECT id INTO v_talent
    FROM public.talent_profiles
   ORDER BY created_at
   LIMIT 1;
  IF v_talent IS NULL THEN
    RAISE EXCEPTION 'no talent profile to prove a holds-only set against';
  END IF;

  SELECT id INTO v_actor FROM auth.users ORDER BY created_at LIMIT 1;

  -- THE BUG: an empty capacity array plus one hold used to return empty_batch
  -- from reserve_capacity_batch and refuse a booking that had a free slot.
  v_res := public.reserve_resource_set(
    v_tenant,
    v_actor,
    900,
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'talent_profile_id', v_talent,
      'starts_at', v_starts,
      'ends_at', v_ends,
      'title', 'proof-holds-only'
    ))
  );

  IF COALESCE((v_res->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'holds-only reserve_resource_set refused: %', v_res;
  END IF;
  IF jsonb_array_length(v_res->'hold_ids') <> 1 THEN
    RAISE EXCEPTION 'holds-only set wrote % holds, expected 1', jsonb_array_length(v_res->'hold_ids');
  END IF;
  IF jsonb_array_length(COALESCE(v_res->'allocation_ids', '[]'::jsonb)) <> 0 THEN
    RAISE EXCEPTION 'holds-only set must not invent allocations: %', v_res->'allocation_ids';
  END IF;

  DELETE FROM public.talent_holds WHERE id = (v_res->'hold_ids'->>0)::uuid;

  -- And an actually empty set is still refused, so we did not open a hole.
  v_res := public.reserve_resource_set(v_tenant, v_actor, 900, '[]'::jsonb, '[]'::jsonb);
  IF (v_res->>'reason') IS DISTINCT FROM 'empty_batch' THEN
    RAISE EXCEPTION 'empty set should refuse empty_batch, got %', v_res;
  END IF;

  RAISE NOTICE 'reserve_resource_set: empty capacity plus a hold succeeds; empty everything still refuses';
END $$;

COMMIT;
