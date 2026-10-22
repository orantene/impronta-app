-- TUL-1805 (P1 security): close the 13 remaining RLS policies on prod that still gate on the GLOBAL
-- public.is_agency_staff() (true for staff of ANY tenant). HELD FILE: PM-reserved version, applied only by the
-- PMM on Oran's GO; never applied by the author, never `db push`ed.
--
-- Idempotent and independent of which held migrations were applied: every policy is DROP IF EXISTS + CREATE with an
-- explicit name; the tenant-scoped helpers are CREATE OR REPLACE and depend only on APPLIED objects
-- (agency_memberships, agency_talent_roster, inquiries.tenant_id, is_platform_admin, current_user_tenant_ids).
-- staff_can_access_talent_profile(uuid) is defined here with the SAME body as held 20261231415400 so either order is safe.
--
-- NOT touched (PM decision): talent_profiles_merged_select_public. Held 20261231417600 (TUL-1359) already replaces it
-- with the split talent_select_* policies; two migrations editing it would collide. Do not add it here.
--
-- Per-policy before -> after (before = repo-derived definition = prod per PM read):
--   Global reference tables (countries, locations, taxonomy_terms, app_locales):
--     *_write_staff  FOR ALL  USING/CHECK is_agency_staff()          -> FOR ALL TO authenticated, is_platform_admin() (USING + WITH CHECK)
--     app_locales_select_public  enabled_public OR is_agency_staff()  -> enabled_public            (anon, authenticated)
--     locations_select           archived_at IS NULL OR is_agency_staff() -> archived_at IS NULL
--     taxonomy_select_active     archived_at IS NULL OR is_agency_staff() -> archived_at IS NULL
--     (platform admins still see archived rows through the *_write_staff FOR ALL policy.)
--   staff_permissions_staff   FOR ALL is_agency_staff()  -> FOR ALL TO authenticated, active owner/admin of a tenant the target user belongs to (or platform admin)
--   profile_revisions: revisions_select  is_agency_staff() OR own talent -> staff_can_access_talent_profile(talent_profile_id) OR own talent
--                      revisions_staff_all FOR ALL       -> dropped; revisions_staff_insert/update/delete with staff_can_write_talent_profile
--   talent_embeddings: talent_embeddings_staff_all FOR ALL -> dropped; talent_embeddings_staff_select (access) + _insert/_update/_delete (write)
--   talent_skill_metrics_staff_select is_agency_staff() -> staff_can_access_talent_profile(talent_profile_id)
--   guest_sessions_select_staff       is_agency_staff() -> staff_can_read_guest_session(id) (session tied to an inquiry of the caller's tenant)
-- Writes never use FOR ALL + is_staff_of_tenant (viewers must not write; see for-all-staff-policy-inventory test).
BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER, not anon-executable)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_can_access_talent_profile(p_talent_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.agency_talent_roster r
      WHERE r.talent_profile_id = p_talent_profile_id
        AND r.tenant_id = ANY (public.current_user_tenant_ids())
        AND r.status <> 'removed'
    );
$$;

-- Editor-or-above (active) member of a tenant whose roster holds the talent, or platform admin. Viewers cannot write.
CREATE OR REPLACE FUNCTION public.staff_can_write_talent_profile(p_talent_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
        FROM public.agency_talent_roster r
        JOIN public.agency_memberships m ON m.tenant_id = r.tenant_id
       WHERE r.talent_profile_id = p_talent_profile_id
         AND r.status <> 'removed'
         AND m.profile_id = auth.uid()
         AND m.status = 'active'
         AND m.role IN ('owner', 'admin', 'manager', 'coordinator', 'editor')
    );
$$;

-- Caller is an ACTIVE owner/admin of a tenant that the target user is a member of, or a platform admin.
CREATE OR REPLACE FUNCTION public.staff_is_admin_of_user_tenant(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
        FROM public.agency_memberships me
        JOIN public.agency_memberships them ON them.tenant_id = me.tenant_id
       WHERE me.profile_id = auth.uid()
         AND me.status = 'active'
         AND me.role IN ('owner', 'admin')
         AND them.profile_id = p_user_id
         AND them.status IN ('active', 'pending_acceptance')
    );
$$;

-- Guest session tied to an inquiry of a tenant the caller is staff of (or platform admin).
CREATE OR REPLACE FUNCTION public.staff_can_read_guest_session(p_guest_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.inquiries i
       WHERE i.guest_session_id = p_guest_session_id
         AND i.tenant_id = ANY (public.current_user_tenant_ids())
    );
$$;

