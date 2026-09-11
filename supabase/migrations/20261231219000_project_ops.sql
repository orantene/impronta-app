-- Package 2 task 4: replace talent, discard amendment, milestone money/file,
-- archive / reopen.

BEGIN;

ALTER TABLE public.booking_deliverables
  ADD COLUMN IF NOT EXISTS amount_cents bigint NOT NULL DEFAULT 0;
ALTER TABLE public.booking_deliverables
  DROP CONSTRAINT IF EXISTS booking_deliverables_amount_nonneg;
ALTER TABLE public.booking_deliverables
  ADD CONSTRAINT booking_deliverables_amount_nonneg CHECK (amount_cents >= 0);

ALTER TABLE public.booking_deliverables
  ADD COLUMN IF NOT EXISTS file_path text;

COMMENT ON COLUMN public.booking_deliverables.amount_cents IS
  'Milestone amount in integer cents. 0 means no money attached.';
COMMENT ON COLUMN public.booking_deliverables.file_path IS
  'Object path on the workspace media bucket. Never a public URL.';

CREATE OR REPLACE FUNCTION public.project_replace_talent(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_from_talent uuid,
  p_to_talent uuid,
  p_operation_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.agency_bookings%ROWTYPE;
  v_row public.booking_talent%ROWTYPE;
  v_key text := btrim(COALESCE(p_operation_key, ''));
BEGIN
  IF p_tenant_id IS NULL OR p_booking_id IS NULL OR p_from_talent IS NULL
     OR p_to_talent IS NULL OR char_length(v_key) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF p_from_talent = p_to_talent THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_booking
    FROM public.agency_bookings
   WHERE id = p_booking_id AND tenant_id = p_tenant_id
     FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_booking.status IN ('in_progress', 'completed', 'cancelled', 'archived')
     OR (v_booking.starts_at IS NOT NULL AND v_booking.starts_at <= now()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_started');
  END IF;

  SELECT * INTO v_row
    FROM public.booking_talent
   WHERE booking_id = p_booking_id AND tenant_id = p_tenant_id
     AND talent_profile_id = p_from_talent
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  IF EXISTS (
    SELECT 1 FROM public.talent_bookings tb
     WHERE tb.tenant_id = p_tenant_id
       AND tb.talent_profile_id = p_to_talent
       AND tb.status IN ('confirmed', 'completed')
       AND v_booking.starts_at IS NOT NULL
       AND tb.starts_at < COALESCE(v_booking.ends_at, v_booking.starts_at + interval '1 hour')
       AND COALESCE(tb.ends_at, tb.starts_at + interval '1 hour') > v_booking.starts_at
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'talent_unavailable');
  END IF;

  UPDATE public.booking_talent
     SET talent_profile_id = p_to_talent
   WHERE id = v_row.id AND tenant_id = p_tenant_id;

  IF v_booking.source_inquiry_id IS NOT NULL THEN
    UPDATE public.talent_bookings
       SET talent_profile_id = p_to_talent, updated_at = now()
     WHERE tenant_id = p_tenant_id
       AND inquiry_id = v_booking.source_inquiry_id
       AND talent_profile_id = p_from_talent
       AND status <> 'cancelled';

    UPDATE public.talent_holds
       SET talent_profile_id = p_to_talent
     WHERE tenant_id = p_tenant_id
       AND inquiry_id = v_booking.source_inquiry_id
       AND talent_profile_id = p_from_talent
       AND hold_strength = 'firm';
  END IF;

  RETURN jsonb_build_object('ok', true, 'booking_id', v_booking.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.amendment_discard(
  p_tenant_id uuid,
  p_offer_id uuid,
  p_expected_version integer,
  p_inquiry_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.inquiry_offers%ROWTYPE;
  v_inq public.inquiries%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_offer_id IS NULL
     OR p_expected_version IS NULL OR p_inquiry_expected_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_offer FROM public.inquiry_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_offer.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_offer.status IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_draft');
  END IF;
  IF v_offer.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  SELECT * INTO v_inq FROM public.inquiries WHERE id = v_offer.inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_inq.version IS DISTINCT FROM p_inquiry_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  UPDATE public.inquiry_offers
     SET status = 'superseded'
   WHERE id = v_offer.id AND status = 'draft' AND version = p_expected_version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;

  UPDATE public.inquiries
     SET version = v_inq.version + 1
   WHERE id = v_inq.id AND version = p_inquiry_expected_version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;

  RETURN jsonb_build_object('ok', true, 'offer_id', v_offer.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.project_archive(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.agency_bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_booking
    FROM public.agency_bookings
   WHERE id = p_booking_id AND tenant_id = p_tenant_id
     FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_booking.status = 'archived' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'booking_id', v_booking.id);
  END IF;
  IF v_booking.status NOT IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_archivable');
  END IF;
  UPDATE public.agency_bookings
     SET status = 'archived',
         cancelled_reason = COALESCE(NULLIF(left(btrim(COALESCE(p_reason, '')), 200), ''), cancelled_reason),
         updated_at = now()
   WHERE id = v_booking.id AND tenant_id = p_tenant_id
     AND status IN ('completed', 'cancelled');
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;
  RETURN jsonb_build_object('ok', true, 'booking_id', v_booking.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.project_reopen(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.agency_bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_booking
    FROM public.agency_bookings
   WHERE id = p_booking_id AND tenant_id = p_tenant_id
     FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_booking.status IS DISTINCT FROM 'archived' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_reopenable');
  END IF;
  UPDATE public.agency_bookings
     SET status = 'confirmed', updated_at = now()
   WHERE id = v_booking.id AND tenant_id = p_tenant_id AND status = 'archived';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;
  RETURN jsonb_build_object('ok', true, 'booking_id', v_booking.id, 'reason_text', left(btrim(COALESCE(p_reason, '')), 200));
END;
$$;

REVOKE ALL ON FUNCTION public.project_replace_talent(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.amendment_discard(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.project_archive(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.project_reopen(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_replace_talent(uuid, uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.amendment_discard(uuid, uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.project_archive(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.project_reopen(uuid, uuid, text) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.project_replace_talent(uuid,uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'project_replace_talent is executable by anon';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_reply jsonb;
BEGIN
  v_reply := public.project_replace_talent(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'replace-aa');
  IF v_reply->>'reason' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'P2 replace proof: expected not_found, got %', v_reply;
  END IF;
END
$proof$;

COMMIT;
