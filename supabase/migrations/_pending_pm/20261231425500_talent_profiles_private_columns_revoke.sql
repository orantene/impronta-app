-- 20261231425500_talent_profiles_private_columns_revoke.sql   (TUL-1269, PART B of 2)
--
-- HELD FILE (supabase/migrations/_pending_pm/). NOT applied by the author.
-- PM applies: mv to supabase/migrations/, then `cd web && npm run db:push`.
--
-- !!! APPLY ONLY AFTER THE #4392 CODE IS DEPLOYED. !!!
-- Order: 20261231415400 -> 20261231424900 (PART A, the RPC) -> merge + deploy
-- #4392 -> THIS FILE. Before the code is live, the editors, dashboard and admin
-- routes still select phone / date_of_birth / legal_name with the user's session
-- and would fail with "permission denied" (and, worse, hydrate blanks).
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
-- REVOKE the table-level SELECT from `authenticated`, then GRANT SELECT on every
-- column EXCEPT the private set below. (A column-level REVOKE does nothing while
-- a table-level grant exists, so the table grant goes first.) The column list is
-- built from information_schema at apply time, not hand-typed, so a column the
-- types file does not know yet is still granted. Owners and roster staff read the
-- private fields through public.talent_private_fields(uuid) (PART A).
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
-- A column added to talent_profiles AFTER this file (version > 20261231425500) is
-- NOT visible to `authenticated` until the SAME migration adds
--     GRANT SELECT (new_col) ON public.talent_profiles TO authenticated;
-- or declares it private with a comment line `-- private column: new_col`.
-- web/src/lib/supabase/talent-profiles-private-columns.static.test.ts fails the
-- build for a later migration that adds a column with neither. (The cutoff is
-- THIS file's version: a column added before it is swept into the grant list
-- below automatically, because the list is built at apply time.)
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
  IF to_regprocedure('public.talent_private_fields(uuid)') IS NULL THEN
    RAISE EXCEPTION 'talent_private_fields(uuid) is missing: apply 20261231424900 (PART A) first';
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
END $$;

COMMIT;
