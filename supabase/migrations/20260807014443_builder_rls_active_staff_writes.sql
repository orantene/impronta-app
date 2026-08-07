-- ---------------------------------------------------------------------------
-- Wave 5.2 (page-builder 8/10 program) — builder write policies require an
-- ACTIVE membership.
--
-- `public.is_staff_of_tenant()` admits `pending_acceptance` memberships, so
-- every builder-surface write policy that leaned on it granted INSERT /
-- UPDATE / DELETE to members who had been invited but had NOT yet accepted.
-- The app layer already rejects pending members for mutations
-- (web/src/lib/saas/admin-scope.ts requires status='active'), but RLS is the
-- defense-in-depth layer: a pending member's JWT could still write via
-- PostgREST directly.
--
-- Fix: a new `is_active_staff_of_tenant()` helper (status = 'active' only)
-- and a split of the builder/site-admin policies:
--   - reads stay on is_staff_of_tenant (pending members keep read access —
--     unchanged behavior for invite-preview flows),
--   - writes move to is_active_staff_of_tenant.
--
-- Scope: the builder/site-admin write spine only (cms_* content tables,
-- agency_branding, directory layout). Other tenantised tables still use
-- is_staff_of_tenant for writes; tightening those is a separate audit.
--
-- NOTE on permissive-policy count: each former FOR ALL policy becomes one
-- FOR SELECT + one FOR ALL policy. SELECT gets two permissive policies OR'd
-- together (read-staff + write-active); write commands are gated by the
-- active-only policy alone.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_active_staff_of_tenant(target_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.agency_memberships m
      WHERE m.profile_id = auth.uid()
        AND m.tenant_id  = target_tenant_id
        AND m.status     = 'active'
    );
$$;

COMMENT ON FUNCTION public.is_active_staff_of_tenant(UUID) IS
  'Caller is an ACTIVE member of the given tenant (or a platform admin). Unlike is_staff_of_tenant(), pending_acceptance does NOT qualify. Use for write policies.';

-- ---------------------------------------------------------------------------
-- FOR ALL policies split into staff read + active-only write.
-- ---------------------------------------------------------------------------

-- cms_pages
DROP POLICY IF EXISTS "cms_pages_tenant_staff" ON public.cms_pages;
CREATE POLICY "cms_pages_staff_read" ON public.cms_pages
  FOR SELECT USING (public.is_staff_of_tenant(tenant_id));
