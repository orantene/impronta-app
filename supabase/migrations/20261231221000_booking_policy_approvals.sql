-- Package 2 task 6: per-offering policy overrides, role limits, approvals.

BEGIN;

CREATE TABLE IF NOT EXISTS public.booking_policy_overrides (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  offering_id        uuid NOT NULL REFERENCES public.talent_offerings(id) ON DELETE CASCADE,
  deposit_bps        integer,
  cancel_free_hours  integer,
  no_show_fee_cents  bigint,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_policy_overrides_deposit CHECK (deposit_bps IS NULL OR deposit_bps BETWEEN 0 AND 10000),
  CONSTRAINT booking_policy_overrides_hours CHECK (cancel_free_hours IS NULL OR cancel_free_hours >= 0),
  CONSTRAINT booking_policy_overrides_fee CHECK (no_show_fee_cents IS NULL OR no_show_fee_cents >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_policy_overrides_offering_uniq
  ON public.booking_policy_overrides (tenant_id, offering_id);

ALTER TABLE public.booking_policy_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_policy_overrides FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_policy_overrides_select_staff ON public.booking_policy_overrides;
CREATE POLICY booking_policy_overrides_select_staff ON public.booking_policy_overrides
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.booking_policy_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.booking_policy_overrides TO authenticated;
GRANT ALL ON public.booking_policy_overrides TO service_role;

CREATE TABLE IF NOT EXISTS public.role_limits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  role        text NOT NULL,
  action      text NOT NULL,
  limit_cents bigint NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_limits_role_known CHECK (role IN ('viewer', 'editor', 'manager', 'admin', 'owner')),
  CONSTRAINT role_limits_action_known CHECK (action IN ('discount', 'refund')),
  CONSTRAINT role_limits_cents_nonneg CHECK (limit_cents >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS role_limits_action_uniq
  ON public.role_limits (tenant_id, role, action);

ALTER TABLE public.role_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_limits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_limits_select_staff ON public.role_limits;
CREATE POLICY role_limits_select_staff ON public.role_limits
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.role_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.role_limits TO authenticated;
GRANT ALL ON public.role_limits TO service_role;

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  subject_id   uuid NOT NULL,
  requested_by uuid NOT NULL,
  decided_by   uuid,
  decision     text,
  reason       text,
  operation_key text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  CONSTRAINT approval_requests_kind_known CHECK (kind IN ('discount', 'refund')),
  CONSTRAINT approval_requests_decision_known CHECK (decision IS NULL OR decision IN ('approved', 'denied')),
  CONSTRAINT approval_requests_key_shape CHECK (char_length(btrim(operation_key)) BETWEEN 8 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_operation_key_uniq
  ON public.approval_requests (tenant_id, operation_key);

CREATE INDEX IF NOT EXISTS approval_requests_open_idx
  ON public.approval_requests (tenant_id, kind, subject_id)
  WHERE decision IS NULL;

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_requests_select_staff ON public.approval_requests;
CREATE POLICY approval_requests_select_staff ON public.approval_requests
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.approval_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.approval_requests TO authenticated;
GRANT ALL ON public.approval_requests TO service_role;

CREATE OR REPLACE FUNCTION public.request_approval(
  p_tenant_id uuid,
  p_kind text,
  p_subject_id uuid,
  p_requested_by uuid,
  p_operation_key text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := btrim(COALESCE(p_operation_key, ''));
  v_existing public.approval_requests%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_subject_id IS NULL OR p_requested_by IS NULL
     OR p_kind IS NULL OR p_kind NOT IN ('discount', 'refund')
     OR char_length(v_key) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_existing
    FROM public.approval_requests
   WHERE tenant_id = p_tenant_id AND operation_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'request_id', v_existing.id, 'decision', v_existing.decision);
  END IF;

  INSERT INTO public.approval_requests (
    tenant_id, kind, subject_id, requested_by, reason, operation_key
  ) VALUES (
    p_tenant_id, p_kind, p_subject_id, p_requested_by,
    left(btrim(COALESCE(p_reason, '')), 200), v_key
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'request_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_approval(
  p_tenant_id uuid,
  p_request_id uuid,
  p_decided_by uuid,
  p_decision text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.approval_requests%ROWTYPE;
  v_role text;
BEGIN
  IF p_tenant_id IS NULL OR p_request_id IS NULL OR p_decided_by IS NULL
     OR p_decision IS NULL OR p_decision NOT IN ('approved', 'denied') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_req FROM public.approval_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_req.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_req.decision IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_decided');
  END IF;

  SELECT m.role INTO v_role
    FROM public.agency_memberships m
   WHERE m.tenant_id = p_tenant_id
     AND m.profile_id = p_decided_by
     AND m.status = 'active'
   LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_manager');
  END IF;

  UPDATE public.approval_requests
     SET decision = p_decision,
         decided_by = p_decided_by,
         decided_at = now(),
         reason = left(btrim(COALESCE(p_reason, v_req.reason, '')), 200)
   WHERE id = v_req.id AND decision IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;

  RETURN jsonb_build_object('ok', true, 'request_id', v_req.id, 'decision', p_decision);
END;
$$;

REVOKE ALL ON FUNCTION public.request_approval(uuid, text, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_approval(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_approval(uuid, text, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_approval(uuid, uuid, uuid, text, text) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.request_approval(uuid,text,uuid,uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'request_approval is executable by anon';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_reply jsonb;
BEGIN
  v_reply := public.decide_approval(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'approved', 'x');
  IF v_reply->>'reason' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'P2 decide proof: expected not_found, got %', v_reply;
  END IF;
END
$proof$;

COMMIT;
