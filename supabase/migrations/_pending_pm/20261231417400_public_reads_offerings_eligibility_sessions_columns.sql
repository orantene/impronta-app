-- 20261231417400_public_reads_offerings_eligibility_sessions_columns.sql
--
-- HELD FILE (supabase/migrations/_pending_pm/). NOT applied by the author.
-- PROPOSAL for the Production Migration Manager (TUL-1269 #12, package H2, part 2).
-- Follows 20261231417200 (sessions_select_public: scheduled + sellable offering + published event).
--
-- WHAT
--  1. talent_offerings_public_read gains a talent eligibility gate: an offering
--     owned by a talent profile is public only while that profile is approved.
--     Workspace-owned rows (talent_profile_id IS NULL) are unaffected.
--  2. anon loses SELECT on sessions.instructor_user_id (a staff user id). Done by
--     replacing the table-wide anon SELECT with a grant of every OTHER column,
--     computed from the catalog so a column added later is not forgotten here
--     (it will need its own grant, which is the safe default). Signed-in users
--     keep the table grant (staff read sessions as `authenticated`).
--
-- NOT HERE (needs a column inventory first): talent_reviews anon columns,
-- agency_branding_public_select draft theme JSON, overlay note columns.
--
-- DRY RUN (read-only):
--   -- offerings that stop being public (talent profile not approved):
--   select count(*) from public.talent_offerings o
--    where o.status = 'published' and o.visibility in ('public','on_request')
--      and o.moderation_state = 'approved' and o.talent_profile_id is not null
--      and not exists (select 1 from public.talent_profiles tp
--                       where tp.id = o.talent_profile_id and tp.workflow_status = 'approved');
--   -- anon readers of the column (should be none in code):
--   select has_column_privilege('anon', 'public.sessions', 'instructor_user_id', 'SELECT');
-- Apply ONLY if the first count is 0 or the listed talents are expected to be hidden.
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS talent_offerings_public_read ON public.talent_offerings;
--   CREATE POLICY talent_offerings_public_read ON public.talent_offerings
--     FOR SELECT USING (status = 'published' AND visibility IN ('public','on_request')
--                       AND moderation_state = 'approved');
--   GRANT SELECT ON TABLE public.sessions TO anon;

BEGIN;

DROP POLICY IF EXISTS talent_offerings_public_read ON public.talent_offerings;
CREATE POLICY talent_offerings_public_read ON public.talent_offerings
  FOR SELECT USING (
    status = 'published'
    AND visibility IN ('public','on_request')
    AND moderation_state = 'approved'
    AND (
      talent_profile_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.talent_profiles tp
         WHERE tp.id = talent_offerings.talent_profile_id
           AND tp.workflow_status = 'approved'
      )
    )
  );

DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'sessions'
     AND column_name <> 'instructor_user_id';
  IF cols IS NULL THEN
    RAISE EXCEPTION 'sessions has no columns; refusing to change grants';
  END IF;
  EXECUTE 'REVOKE SELECT ON TABLE public.sessions FROM anon';
  EXECUTE format('GRANT SELECT (%s) ON TABLE public.sessions TO anon', cols);
END $$;

COMMIT;