REVOKE ALL ON FUNCTION public.staff_can_access_talent_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_can_write_talent_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_is_admin_of_user_tenant(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_can_read_guest_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_can_access_talent_profile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_write_talent_profile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_is_admin_of_user_tenant(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_read_guest_session(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- (a) Global reference tables: writes = platform admin only; public reads keep every non-staff clause.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS countries_write_staff ON public.countries;
CREATE POLICY countries_write_staff ON public.countries
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS locations_write_staff ON public.locations;
CREATE POLICY locations_write_staff ON public.locations
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS taxonomy_write_staff ON public.taxonomy_terms;
CREATE POLICY taxonomy_write_staff ON public.taxonomy_terms
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS app_locales_write_staff ON public.app_locales;
CREATE POLICY app_locales_write_staff ON public.app_locales
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS app_locales_select_public ON public.app_locales;
CREATE POLICY app_locales_select_public ON public.app_locales
  FOR SELECT TO anon, authenticated
  USING (enabled_public = TRUE);

DROP POLICY IF EXISTS locations_select ON public.locations;
CREATE POLICY locations_select ON public.locations
  FOR SELECT
  USING (archived_at IS NULL);

DROP POLICY IF EXISTS taxonomy_select_active ON public.taxonomy_terms;
CREATE POLICY taxonomy_select_active ON public.taxonomy_terms
  FOR SELECT
  USING (archived_at IS NULL);

-- ---------------------------------------------------------------------------
-- (b) staff_permissions: tenant staff with an active owner/admin role only.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS staff_permissions_staff ON public.staff_permissions;
CREATE POLICY staff_permissions_staff ON public.staff_permissions
  FOR ALL TO authenticated
  USING (public.staff_is_admin_of_user_tenant(user_id))
  WITH CHECK (public.staff_is_admin_of_user_tenant(user_id));

-- ---------------------------------------------------------------------------
-- (c) Tenant-scoped rest.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS revisions_select ON public.profile_revisions;
CREATE POLICY revisions_select ON public.profile_revisions
  FOR SELECT TO authenticated
  USING (
    public.staff_can_access_talent_profile(talent_profile_id)
    OR EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id = profile_revisions.talent_profile_id AND t.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS revisions_staff_all ON public.profile_revisions;
DROP POLICY IF EXISTS revisions_staff_insert ON public.profile_revisions;
DROP POLICY IF EXISTS revisions_staff_update ON public.profile_revisions;
DROP POLICY IF EXISTS revisions_staff_delete ON public.profile_revisions;
CREATE POLICY revisions_staff_insert ON public.profile_revisions
  FOR INSERT TO authenticated
  WITH CHECK (public.staff_can_write_talent_profile(talent_profile_id));
CREATE POLICY revisions_staff_update ON public.profile_revisions
  FOR UPDATE TO authenticated
  USING (public.staff_can_write_talent_profile(talent_profile_id))
  WITH CHECK (public.staff_can_write_talent_profile(talent_profile_id));
CREATE POLICY revisions_staff_delete ON public.profile_revisions
  FOR DELETE TO authenticated
  USING (public.staff_can_write_talent_profile(talent_profile_id));

DROP POLICY IF EXISTS talent_embeddings_staff_all ON public.talent_embeddings;
DROP POLICY IF EXISTS talent_embeddings_staff_select ON public.talent_embeddings;
DROP POLICY IF EXISTS talent_embeddings_staff_insert ON public.talent_embeddings;
DROP POLICY IF EXISTS talent_embeddings_staff_update ON public.talent_embeddings;
DROP POLICY IF EXISTS talent_embeddings_staff_delete ON public.talent_embeddings;
CREATE POLICY talent_embeddings_staff_select ON public.talent_embeddings
  FOR SELECT TO authenticated
  USING (public.staff_can_access_talent_profile(talent_profile_id));
CREATE POLICY talent_embeddings_staff_insert ON public.talent_embeddings
  FOR INSERT TO authenticated
  WITH CHECK (public.staff_can_write_talent_profile(talent_profile_id));
CREATE POLICY talent_embeddings_staff_update ON public.talent_embeddings
  FOR UPDATE TO authenticated
  USING (public.staff_can_write_talent_profile(talent_profile_id))
  WITH CHECK (public.staff_can_write_talent_profile(talent_profile_id));
CREATE POLICY talent_embeddings_staff_delete ON public.talent_embeddings
  FOR DELETE TO authenticated
  USING (public.staff_can_write_talent_profile(talent_profile_id));

DROP POLICY IF EXISTS talent_skill_metrics_staff_select ON public.talent_skill_metrics;
CREATE POLICY talent_skill_metrics_staff_select ON public.talent_skill_metrics
  FOR SELECT TO authenticated
  USING (public.staff_can_access_talent_profile(talent_profile_id));

DROP POLICY IF EXISTS guest_sessions_select_staff ON public.guest_sessions;
CREATE POLICY guest_sessions_select_staff ON public.guest_sessions
  FOR SELECT TO authenticated
  USING (public.staff_can_read_guest_session(id));

COMMIT;
