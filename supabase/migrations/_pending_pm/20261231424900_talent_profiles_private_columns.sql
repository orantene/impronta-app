-- 20261231424900_talent_profiles_private_columns.sql
--
-- HELD FILE (supabase/migrations/_pending_pm/). NOT applied by the author.
-- PM applies: mv to supabase/migrations/, then `cd web && npm run db:push`.
-- Apply AFTER 20261231415400 (defines staff_can_access_talent_profile) and
-- 20261231415500 (the anon half of this fix). TUL-1269.
--
-- P0 PRIVACY: a signed-in user must not read other tenants' talent PII.
--
-- ─── THE LEAK ────────────────────────────────────────────────────────────────
-- `authenticated` holds a TABLE-WIDE SELECT grant on public.talent_profiles and
-- the policy `talent_profiles_merged_select_public` has no role clause, so any
-- signed-in user reads EVERY publicly listed talent row with EVERY column over
-- PostgREST. Migration 415500 only revoked columns from `anon`. Read-only
-- counts on prod: 314 public rows; 62 phones, 274 dates of birth, 56 legal
-- names, 3 Stripe accounts exposed.
--
-- ─── THE FIX ─────────────────────────────────────────────────────────────────
-- 1. REVOKE the table-level SELECT from `authenticated`, then GRANT SELECT on
--    every column EXCEPT the private set below. (A column-level REVOKE does
--    nothing while a table-level grant exists, so the table grant goes first.)
--    The column list is built from information_schema at apply time, not
--    hand-typed, so a column the types file does not know yet is still granted.
-- 2. Owners and roster staff still need the private fields: the SECURITY
--    DEFINER function public.talent_private_fields(p_talent_id) returns ONLY
--    those columns, and only when the profile belongs to auth.uid() or
--    staff_can_access_talent_profile(p_talent_id) is true.
--
-- PRIVATE SET (authenticated loses these, nothing else):
--   phone, phone_e164, date_of_birth, legal_name,
--   stripe_account_id, gp_recipient_account_id, ai_search_document
--
-- DELIBERATELY NOT in the private set (still readable by authenticated):
--   user_id          52 RLS policies subquery talent_profiles.user_id (see 415500)
--   invitation_email not in the audited seven; a follow-up if wanted
--
-- UNTOUCHED: `anon` (415500 already removed its private columns, this file does
-- not widen it), `service_role`, and every INSERT / UPDATE / DELETE grant.
-- Note: UPDATE ... RETURNING a private column, or filtering on one in WHERE,
-- needs SELECT on it, so user-session code must not do either.
--
-- ─── RULE FOR FUTURE MIGRATIONS (fail-closed, decided by PM) ────────────────
-- A column added to talent_profiles AFTER this file is NOT visible to
-- `authenticated` until the SAME migration adds
--     GRANT SELECT (new_col) ON public.talent_profiles TO authenticated;
-- or declares it private with a comment line `-- private column: new_col`.
-- web/src/lib/supabase/talent-profiles-private-columns.static.test.ts fails the
-- build for a later migration that adds a column with neither.
--
-- Idempotent: safe to re-run.
-- NOTE: assertions use the privilege catalog, never `SET LOCAL ROLE`.

BEGIN;

DO $$
DECLARE
  cols text;
  private_cols constant text[] := ARRAY[
    'phone',
    'phone_e164',
    'date_of_birth',
    'legal_name',
    'stripe_account_id',
    'gp_recipient_account_id',
    'ai_search_document'
  ];
BEGIN
  IF to_regprocedure('public.staff_can_access_talent_profile(uuid)') IS NULL THEN
    RAISE EXCEPTION 'staff_can_access_talent_profile(uuid) is missing: apply 20261231415400 first';
  END IF;

  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'talent_profiles'
     AND column_name <> ALL (private_cols);

  IF cols IS NULL
     OR position('display_name' IN cols) = 0
     OR position('user_id' IN cols) = 0 THEN
    RAISE EXCEPTION 'talent_profiles column list came back empty or incomplete; refusing to revoke';
  END IF;

  REVOKE SELECT ON public.talent_profiles FROM authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.talent_profiles TO authenticated', cols);
END $$;

-- ─── Owner / roster-staff read path ─────────────────────────────────────────
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
DECLARE
  c text;
  private_cols text[] := ARRAY[
    'phone', 'phone_e164', 'date_of_birth', 'legal_name',
    'stripe_account_id', 'gp_recipient_account_id', 'ai_search_document'
  ];
  kept_cols text[] := ARRAY[
    'id', 'user_id', 'profile_code', 'display_name', 'first_name', 'last_name',
    'short_bio', 'is_publicly_hidden', 'deleted_at'
  ];
BEGIN
  FOREACH c IN ARRAY private_cols LOOP
    IF has_column_privilege('authenticated', 'public.talent_profiles', c, 'SELECT') THEN
      RAISE EXCEPTION 'assertion failed: authenticated still holds talent_profiles.%', c;
    END IF;
    IF NOT has_column_privilege('service_role', 'public.talent_profiles', c, 'SELECT') THEN
      RAISE EXCEPTION 'assertion failed: service_role LOST talent_profiles.%', c;
    END IF;
  END LOOP;
  FOREACH c IN ARRAY kept_cols LOOP
    IF NOT has_column_privilege('authenticated', 'public.talent_profiles', c, 'SELECT') THEN
      RAISE EXCEPTION 'assertion failed: authenticated LOST talent_profiles.%', c;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('authenticated', 'public.talent_profiles', 'UPDATE') THEN
    RAISE EXCEPTION 'assertion failed: authenticated LOST UPDATE on talent_profiles';
  END IF;
  IF has_function_privilege('anon', 'public.talent_private_fields(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: anon can EXECUTE talent_private_fields';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.talent_private_fields(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: authenticated cannot EXECUTE talent_private_fields';
  END IF;
END $$;

COMMIT;
