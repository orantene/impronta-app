-- HELD MIGRATION (TUL-1603 / TUL-1607 race fix): guarded confirmation writes.
--
-- The per-seat and per-line confirmation writes were an unlocked read-then-upsert
-- keyed on seat/line only, so a replaced person's late write could overwrite the
-- NEW person's answer. These two functions do the write as ONE statement: lock
-- the seat/line row FOR UPDATE, check its CURRENT person equals the writer, and
-- only then upsert. They return 'ok' or 'stale' (the person changed: nothing was
-- written).
--
-- ADDITIVE and IDEMPOTENT (CREATE OR REPLACE). The code uses them when present
-- and falls back to the old path when they are missing (PGRST202 / 42883), so
-- the code is safe to ship BEFORE this runs.
--
-- Depends on: 20261231422500 (project_assignment_confirmations) and
-- 20261231422600 (offer_line_confirmations). A function whose table does not
-- exist yet only errors when called, and the code treats that as unavailable.
--
-- Callable by the service role only (the server actions use it after checking
-- the signed-in user owns the profile).
--
-- NEEDS Production Migration Manager + Oran's OK. NOT APPLIED.
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.answer_assignment_confirmation(uuid, uuid, text);
--   DROP FUNCTION IF EXISTS public.answer_offer_line_confirmation(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.answer_assignment_confirmation(p_seat uuid, p_talent uuid, p_status text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seat public.booking_talent%ROWTYPE;
BEGIN
  IF p_status NOT IN ('confirmed', 'declined') THEN
    RETURN 'stale';
  END IF;

  SELECT * INTO v_seat FROM public.booking_talent WHERE id = p_seat FOR UPDATE;
  IF NOT FOUND OR v_seat.talent_profile_id IS DISTINCT FROM p_talent THEN
    RETURN 'stale';
  END IF;

  INSERT INTO public.project_assignment_confirmations
    (booking_talent_id, tenant_id, booking_id, talent_profile_id, status, responded_at)
  VALUES
    (v_seat.id, v_seat.tenant_id, v_seat.booking_id, p_talent, p_status, now())
  ON CONFLICT (booking_talent_id) DO UPDATE
    SET talent_profile_id = EXCLUDED.talent_profile_id,
        status = EXCLUDED.status,
        responded_at = EXCLUDED.responded_at;
  RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.answer_offer_line_confirmation(p_line uuid, p_talent uuid, p_status text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_line public.inquiry_offer_line_items%ROWTYPE;
BEGIN
  IF p_status NOT IN ('confirmed', 'declined') THEN
    RETURN 'stale';
  END IF;

  SELECT * INTO v_line FROM public.inquiry_offer_line_items WHERE id = p_line FOR UPDATE;
  IF NOT FOUND OR v_line.tenant_id IS NULL OR v_line.talent_profile_id IS DISTINCT FROM p_talent THEN
    RETURN 'stale';
  END IF;

  INSERT INTO public.offer_line_confirmations
    (offer_line_id, offer_id, tenant_id, talent_profile_id, status, responded_at)
  VALUES
    (v_line.id, v_line.offer_id, v_line.tenant_id, p_talent, p_status, now())
  ON CONFLICT (offer_line_id) DO UPDATE
    SET talent_profile_id = EXCLUDED.talent_profile_id,
        status = EXCLUDED.status,
        responded_at = EXCLUDED.responded_at;
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.answer_assignment_confirmation(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.answer_offer_line_confirmation(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.answer_assignment_confirmation(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.answer_offer_line_confirmation(uuid, uuid, text) TO service_role;
