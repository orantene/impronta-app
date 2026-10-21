-- TUL-1751: rent missed-percent marker as ONE atomic statement.
--
-- WHY: markPercentMissed (web/src/lib/service-hub/rent/rent-autopay.server.ts) read studio_rent_plans.
-- autopay_percent_missed, appended in code and wrote the whole array back. Two Stripe events for different
-- months landing together could each read the old array and the second write dropped the first month.
--
-- WHAT: public.rent_mark_percent_missed(p_plan_id, p_tenant_id, p_month) appends p_month with
-- array_append in a single UPDATE, guarded by NOT (p_month = ANY(...)) so the same month twice appends once.
-- Returns text: 'marked' (appended), 'already' (month was there), 'not_found' (no such plan in that tenant).
-- SECURITY DEFINER with a pinned search_path; EXECUTE for service_role only (the app calls it on the service role).
--
-- ORDER: HELD in _pending_pm. Apply AFTER 20261231423210_studio_rent_percent_missed_tul1701.sql (creates the
-- autopay_percent_missed column) and BEFORE (or together with) the code that calls it. Additive and idempotent
-- (CREATE OR REPLACE, re-runnable). Code that calls the RPC must not ship before this is applied.
--
-- ROLLBACK: DROP FUNCTION IF EXISTS public.rent_mark_percent_missed(uuid, uuid, text);

BEGIN;

CREATE OR REPLACE FUNCTION public.rent_mark_percent_missed(
  p_plan_id uuid,
  p_tenant_id uuid,
  p_month text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_plan_id IS NULL OR p_tenant_id IS NULL OR p_month IS NULL OR p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'invalid arguments' USING ERRCODE = '22023';
  END IF;

  UPDATE public.studio_rent_plans
     SET autopay_percent_missed = array_append(autopay_percent_missed, p_month)
   WHERE id = p_plan_id
     AND tenant_id = p_tenant_id
     AND NOT (p_month = ANY (autopay_percent_missed));
  IF FOUND THEN
    RETURN 'marked';
  END IF;

  IF EXISTS (SELECT 1 FROM public.studio_rent_plans WHERE id = p_plan_id AND tenant_id = p_tenant_id) THEN
    RETURN 'already';
  END IF;
  RETURN 'not_found';
END;
$$;

REVOKE ALL ON FUNCTION public.rent_mark_percent_missed(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rent_mark_percent_missed(uuid, uuid, text) TO service_role;

COMMIT;
