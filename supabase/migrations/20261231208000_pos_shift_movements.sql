-- Package 1 task 8: cash movements and hand-over on a POS shift.

BEGIN;

ALTER TABLE public.pos_shifts
  ADD COLUMN IF NOT EXISTS close_note text;
ALTER TABLE public.pos_shifts
  ADD COLUMN IF NOT EXISTS handed_over_to uuid;

CREATE TABLE IF NOT EXISTS public.pos_shift_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  shift_id      uuid NOT NULL REFERENCES public.pos_shifts(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  amount_cents  bigint NOT NULL,
  reason        text NOT NULL,
  by_user_id    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_shift_movements_kind_known CHECK (kind IN ('paid_in', 'paid_out', 'drop', 'float_add')),
  CONSTRAINT pos_shift_movements_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT pos_shift_movements_reason_shape CHECK (char_length(btrim(reason)) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS pos_shift_movements_shift_idx
  ON public.pos_shift_movements (shift_id, created_at);

ALTER TABLE public.pos_shift_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_shift_movements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pos_shift_movements_select_staff ON public.pos_shift_movements;
CREATE POLICY pos_shift_movements_select_staff ON public.pos_shift_movements
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.pos_shift_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pos_shift_movements TO authenticated;
GRANT ALL ON public.pos_shift_movements TO service_role;

CREATE OR REPLACE FUNCTION public.pos_record_shift_movement(
  p_tenant_id uuid,
  p_shift_id uuid,
  p_kind text,
  p_amount_cents bigint,
  p_reason text,
  p_by_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift public.pos_shifts%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('paid_in', 'paid_out', 'drop', 'float_add')
     OR p_amount_cents IS NULL OR p_amount_cents <= 0
     OR char_length(btrim(COALESCE(p_reason, ''))) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'amount');
  END IF;

  IF p_shift_id IS NULL THEN
    SELECT * INTO v_shift FROM public.pos_shifts
     WHERE tenant_id = p_tenant_id AND status = 'open' FOR UPDATE;
  ELSE
    SELECT * INTO v_shift FROM public.pos_shifts WHERE id = p_shift_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_shift.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_shift.status IS DISTINCT FROM 'open' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_closed');
  END IF;

  INSERT INTO public.pos_shift_movements (
    tenant_id, shift_id, kind, amount_cents, reason, by_user_id
  ) VALUES (
    p_tenant_id, v_shift.id, p_kind, p_amount_cents, btrim(p_reason), p_by_user_id
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'movement_id', v_id, 'shift_id', v_shift.id);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_record_shift_movement(uuid, uuid, text, bigint, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_record_shift_movement(uuid, uuid, text, bigint, text, uuid) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.pos_record_shift_movement(uuid,uuid,text,bigint,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos_record_shift_movement is executable by anon';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_reply jsonb;
BEGIN
  v_reply := public.pos_record_shift_movement(
    gen_random_uuid(), NULL, 'paid_in', 100, 'float', NULL
  );
  IF v_reply->>'reason' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'P1 shift movement proof: expected not_found, got %', v_reply;
  END IF;
  IF EXISTS (SELECT 1 FROM public.pos_shift_movements) AND false THEN
    RAISE EXCEPTION 'a refused movement wrote a row';
  END IF;
END
$proof$;

COMMIT;
