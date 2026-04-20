-- SaaS Phase 2 / P2.2 — tenant-scoped RLS on every tenantised table.
--
-- Ref: Plan §4 (Ownership), §22 (Security tests), §22.9 (zero-leak),
--      L37 (fail-hard tenant resolution), L42 (capability model).
--
-- Strategy: drop every `is_agency_staff()`-based "staff-all" policy and
-- replace with an `is_staff_of_tenant(tenant_id)`-based one that scopes
-- rows to the caller's tenant memberships (platform admins still see all).
--
-- NOT touched:
--   * Participant / client / talent / owner policies (e.g. inquiries_select_own,
--     inquiry_participants_client_select, saved_select_own). Those grant
--     per-user access, not tenant access, and remain correct.
--   * Service-role policies (`*_service`). Service role bypasses RLS entirely.
--   * Public-read policies (e.g. cms_pages_select_published). Phase 4 tightens
--     those with current_tenant_id() once hostname routing lands.
--
-- Safety: every DROP uses IF EXISTS and every CREATE names a NEW policy
-- (_tenant suffix) so replay is idempotent and a partially-applied run can
-- be completed without resetting.
--
-- Defensive: every policy block is wrapped in a DO $$ IF to_regclass(...) $$
-- guard so environments that never created the underlying legacy table skip
-- cleanly instead of halting the P2 rollout. This matches the B1–B9 pattern.

BEGIN;

-- ============================================================================
-- Helper: re-bind "<table>_staff_all" → "<table>_tenant_staff" (ALL/ALL).
-- Kept inline (not a function) so each block stays visible in migration logs.
-- ============================================================================

-- ============================================================================
-- P1.A agency tables (always present — created by P1.A migrations above).
-- ============================================================================

-- agencies (tenant_id IS the id column) --------------------------------------
DROP POLICY IF EXISTS agencies_staff_all ON public.agencies;
CREATE POLICY agencies_tenant_staff ON public.agencies
  FOR ALL
  USING       (public.is_staff_of_tenant(id))
  WITH CHECK  (public.is_staff_of_tenant(id));

-- agency_memberships ---------------------------------------------------------
DROP POLICY IF EXISTS agency_memberships_staff_all ON public.agency_memberships;
CREATE POLICY agency_memberships_tenant_staff ON public.agency_memberships
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- agency_domains -------------------------------------------------------------
DROP POLICY IF EXISTS agency_domains_staff_all ON public.agency_domains;
CREATE POLICY agency_domains_tenant_staff ON public.agency_domains
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- agency_entitlements --------------------------------------------------------
DROP POLICY IF EXISTS agency_entitlements_staff_all ON public.agency_entitlements;
CREATE POLICY agency_entitlements_tenant_staff ON public.agency_entitlements
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- agency_usage_counters ------------------------------------------------------
DROP POLICY IF EXISTS agency_usage_counters_staff_all ON public.agency_usage_counters;
CREATE POLICY agency_usage_counters_tenant_staff ON public.agency_usage_counters
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- agency_branding ------------------------------------------------------------
DROP POLICY IF EXISTS agency_branding_staff_all ON public.agency_branding;
CREATE POLICY agency_branding_tenant_staff ON public.agency_branding
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- agency_talent_roster -------------------------------------------------------
DROP POLICY IF EXISTS agency_talent_roster_staff_all ON public.agency_talent_roster;
CREATE POLICY agency_talent_roster_tenant_staff ON public.agency_talent_roster
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- agency_talent_overlays -----------------------------------------------------
DROP POLICY IF EXISTS agency_talent_overlays_staff_all ON public.agency_talent_overlays;
CREATE POLICY agency_talent_overlays_tenant_staff ON public.agency_talent_overlays
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- agency_client_relationships ------------------------------------------------
DROP POLICY IF EXISTS agency_client_relationships_staff_all ON public.agency_client_relationships;
CREATE POLICY agency_client_relationships_tenant_staff ON public.agency_client_relationships
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- platform_audit_log ---------------------------------------------------------
-- Zone 1: tenant-scoped staff see rows where tenant_id = their tenant.
-- Platform admins see all rows, including tenant_id NULL (cross-tenant).
DROP POLICY IF EXISTS platform_audit_log_staff_select ON public.platform_audit_log;
CREATE POLICY platform_audit_log_tenant_select ON public.platform_audit_log
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
  );

