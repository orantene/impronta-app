-- TUL-1371: let a talent change her "lowest price I accept" for one workspace after the first
-- consent. HELD in _pending_pm; applies AFTER 20261231419300 (workspace_service_listings, #4159).
--
-- Why a function and not a write policy: workspace_service_listings has no write policies on
-- purpose (every write goes through a function). This one touches ONE column, for the talent
-- who owns the row, and nothing else. The BEFORE UPDATE guard trigger of 419300 then
-- recomputes the client-price floor and stamps floor_breached_at if the new minimum puts the
-- listing under it, exactly as for any other edit.
--
-- Additive and idempotent (CREATE OR REPLACE). No data change, no backfill.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.set_workspace_service_listing_lowest(uuid, bigint);

BEGIN;

CREATE OR REPLACE FUNCTION public.set_workspace_service_listing_lowest(
  p_listing_id          uuid,
  p_talent_lowest_cents bigint
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_l public.workspace_service_listings%ROWTYPE;
BEGIN
  IF to_regclass('public.workspace_service_listings') IS NULL THEN
    RAISE EXCEPTION 'listings_not_ready' USING ERRCODE = '55000';
  END IF;

  IF p_talent_lowest_cents IS NOT NULL
     AND (p_talent_lowest_cents < 0 OR p_talent_lowest_cents > 1000000000000) THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_l FROM public.workspace_service_listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_own_talent_profile(v_l.talent_profile_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  -- A hidden listing is not sold, so there is nothing to protect; the talent re-accepts first.
  IF v_l.status NOT IN ('offered', 'accepted') THEN
    RAISE EXCEPTION 'listing_not_active' USING ERRCODE = '23514';
  END IF;

  UPDATE public.workspace_service_listings
     SET talent_lowest_cents = p_talent_lowest_cents
   WHERE id = p_listing_id;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_service_listing_lowest(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_workspace_service_listing_lowest(uuid, bigint) TO authenticated;

COMMIT;
