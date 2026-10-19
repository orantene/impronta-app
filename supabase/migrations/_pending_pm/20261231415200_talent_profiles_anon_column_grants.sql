-- 20261231415200_talent_profiles_anon_column_grants.sql
--
-- HELD FILE (supabase/migrations/_pending_pm/). NOT applied by the author.
-- PM applies: mv to supabase/migrations/, then `cd web && npm run db:push`.
--
-- P0 PRIVACY (PR 0b-3): visitors cannot read talents' private details.
--
-- ─── THE LEAK ────────────────────────────────────────────────────────────────
-- `anon` holds a TABLE-WIDE SELECT grant on public.talent_profiles (20261229000700
-- records that 255 tables keep it). The public policy `talent_select_public`
-- (USING deleted_at IS NULL AND is_publicly_hidden = false AND
-- talent_has_public_roster(id)) is ROW level, so every visible row hands over
-- EVERY column to any holder of the public anon key via PostgREST. Confirmed on
-- staging (read-only, counts only, rolled-back `set local role anon`): 135 rows
-- visible, of which phone 2, date_of_birth 1, legal_name 1, stripe_account_id 1
-- are non-null; has_column_privilege('anon', ..., 'SELECT') is TRUE for phone,
-- phone_e164, date_of_birth, legal_name, invitation_email, stripe_account_id,
-- gp_recipient_account_id, user_id, ai_search_document.
--
-- ─── THE FIX ─────────────────────────────────────────────────────────────────
-- Same pattern as 20261126000000 (agency_domains) and 20261110070000
-- (talent_reviews): REVOKE the blanket grant from `anon`, then GRANT SELECT on
-- every column EXCEPT the private set. The grant list is built from
-- information_schema at apply time (not hand-typed) so a column the types file
-- does not know about yet (e.g. processing_fee_payer) is still granted, and the
-- only columns that change are the nine named below.
--
-- PRIVATE SET (anon loses these, nothing else):
--   phone, phone_e164, date_of_birth, legal_name, invitation_email,
--   stripe_account_id, gp_recipient_account_id, user_id, ai_search_document
--
-- `authenticated` keeps its table-wide grant (documented residual: the public
-- policy has no role clause, so a logged-in user can still read these on public
-- rows; closing that needs per-caller tracing, see 20261126000000). `service_role`
-- is untouched. Every app reader that needs a private column on behalf of a
-- visitor already goes through the service role (TalentSiteMessagesDock,
-- load-starter-data, talent-policies/facts). The one anon-client reader that
-- FILTERED on date_of_birth (directory age band) is moved to a service-role id
-- resolve in the same PR (web/src/lib/directory/fetch-directory-page.ts).
--
-- FAIL-CLOSED: a column added to talent_profiles AFTER this file will NOT be
-- selectable by anon until a follow-up `GRANT SELECT (new_col)` is added.
-- web/src/lib/supabase/talent-profiles-anon-grants.static.test.ts pins this.
--
-- ─── MEDIA FOLDER SHARE TOKENS ───────────────────────────────────────────────
-- `media_folders_public_share_read` (20260913010000 / 20260914020000) is
-- `FOR SELECT USING (share_token IS NOT NULL AND (expired IS NULL OR > now()))`
-- with no role clause and anon holds table SELECT, so any visitor can list every
-- shared folder's share_token across ALL tenants (and with it open any shared
-- folder). The public viewer (web/src/app/share/folder/[token]/page.tsx) reads
-- through createServiceRoleClient(), and staff reads are covered by
-- `media_folders_tenant_isolation`, so the policy has no legitimate consumer.
-- Dropped.
--
-- Idempotent: safe to re-run.
-- NOTE: assertions use the privilege catalog, never `SET LOCAL ROLE` (see
-- 20261126000000: a live role switch breaks the CLI's ledger insert).

BEGIN;

DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'talent_profiles'
     AND column_name NOT IN (
       'phone',
       'phone_e164',
       'date_of_birth',
       'legal_name',
       'invitation_email',
       'stripe_account_id',
       'gp_recipient_account_id',
       'user_id',
       'ai_search_document'
     );

  IF cols IS NULL OR position('display_name' IN cols) = 0 THEN
    RAISE EXCEPTION 'talent_profiles column list came back empty or incomplete; refusing to revoke';
  END IF;

  REVOKE SELECT ON public.talent_profiles FROM anon;
  EXECUTE format('GRANT SELECT (%s) ON public.talent_profiles TO anon', cols);
END $$;

DROP POLICY IF EXISTS media_folders_public_share_read ON public.media_folders;

-- ─── Assertions (privilege catalog only) ────────────────────────────────────
DO $$
DECLARE
  c text;
  private_cols text[] := ARRAY[
    'phone', 'phone_e164', 'date_of_birth', 'legal_name', 'invitation_email',
    'stripe_account_id', 'gp_recipient_account_id', 'user_id', 'ai_search_document'
  ];
  public_cols text[] := ARRAY[
    'id', 'profile_code', 'display_name', 'first_name', 'last_name', 'short_bio',
    'public_slug_part', 'is_publicly_hidden', 'deleted_at', 'height_cm',
    'social_links', 'talent_plan_key', 'home_city_text'
  ];
BEGIN
  FOREACH c IN ARRAY private_cols LOOP
    IF has_column_privilege('anon', 'public.talent_profiles', c, 'SELECT') THEN
      RAISE EXCEPTION 'assertion failed: anon still holds talent_profiles.%', c;
    END IF;
    IF NOT has_column_privilege('authenticated', 'public.talent_profiles', c, 'SELECT') THEN
      RAISE EXCEPTION 'assertion failed: authenticated LOST talent_profiles.%', c;
    END IF;
  END LOOP;
  FOREACH c IN ARRAY public_cols LOOP
    IF NOT has_column_privilege('anon', 'public.talent_profiles', c, 'SELECT') THEN
      RAISE EXCEPTION 'assertion failed: anon LOST public column talent_profiles.%', c;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'media_folders'
       AND policyname = 'media_folders_public_share_read'
  ) THEN
    RAISE EXCEPTION 'assertion failed: media_folders_public_share_read still exists';
  END IF;
END $$;

COMMIT;