-- ============================================================================
-- P1.B legacy tables — each gated by to_regclass() so hosted DBs without the
-- original table skip cleanly.
-- ============================================================================

DO $$
DECLARE
  spec RECORD;
  -- (table_name, old_policy_name, new_policy_name, command [ALL|SELECT|INSERT|UPDATE])
  specs CONSTANT TEXT[][] := ARRAY[
    -- inquiry family
    ARRAY['inquiries',                   'inquiries_staff_all',                   'inquiries_tenant_staff',                   'ALL'],
    ARRAY['inquiry_participants',        'inquiry_participants_staff',            'inquiry_participants_tenant_staff',        'ALL'],
    ARRAY['inquiry_messages',            'inquiry_messages_staff',                'inquiry_messages_tenant_staff',            'ALL'],
    ARRAY['inquiry_message_reads',       'inquiry_message_reads_staff',           'inquiry_message_reads_tenant_staff',       'ALL'],
    ARRAY['inquiry_offers',              'inquiry_offers_staff',                  'inquiry_offers_tenant_staff',              'ALL'],
    ARRAY['inquiry_offer_line_items',    'inquiry_offer_line_items_staff',        'inquiry_offer_line_items_tenant_staff',    'ALL'],
    ARRAY['inquiry_approvals',           'inquiry_approvals_staff',               'inquiry_approvals_tenant_staff',           'ALL'],
    ARRAY['inquiry_events',              'inquiry_events_staff_read',             'inquiry_events_tenant_select',             'SELECT'],
    ARRAY['inquiry_action_log',          'inquiry_action_log_staff_all',          'inquiry_action_log_tenant_staff',          'ALL'],
    ARRAY['inquiry_requirement_groups',  'inquiry_requirement_groups_staff_all',  'inquiry_requirement_groups_tenant_staff',  'ALL'],
    ARRAY['inquiry_coordinators',        'inquiry_coordinators_staff_all',        'inquiry_coordinators_tenant_staff',        'ALL'],
    -- booking family
    ARRAY['agency_bookings',             'agency_bookings_staff_all',             'agency_bookings_tenant_staff',             'ALL'],
    ARRAY['booking_talent',              'booking_talent_staff_all',              'booking_talent_tenant_staff',              'ALL'],
    ARRAY['booking_activity_log',        'booking_activity_log_staff_all',        'booking_activity_log_tenant_staff',        'ALL'],
    ARRAY['failed_engine_effects',       'failed_engine_effects_staff',           'failed_engine_effects_tenant_staff',       'ALL'],
    -- CMS family
    ARRAY['cms_pages',                   'cms_pages_staff_all',                   'cms_pages_tenant_staff',                   'ALL'],
    ARRAY['cms_posts',                   'cms_posts_staff_all',                   'cms_posts_tenant_staff',                   'ALL'],
    ARRAY['cms_navigation_items',        'cms_navigation_items_staff_all',        'cms_navigation_items_tenant_staff',        'ALL'],
    ARRAY['cms_redirects',               'cms_redirects_staff_all',               'cms_redirects_tenant_staff',               'ALL'],
    ARRAY['cms_page_revisions',          'cms_page_revisions_staff_all',          'cms_page_revisions_tenant_staff',          'ALL'],
    ARRAY['cms_post_revisions',          'cms_post_revisions_staff_all',          'cms_post_revisions_tenant_staff',          'ALL'],
    ARRAY['collections',                 'collections_staff',                     'collections_tenant_staff',                 'ALL'],
    ARRAY['collection_items',            'collection_items_staff',                'collection_items_tenant_staff',            'ALL'],
    -- analytics family (SELECT-only — writes go via service role)
    ARRAY['analytics_events',            'analytics_events_select_staff',         'analytics_events_tenant_select',           'SELECT'],
    ARRAY['analytics_daily_rollups',     'analytics_daily_rollups_select_staff',  'analytics_daily_rollups_tenant_select',    'SELECT'],
    ARRAY['analytics_funnel_steps',      'analytics_funnel_steps_select_staff',   'analytics_funnel_steps_tenant_select',     'SELECT'],
    ARRAY['analytics_search_sessions',   'analytics_search_sessions_select_staff','analytics_search_sessions_tenant_select',  'SELECT'],
    ARRAY['analytics_kpi_snapshots',     'analytics_kpi_snapshots_select_staff',  'analytics_kpi_snapshots_tenant_select',    'SELECT'],
    ARRAY['analytics_api_cache',         'analytics_api_cache_select_staff',      'analytics_api_cache_tenant_select',        'SELECT'],
    -- misc ops (ALL except select-only audit/logs)
    ARRAY['activity_log',                'activity_log_staff',                    'activity_log_tenant_staff',                'ALL'],
    ARRAY['notifications',               'notifications_staff',                   'notifications_tenant_staff',               'ALL'],
    -- saved_talent: intentionally not migrated (user-scoped RLS, nullable tenant)
    ARRAY['client_accounts',             'client_accounts_staff_all',             'client_accounts_tenant_staff',             'ALL'],
    ARRAY['client_account_contacts',     'client_account_contacts_staff_all',     'client_account_contacts_tenant_staff',     'ALL'],
    ARRAY['translation_audit_events',    'translation_audit_staff_select',        'translation_audit_tenant_select',          'SELECT'],
    ARRAY['ai_search_logs',              'ai_search_logs_select_staff',           'ai_search_logs_tenant_select',             'SELECT'],
    ARRAY['talent_submission_snapshots', 'talent_submission_snapshots_staff',     'talent_submission_snapshots_tenant_staff', 'ALL'],
    ARRAY['talent_submission_consents',  'talent_submission_consents_staff',      'talent_submission_consents_tenant_staff',  'ALL'],
    ARRAY['talent_submission_history',   'talent_submission_history_staff',       'talent_submission_history_tenant_staff',   'ALL'],
    ARRAY['talent_workflow_events',      'talent_workflow_events_staff',          'talent_workflow_events_tenant_staff',      'ALL'],
    -- directory_filter_panel_items
    ARRAY['directory_filter_panel_items','directory_filter_panel_items_staff_all','directory_filter_panel_items_tenant_staff','ALL']
  ];
  tbl TEXT;
  old_policy TEXT;
  new_policy TEXT;
  cmd TEXT;
