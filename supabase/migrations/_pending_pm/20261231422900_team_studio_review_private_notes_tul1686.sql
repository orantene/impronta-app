-- TUL-1686: in a team studio the client's private review note goes to the
-- WORKSPACE, not the talent (#4178's rule: in a team studio the client is the
-- business's, so is the client's private feedback). Every other work model is
-- unchanged: the note stays the subject talent's coaching channel.
--
-- HELD in _pending_pm. Depends on 20261231420200_agencies_work_model_tul1374.sql
-- (agencies.work_model, the same source the collective split reads). Apply that
-- one first; this file fails on a missing column otherwise.
--
-- Where the note can be read today, and what this changes:
--   * RLS row policy talent_reviews_merged_select_public gives the subject talent
--     her rows, but the private_note COLUMN is not granted to anon/authenticated
--     (20261110070000). So no PostgREST read of the column exists for anyone.
--     The row policy is therefore left as is: changing it would hide the whole
--     review (rating, body, reply) from the talent, which is not the rule.
--   * The only reader was the app's service-role "Growth notes" loader, which
--     bypasses RLS and showed every note to the talent. This migration moves the
--     rule into the database as two signed-in readers, and the app calls them
--     (falling back to the same rule in code while this file is held):
--       review_private_notes_for_talent(profile, limit)  the owner's notes,
--         WITHOUT any review earned in a team_studio workspace.
--       review_private_notes_for_workspace(tenant, limit) the workspace's notes,
--         ACTIVE OWNER or ADMIN members of that tenant only, team_studio only.
--         Not is_staff_of_tenant: that admits viewer/editor/manager seats, members
--         still pending acceptance and platform admins, so a talent holding a
--         viewer seat could read notes about herself (consultant hold, #4234).
--   * The column privilege is re-asserted: the migration aborts if anon or
--     authenticated can SELECT private_note, so a later blanket GRANT cannot
--     silently reopen the talent path.
--
-- Column-safe: no column, grant on other columns, or row policy changes, so every
-- existing reader keeps working.
--
-- Rollback (manual, safe; the app falls back to its in-code rule):
--   DROP FUNCTION IF EXISTS public.review_private_notes_for_talent(uuid, integer);
--   DROP FUNCTION IF EXISTS public.review_private_notes_for_workspace(uuid, integer);
--   DROP FUNCTION IF EXISTS public.review_note_goes_to_workspace(uuid);

BEGIN;

-- 1. The rule, in one place: a review earned in a team_studio workspace sends its
--    private note to that workspace. Unknown/NULL tenant or any other model: no.
CREATE OR REPLACE FUNCTION public.review_note_goes_to_workspace(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_tenant_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.agencies a
     WHERE a.id = p_tenant_id
       AND a.work_model = 'team_studio'
  );
$$;

-- 2. The subject talent's own notes. Owner-only (auth.uid() owns the profile),
--    team-studio reviews left out.
CREATE OR REPLACE FUNCTION public.review_private_notes_for_talent(
  p_talent_profile_id uuid,
  p_limit integer DEFAULT 6
)
RETURNS TABLE (review_id uuid, private_note text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.private_note, r.created_at
    FROM public.talent_reviews r
    JOIN public.talent_profiles tp ON tp.id = r.talent_profile_id
   WHERE r.talent_profile_id = p_talent_profile_id
     AND tp.user_id = auth.uid()
     AND r.private_note IS NOT NULL
     AND btrim(r.private_note) <> ''
     AND NOT public.review_note_goes_to_workspace(r.tenant_id)
   ORDER BY r.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 6), 1), 50);
$$;

-- 3. The workspace's notes. Only an ACTIVE owner or admin membership of that
--    tenant (no viewer/editor/manager seat, no pending member), and only when the
--    tenant runs as a team studio (other models: the note is the talent's).
CREATE OR REPLACE FUNCTION public.review_private_notes_for_workspace(
  p_tenant_id uuid,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (review_id uuid, talent_profile_id uuid, private_note text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.talent_profile_id, r.private_note, r.created_at
    FROM public.talent_reviews r
   WHERE r.tenant_id = p_tenant_id
     AND EXISTS (
           SELECT 1 FROM public.agency_memberships m
            WHERE m.tenant_id  = p_tenant_id
              AND m.profile_id = auth.uid()
              AND m.role IN ('owner', 'admin')
              AND m.status = 'active'
         )
     AND public.review_note_goes_to_workspace(p_tenant_id)
     AND r.private_note IS NOT NULL
     AND btrim(r.private_note) <> ''
   ORDER BY r.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

-- 4. Signed-in callers only. CREATE FUNCTION grants EXECUTE to PUBLIC, so PUBLIC
--    is named explicitly (rls-grant-drift class 1).
REVOKE ALL ON FUNCTION public.review_note_goes_to_workspace(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_note_goes_to_workspace(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.review_private_notes_for_talent(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_private_notes_for_talent(uuid, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.review_private_notes_for_workspace(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_private_notes_for_workspace(uuid, integer) TO authenticated, service_role;

-- 5. The note column stays closed to the API roles (20261110070000). Abort rather
--    than ship the routing on top of an open column.
DO $$
BEGIN
  IF has_column_privilege('anon', 'public.talent_reviews', 'private_note', 'SELECT')
     OR has_column_privilege('authenticated', 'public.talent_reviews', 'private_note', 'SELECT') THEN
    RAISE EXCEPTION 'TUL-1686: talent_reviews.private_note is SELECT-able by anon/authenticated; re-close it (20261110070000) before routing notes';
  END IF;
  IF has_function_privilege('anon', 'public.review_private_notes_for_talent(uuid, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.review_private_notes_for_workspace(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TUL-1686: anon can still execute a private-note reader';
  END IF;
END $$;

COMMIT;
