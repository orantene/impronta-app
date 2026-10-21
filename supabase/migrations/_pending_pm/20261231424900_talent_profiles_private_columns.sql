-- 20261231424900_talent_profiles_private_columns.sql   (TUL-1269, PART A of 2: the RPC)
--
-- HELD FILE (supabase/migrations/_pending_pm/). NOT applied by the author.
-- PM applies: mv to supabase/migrations/, then `cd web && npm run db:push`.
--
-- APPLY ORDER (data-safety): 20261231415400 (defines staff_can_access_talent_profile)
--   -> THIS FILE (additive, safe to apply BEFORE the code merges)
--   -> merge + deploy PR #4392 (code reads private fields through the RPC)
--   -> 20261231425500 (PART B: the REVOKE). Never apply B before the code is live.
--
-- This file is ADDITIVE ONLY: it creates public.talent_private_fields(uuid) and its
-- grants. It revokes NOTHING and changes no existing privilege.
--
-- ─── WHY ─────────────────────────────────────────────────────────────────────
-- `authenticated` can read phone, phone_e164, date_of_birth, legal_name,
-- stripe_account_id, gp_recipient_account_id and ai_search_document of every
-- publicly listed talent (prod: 314 rows; 62 phones, 274 DOBs, 56 legal names,
-- 3 Stripe accounts). Part B closes that. Owners and roster staff still need
-- those fields, so they read them through this function.
--
-- The function is SECURITY DEFINER with search_path '' (everything qualified),
-- returns ONLY the seven private columns, and returns a row only when the profile
-- belongs to auth.uid() or staff_can_access_talent_profile(p_talent_id) is true.
-- Any other caller (and anon, which has no EXECUTE) gets no row.
--
-- Idempotent: safe to re-run.
-- NOTE: assertions use the privilege catalog, never `SET LOCAL ROLE`.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.staff_can_access_talent_profile(uuid)') IS NULL THEN
    RAISE EXCEPTION 'staff_can_access_talent_profile(uuid) is missing: apply 20261231415400 first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.talent_private_fields(p_talent_id uuid)
RETURNS TABLE (
  phone                   text,
  phone_e164              text,
  date_of_birth           date,
  legal_name              text,
  stripe_account_id       text,
  gp_recipient_account_id text,
  ai_search_document      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tp.phone,
         tp.phone_e164,
         tp.date_of_birth,
         tp.legal_name,
         tp.stripe_account_id,
         tp.gp_recipient_account_id,
         tp.ai_search_document
    FROM public.talent_profiles tp
   WHERE tp.id = p_talent_id
     AND auth.uid() IS NOT NULL
     AND (
       tp.user_id = auth.uid()
       OR public.staff_can_access_talent_profile(p_talent_id)
     );
$$;

REVOKE ALL ON FUNCTION public.talent_private_fields(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talent_private_fields(uuid) TO authenticated;

-- ─── Assertions (privilege catalog only) ────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.talent_private_fields(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: anon can EXECUTE talent_private_fields';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.talent_private_fields(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: authenticated cannot EXECUTE talent_private_fields';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.talent_private_fields(uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'assertion failed: talent_private_fields is not SECURITY DEFINER';
  END IF;
END $$;

COMMIT;
