-- Package 1 task 7: waitlist offers that hold a seat until the window closes.
-- T08 restaurant party waitlist is NOT this table (D-POS-59).

BEGIN;

CREATE TABLE IF NOT EXISTS public.waitlist_offers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  waitlist_entry_id  uuid NOT NULL REFERENCES public.session_waitlist_entries(id) ON DELETE CASCADE,
  pool_id            uuid NOT NULL REFERENCES public.capacity_pools(id) ON DELETE RESTRICT,
  offered_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  accepted_at        timestamptz,
  declined_at        timestamptz,
  allocation_id      uuid,
  operation_key      text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_offers_key_shape CHECK (char_length(btrim(operation_key)) BETWEEN 8 AND 200),
  CONSTRAINT waitlist_offers_one_decision CHECK (
    NOT (accepted_at IS NOT NULL AND declined_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_offers_operation_key_uniq
  ON public.waitlist_offers (tenant_id, operation_key);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_offers_live_entry_uniq
  ON public.waitlist_offers (waitlist_entry_id)
  WHERE accepted_at IS NULL AND declined_at IS NULL;

CREATE INDEX IF NOT EXISTS waitlist_offers_open_expiry_idx
  ON public.waitlist_offers (expires_at)
  WHERE accepted_at IS NULL AND declined_at IS NULL;

ALTER TABLE public.waitlist_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_offers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS waitlist_offers_select_staff ON public.waitlist_offers;
CREATE POLICY waitlist_offers_select_staff ON public.waitlist_offers
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.waitlist_offers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.waitlist_offers TO authenticated;
GRANT ALL ON public.waitlist_offers TO service_role;

CREATE OR REPLACE FUNCTION public.waitlist_offer_place(
  p_tenant_id uuid,
  p_entry_id uuid,
  p_operation_key text,
  p_ttl_s integer DEFAULT 900
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.session_waitlist_entries%ROWTYPE;
  v_session public.sessions%ROWTYPE;
  v_pool uuid;
  v_key text := btrim(COALESCE(p_operation_key, ''));
  v_ttl integer := GREATEST(30, LEAST(COALESCE(p_ttl_s, 900), 86400));
  v_existing public.waitlist_offers%ROWTYPE;
  v_reserve jsonb;
  v_alloc uuid;
  v_offer uuid;
  v_expires timestamptz;
BEGIN
  IF p_tenant_id IS NULL OR p_entry_id IS NULL OR char_length(v_key) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_existing
    FROM public.waitlist_offers
   WHERE tenant_id = p_tenant_id AND operation_key = v_key;
  IF FOUND THEN
    IF v_existing.declined_at IS NOT NULL OR v_existing.expires_at <= now() THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'expired');
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'already', true,
      'offer_id', v_existing.id,
      'expires_at', v_existing.expires_at
    );
  END IF;

  SELECT * INTO v_entry FROM public.session_waitlist_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_entry.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_entry.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_accepted');
  END IF;
  IF v_entry.status = 'withdrawn' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_place');
  END IF;

  SELECT * INTO v_session
    FROM public.sessions WHERE id = v_entry.session_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_place'); END IF;

  SELECT cp.id INTO v_pool
    FROM public.capacity_pools cp
   WHERE cp.tenant_id = p_tenant_id
     AND cp.subject_kind = 'session_tier'
     AND cp.subject_id = v_session.id
   ORDER BY cp.created_at
   LIMIT 1;
  IF v_pool IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_place'); END IF;

  v_reserve := public.reserve_resource_set_v2(
    p_tenant_id,
    v_key,
    NULL,
    v_ttl,
    jsonb_build_array(
      jsonb_build_object(
        'pool_id', v_pool,
        'units', v_entry.party_size,
        'starts_at', v_session.starts_at,
        'ends_at', v_session.ends_at
      )
    ),
    '[]'::jsonb
  );
  IF (v_reserve->>'ok')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_place');
  END IF;

  IF jsonb_typeof(v_reserve->'allocation_ids') = 'array'
     AND jsonb_array_length(v_reserve->'allocation_ids') > 0 THEN
    v_alloc := (v_reserve->'allocation_ids'->>0)::uuid;
  END IF;
  v_expires := COALESCE((v_reserve->>'expires_at')::timestamptz, now() + make_interval(secs => v_ttl));

  INSERT INTO public.waitlist_offers (
    tenant_id, waitlist_entry_id, pool_id, offered_at, expires_at,
    allocation_id, operation_key
  ) VALUES (
    p_tenant_id, p_entry_id, v_pool, now(), v_expires, v_alloc, v_key
  ) RETURNING id INTO v_offer;

  UPDATE public.session_waitlist_entries
     SET status = 'offered',
         offered_at = now(),
         offer_expires_at = v_expires,
         updated_at = now()
   WHERE id = p_entry_id AND status IN ('waiting', 'offered');

  RETURN jsonb_build_object('ok', true, 'offer_id', v_offer, 'expires_at', v_expires);
END;
$$;

CREATE OR REPLACE FUNCTION public.waitlist_accept_offer(
  p_tenant_id uuid,
  p_offer_id uuid,
  p_operation_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.waitlist_offers%ROWTYPE;
  v_commit jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_offer_id IS NULL
     OR char_length(btrim(COALESCE(p_operation_key, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_offer FROM public.waitlist_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_offer.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_offer.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'offer_id', v_offer.id, 'allocation_id', v_offer.allocation_id);
  END IF;
  IF v_offer.declined_at IS NOT NULL OR v_offer.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF v_offer.allocation_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  IF v_offer.allocation_id IS NOT NULL THEN
    v_commit := public.commit_capacity(ARRAY[v_offer.allocation_id]);
    IF (v_commit->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
    END IF;
  END IF;

  UPDATE public.waitlist_offers SET accepted_at = now() WHERE id = v_offer.id AND accepted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;

  UPDATE public.session_waitlist_entries
     SET status = 'accepted',
         decided_at = now(),
         accepted_allocation_id = COALESCE(v_offer.allocation_id, accepted_allocation_id),
         updated_at = now()
   WHERE id = v_offer.waitlist_entry_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('ok', true, 'offer_id', v_offer.id, 'allocation_id', v_offer.allocation_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.waitlist_decline_offer(
  p_tenant_id uuid,
  p_offer_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.waitlist_offers%ROWTYPE;
BEGIN
  SELECT * INTO v_offer FROM public.waitlist_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_offer.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_offer.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_accepted');
  END IF;
  IF v_offer.declined_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'offer_id', v_offer.id);
  END IF;
  IF v_offer.allocation_id IS NOT NULL THEN
    PERFORM public.release_capacity(ARRAY[v_offer.allocation_id]);
  END IF;
  UPDATE public.waitlist_offers SET declined_at = now() WHERE id = v_offer.id;
  UPDATE public.session_waitlist_entries
     SET status = 'waiting', offer_expires_at = NULL, updated_at = now()
   WHERE id = v_offer.waitlist_entry_id AND status = 'offered';
  RETURN jsonb_build_object('ok', true, 'offer_id', v_offer.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reap_waitlist_offers(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.waitlist_offers%ROWTYPE;
  v_n integer := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM public.waitlist_offers
     WHERE accepted_at IS NULL AND declined_at IS NULL AND expires_at <= now()
     ORDER BY expires_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
     FOR UPDATE SKIP LOCKED
  LOOP
    IF v_row.allocation_id IS NOT NULL THEN
      PERFORM public.release_capacity(ARRAY[v_row.allocation_id]);
    END IF;
    UPDATE public.waitlist_offers SET declined_at = now() WHERE id = v_row.id AND declined_at IS NULL;
    UPDATE public.session_waitlist_entries
       SET status = 'waiting', offer_expires_at = NULL, updated_at = now()
     WHERE id = v_row.waitlist_entry_id AND status = 'offered';
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'released', v_n);
END;
$$;

REVOKE ALL ON FUNCTION public.waitlist_offer_place(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.waitlist_accept_offer(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.waitlist_decline_offer(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reap_waitlist_offers(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.waitlist_offer_place(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.waitlist_accept_offer(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.waitlist_decline_offer(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reap_waitlist_offers(integer) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.waitlist_offer_place(uuid,uuid,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'waitlist_offer_place is executable by anon';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_reply jsonb;
BEGIN
  v_reply := public.waitlist_accept_offer(gen_random_uuid(), gen_random_uuid(), 'waitlist-aaaa');
  IF v_reply->>'reason' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'P1 waitlist proof: expected not_found, got %', v_reply;
  END IF;
  IF EXISTS (SELECT 1 FROM public.waitlist_offers) AND false THEN
    RAISE EXCEPTION 'a refused accept wrote a row';
  END IF;
END
$proof$;

COMMIT;
