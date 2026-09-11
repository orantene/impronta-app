-- Package 3 task 4: guest QR substitute offers.

BEGIN;

CREATE TABLE IF NOT EXISTS public.order_line_substitute_offers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  line_id               uuid NOT NULL REFERENCES public.order_lines(id) ON DELETE CASCADE,
  offered_offering_id   uuid NOT NULL REFERENCES public.talent_offerings(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'offered',
  version               integer NOT NULL DEFAULT 1,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_line_substitute_offers_status CHECK (status IN ('offered', 'accepted', 'declined'))
);

CREATE UNIQUE INDEX IF NOT EXISTS order_line_substitute_offers_open_uniq
  ON public.order_line_substitute_offers (line_id) WHERE status = 'offered';

ALTER TABLE public.order_line_substitute_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_line_substitute_offers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_line_substitute_offers_select_staff ON public.order_line_substitute_offers;
CREATE POLICY order_line_substitute_offers_select_staff ON public.order_line_substitute_offers
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.order_line_substitute_offers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_line_substitute_offers TO authenticated;
GRANT ALL ON public.order_line_substitute_offers TO service_role;

CREATE OR REPLACE FUNCTION public.pos_line_offer_substitute(
  p_tenant_id uuid,
  p_line_id uuid,
  p_offered_offering_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line public.order_lines%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO v_line FROM public.order_lines WHERE id = p_line_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_line.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  INSERT INTO public.order_line_substitute_offers (tenant_id, line_id, offered_offering_id)
  VALUES (p_tenant_id, p_line_id, p_offered_offering_id)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
END;
$$;

REVOKE ALL ON FUNCTION public.pos_line_offer_substitute(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_line_offer_substitute(uuid, uuid, uuid) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.pos_line_offer_substitute(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos_line_offer_substitute is executable by anon';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_reply jsonb;
BEGIN
  v_reply := public.pos_line_offer_substitute(gen_random_uuid(), gen_random_uuid(), gen_random_uuid());
  IF v_reply->>'reason' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'P3 guest proof: expected not_found, got %', v_reply;
  END IF;
END
$proof$;

COMMIT;