BEGIN
  FOR i IN 1 .. array_length(specs, 1) LOOP
    tbl        := specs[i][1];
    old_policy := specs[i][2];
    new_policy := specs[i][3];
    cmd        := specs[i][4];

    IF to_regclass('public.' || tbl) IS NULL THEN
      RAISE NOTICE '% absent — skipping tenant RLS', tbl;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', old_policy, tbl);

    IF cmd = 'ALL' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (public.is_staff_of_tenant(tenant_id)) WITH CHECK (public.is_staff_of_tenant(tenant_id))',
        new_policy, tbl
      );
    ELSIF cmd = 'SELECT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_staff_of_tenant(tenant_id))',
        new_policy, tbl
      );
    END IF;
  END LOOP;
END $$;

-- directory_sidebar_layout: split INSERT + UPDATE policies, special-case.
DO $$
BEGIN
  IF to_regclass('public.directory_sidebar_layout') IS NOT NULL THEN
    DROP POLICY IF EXISTS directory_sidebar_layout_update_staff ON public.directory_sidebar_layout;
    CREATE POLICY directory_sidebar_layout_tenant_update ON public.directory_sidebar_layout
      FOR UPDATE
      USING       (public.is_staff_of_tenant(tenant_id))
      WITH CHECK  (public.is_staff_of_tenant(tenant_id));

    DROP POLICY IF EXISTS directory_sidebar_layout_insert_staff ON public.directory_sidebar_layout;
    CREATE POLICY directory_sidebar_layout_tenant_insert ON public.directory_sidebar_layout
      FOR INSERT
      WITH CHECK (public.is_staff_of_tenant(tenant_id));
  ELSE
    RAISE NOTICE 'directory_sidebar_layout absent — skipping tenant RLS';
  END IF;
END $$;

-- ============================================================================
-- Note: service-role `*_service` policies on analytics_daily_rollups /
-- analytics_kpi_snapshots / analytics_api_cache / translation_audit_events
-- are intentionally unchanged. The service role bypasses RLS entirely; those
-- policies are decorative. Rewriting them would be churn for no effect.

COMMIT;
