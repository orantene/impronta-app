-- TUL-691 (Oran, 2026-10-13): duplicate customer rows for one client merge when
-- matched by VERIFIED email.
--
-- A guest who books twice, or books and later signs in, can leave two live
-- customer rows in one pool: the signed-in row (user_id set) and an unclaimed
-- guest row with the same email, or two guest rows whose email differs only in
-- case/spaces. claimEverything cannot attach the second (customers_tenant_user_key)
-- and logs a 23505. This function folds them into one survivor.
--
-- Strict by design:
--   * runs only when auth.users.email_confirmed_at is set for p_user_id;
--   * matches only the user's own rows or UNCLAIMED rows with the same email;
--     a row owned by another user, or tied to another client profile, is never touched;
--   * never crosses tenants, and never crosses talent-owned pools on a shared
--     tenant (customers are workspace-scoped; owner_talent_profile_id is private);
--   * service role only (called from the verified sign-in path).
-- Non-destructive: losers keep their row with merged_into_id set (the existing
-- merge column). Order roll-ups refresh via orders_rollups_aiud on re-point.
--
-- Applied 2026-10-13. Sized on prod 2026-10-14 (read-only): 0 duplicate groups among
-- 40 live customer rows, so the first run is a no-op today.

CREATE OR REPLACE FUNCTION public.merge_verified_client_customers(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email      text;
  v_profile_id uuid;
  v_merged     integer;
BEGIN
  SELECT lower(btrim(u.email)) INTO v_email
    FROM auth.users u
   WHERE u.id = p_user_id
     AND u.email IS NOT NULL
     AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RETURN 0;
  END IF;

  SELECT cp.id INTO v_profile_id FROM public.client_profiles cp WHERE cp.user_id = p_user_id;

  DROP TABLE IF EXISTS pg_temp._tul691_pairs;
  CREATE TEMP TABLE _tul691_pairs ON COMMIT DROP AS
  WITH cand AS (
    SELECT c.id, c.tenant_id, c.owner_talent_profile_id, c.user_id, c.created_at
      FROM public.customers c
     WHERE c.merged_into_id IS NULL
       AND (c.user_id = p_user_id OR (c.user_id IS NULL AND lower(btrim(c.email)) = v_email))
       AND (c.client_profile_id IS NULL OR c.client_profile_id = v_profile_id)
  ), ranked AS (
    SELECT cand.*,
           first_value(cand.id) OVER (
             PARTITION BY tenant_id, owner_talent_profile_id
             ORDER BY (cand.user_id IS NOT NULL) DESC, cand.created_at, cand.id
           ) AS survivor_id,
           count(*) OVER (PARTITION BY tenant_id, owner_talent_profile_id) AS n
      FROM cand
  )
  SELECT r.id AS loser_id, r.survivor_id
    FROM ranked r
    JOIN public.customers l ON l.id = r.id
    JOIN public.customers s ON s.id = r.survivor_id
   WHERE r.n > 1
     AND r.id <> r.survivor_id
     AND l.tenant_id = s.tenant_id
     AND l.owner_talent_profile_id IS NOT DISTINCT FROM s.owner_talent_profile_id;

  SELECT count(*) INTO v_merged FROM pg_temp._tul691_pairs;
  IF v_merged = 0 THEN
    RETURN 0;
  END IF;

  -- One default card per customer (customer_payment_methods_default_uniq).
  UPDATE public.customer_payment_methods pm SET is_default = false
    FROM pg_temp._tul691_pairs s
   WHERE pm.customer_id = s.loser_id AND pm.is_default AND pm.status = 'active'
     AND EXISTS (SELECT 1 FROM public.customer_payment_methods d
                  WHERE d.customer_id = s.survivor_id AND d.is_default AND d.status = 'active');

  UPDATE public.inquiries SET customer_id = s.survivor_id FROM pg_temp._tul691_pairs s WHERE customer_id = s.loser_id;
  UPDATE public.agency_bookings SET customer_id = s.survivor_id FROM pg_temp._tul691_pairs s WHERE customer_id = s.loser_id;
  UPDATE public.orders SET customer_id = s.survivor_id FROM pg_temp._tul691_pairs s WHERE customer_id = s.loser_id;
  UPDATE public.admissions SET customer_id = s.survivor_id FROM pg_temp._tul691_pairs s WHERE customer_id = s.loser_id;
  UPDATE public.tenant_promo_redemptions SET customer_id = s.survivor_id FROM pg_temp._tul691_pairs s WHERE customer_id = s.loser_id;
  UPDATE public.conversation_identity SET customer_id = s.survivor_id FROM pg_temp._tul691_pairs s WHERE customer_id = s.loser_id;
  UPDATE public.entitlement_credits SET customer_id = s.survivor_id FROM pg_temp._tul691_pairs s WHERE customer_id = s.loser_id;
  UPDATE public.customer_payment_methods SET customer_id = s.survivor_id FROM pg_temp._tul691_pairs s WHERE customer_id = s.loser_id;

  -- Survivor keeps the union of tags and the first non-empty notes.
  UPDATE public.customers c
     SET tags  = (SELECT coalesce(array_agg(DISTINCT t), '{}') FROM (
                    SELECT unnest(c.tags) AS t
                    UNION SELECT unnest(l.tags) FROM public.customers l
                     JOIN pg_temp._tul691_pairs s ON s.loser_id = l.id WHERE s.survivor_id = c.id) x),
         notes = coalesce(nullif(c.notes, ''), (SELECT l.notes FROM public.customers l
                     JOIN pg_temp._tul691_pairs s ON s.loser_id = l.id
                    WHERE s.survivor_id = c.id AND nullif(l.notes, '') IS NOT NULL
                    ORDER BY l.created_at LIMIT 1))
   WHERE c.id IN (SELECT survivor_id FROM pg_temp._tul691_pairs);

  -- Losers stop competing for the unique indexes before the survivor takes the user.
  UPDATE public.customers c SET merged_into_id = s.survivor_id
    FROM pg_temp._tul691_pairs s WHERE c.id = s.loser_id;

  -- Attach the survivor to the user unless that user already owns a live row in
  -- this tenant under another pool (customers_tenant_user_key is per tenant).
  UPDATE public.customers c
     SET user_id = p_user_id,
         client_profile_id = coalesce(c.client_profile_id, v_profile_id)
   WHERE c.id IN (SELECT survivor_id FROM pg_temp._tul691_pairs)
     AND c.user_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.customers o
                      WHERE o.tenant_id = c.tenant_id AND o.user_id = p_user_id
                        AND o.merged_into_id IS NULL AND o.id <> c.id);

  RETURN v_merged;
END;
$$;

COMMENT ON FUNCTION public.merge_verified_client_customers(uuid) IS
  'TUL-691: fold duplicate customer rows for one verified-email client into one '
  'survivor per (tenant, owner pool). Service role only; non-destructive (merged_into_id).';

REVOKE ALL ON FUNCTION public.merge_verified_client_customers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_verified_client_customers(uuid) TO service_role;