CREATE POLICY "cms_pages_active_staff_write" ON public.cms_pages
  FOR ALL USING (public.is_active_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

-- cms_page_sections
DROP POLICY IF EXISTS "cms_page_sections_staff_all" ON public.cms_page_sections;
CREATE POLICY "cms_page_sections_staff_read" ON public.cms_page_sections
  FOR SELECT USING (public.is_staff_of_tenant(tenant_id));
CREATE POLICY "cms_page_sections_active_staff_write" ON public.cms_page_sections
  FOR ALL USING (public.is_active_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

-- cms_page_revisions
DROP POLICY IF EXISTS "cms_page_revisions_tenant_staff" ON public.cms_page_revisions;
CREATE POLICY "cms_page_revisions_staff_read" ON public.cms_page_revisions
  FOR SELECT USING (public.is_staff_of_tenant(tenant_id));
CREATE POLICY "cms_page_revisions_active_staff_write" ON public.cms_page_revisions
  FOR ALL USING (public.is_active_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

-- cms_sections
DROP POLICY IF EXISTS "cms_sections_staff_all" ON public.cms_sections;
CREATE POLICY "cms_sections_staff_read" ON public.cms_sections
  FOR SELECT USING (public.is_staff_of_tenant(tenant_id));
CREATE POLICY "cms_sections_active_staff_write" ON public.cms_sections
  FOR ALL USING (public.is_active_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

-- cms_section_comments
DROP POLICY IF EXISTS "cms_section_comments_staff_all" ON public.cms_section_comments;
CREATE POLICY "cms_section_comments_staff_read" ON public.cms_section_comments
  FOR SELECT USING (public.is_staff_of_tenant(tenant_id));
CREATE POLICY "cms_section_comments_active_staff_write" ON public.cms_section_comments
  FOR ALL USING (public.is_active_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

-- cms_builder_components (previous policy had USING only, no WITH CHECK)
DROP POLICY IF EXISTS "cms_builder_components_staff_write" ON public.cms_builder_components;
CREATE POLICY "cms_builder_components_staff_read" ON public.cms_builder_components
  FOR SELECT USING (public.is_staff_of_tenant(tenant_id));
CREATE POLICY "cms_builder_components_active_staff_write" ON public.cms_builder_components
  FOR ALL USING (public.is_active_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

-- cms_workspace_templates (previous policy had USING only, no WITH CHECK)
DROP POLICY IF EXISTS "cms_workspace_templates_staff_write" ON public.cms_workspace_templates;
CREATE POLICY "cms_workspace_templates_staff_read" ON public.cms_workspace_templates
  FOR SELECT USING (public.is_staff_of_tenant(tenant_id));
CREATE POLICY "cms_workspace_templates_active_staff_write" ON public.cms_workspace_templates
  FOR ALL USING (public.is_active_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

-- cms_navigation_menus
DROP POLICY IF EXISTS "cms_navigation_menus_tenant_staff" ON public.cms_navigation_menus;
CREATE POLICY "cms_navigation_menus_staff_read" ON public.cms_navigation_menus
  FOR SELECT USING (public.is_staff_of_tenant(tenant_id));
CREATE POLICY "cms_navigation_menus_active_staff_write" ON public.cms_navigation_menus
  FOR ALL USING (public.is_active_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

-- cms_navigation_items
DROP POLICY IF EXISTS "cms_navigation_items_tenant_staff" ON public.cms_navigation_items;
CREATE POLICY "cms_navigation_items_staff_read" ON public.cms_navigation_items
  FOR SELECT USING (public.is_staff_of_tenant(tenant_id));
CREATE POLICY "cms_navigation_items_active_staff_write" ON public.cms_navigation_items
  FOR ALL USING (public.is_active_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

-- cms_posts
DROP POLICY IF EXISTS "cms_posts_tenant_staff" ON public.cms_posts;
CREATE POLICY "cms_posts_staff_read" ON public.cms_posts
  FOR SELECT USING (public.is_staff_of_tenant(tenant_id));
CREATE POLICY "cms_posts_active_staff_write" ON public.cms_posts
  FOR ALL USING (public.is_active_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

-- cms_post_revisions
DROP POLICY IF EXISTS "cms_post_revisions_tenant_staff" ON public.cms_post_revisions;
CREATE POLICY "cms_post_revisions_staff_read" ON public.cms_post_revisions
  FOR SELECT USING (public.is_staff_of_tenant(tenant_id));
CREATE POLICY "cms_post_revisions_active_staff_write" ON public.cms_post_revisions
  FOR ALL USING (public.is_active_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

-- cms_redirects
DROP POLICY IF EXISTS "cms_redirects_tenant_staff" ON public.cms_redirects;
CREATE POLICY "cms_redirects_staff_read" ON public.cms_redirects
  FOR SELECT USING (public.is_staff_of_tenant(tenant_id));
CREATE POLICY "cms_redirects_active_staff_write" ON public.cms_redirects
  FOR ALL USING (public.is_active_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

-- agency_branding
DROP POLICY IF EXISTS "agency_branding_tenant_staff" ON public.agency_branding;
CREATE POLICY "agency_branding_staff_read" ON public.agency_branding
  FOR SELECT USING (public.is_staff_of_tenant(tenant_id));
CREATE POLICY "agency_branding_active_staff_write" ON public.agency_branding
  FOR ALL USING (public.is_active_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

-- directory_filter_panel_items
DROP POLICY IF EXISTS "directory_filter_panel_items_tenant_staff" ON public.directory_filter_panel_items;
CREATE POLICY "directory_filter_panel_items_staff_read" ON public.directory_filter_panel_items
  FOR SELECT USING (public.is_staff_of_tenant(tenant_id));
CREATE POLICY "directory_filter_panel_items_active_staff_write" ON public.directory_filter_panel_items
  FOR ALL USING (public.is_active_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- Write-only policies tightened in place (no read implications).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "cms_section_revisions_staff_insert" ON public.cms_section_revisions;
CREATE POLICY "cms_section_revisions_staff_insert" ON public.cms_section_revisions
  FOR INSERT WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS "cms_navigation_revisions_staff_insert" ON public.cms_navigation_revisions;
CREATE POLICY "cms_navigation_revisions_staff_insert" ON public.cms_navigation_revisions
  FOR INSERT WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS "agency_branding_revisions_staff_insert" ON public.agency_branding_revisions;
CREATE POLICY "agency_branding_revisions_staff_insert" ON public.agency_branding_revisions
  FOR INSERT WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS "directory_sidebar_layout_tenant_insert" ON public.directory_sidebar_layout;
CREATE POLICY "directory_sidebar_layout_tenant_insert" ON public.directory_sidebar_layout
  FOR INSERT WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS "directory_sidebar_layout_tenant_update" ON public.directory_sidebar_layout;
CREATE POLICY "directory_sidebar_layout_tenant_update" ON public.directory_sidebar_layout
  FOR UPDATE USING (public.is_active_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_active_staff_of_tenant(tenant_id));
