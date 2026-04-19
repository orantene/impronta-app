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

BEGIN;

-- ============================================================================
-- P1.A agency tables
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
-- P1.B inquiry family
-- ============================================================================

DROP POLICY IF EXISTS inquiries_staff_all ON public.inquiries;
CREATE POLICY inquiries_tenant_staff ON public.inquiries
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS inquiry_participants_staff ON public.inquiry_participants;
CREATE POLICY inquiry_participants_tenant_staff ON public.inquiry_participants
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS inquiry_messages_staff ON public.inquiry_messages;
CREATE POLICY inquiry_messages_tenant_staff ON public.inquiry_messages
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS inquiry_message_reads_staff ON public.inquiry_message_reads;
CREATE POLICY inquiry_message_reads_tenant_staff ON public.inquiry_message_reads
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS inquiry_offers_staff ON public.inquiry_offers;
CREATE POLICY inquiry_offers_tenant_staff ON public.inquiry_offers
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS inquiry_offer_line_items_staff ON public.inquiry_offer_line_items;
CREATE POLICY inquiry_offer_line_items_tenant_staff ON public.inquiry_offer_line_items
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS inquiry_approvals_staff ON public.inquiry_approvals;
CREATE POLICY inquiry_approvals_tenant_staff ON public.inquiry_approvals
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS inquiry_events_staff_read ON public.inquiry_events;
CREATE POLICY inquiry_events_tenant_select ON public.inquiry_events
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS inquiry_action_log_staff_all ON public.inquiry_action_log;
CREATE POLICY inquiry_action_log_tenant_staff ON public.inquiry_action_log
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS inquiry_requirement_groups_staff_all ON public.inquiry_requirement_groups;
CREATE POLICY inquiry_requirement_groups_tenant_staff ON public.inquiry_requirement_groups
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS inquiry_coordinators_staff_all ON public.inquiry_coordinators;
CREATE POLICY inquiry_coordinators_tenant_staff ON public.inquiry_coordinators
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- ============================================================================
-- P1.B booking family
-- ============================================================================

DROP POLICY IF EXISTS agency_bookings_staff_all ON public.agency_bookings;
CREATE POLICY agency_bookings_tenant_staff ON public.agency_bookings
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS booking_talent_staff_all ON public.booking_talent;
CREATE POLICY booking_talent_tenant_staff ON public.booking_talent
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS booking_activity_log_staff_all ON public.booking_activity_log;
CREATE POLICY booking_activity_log_tenant_staff ON public.booking_activity_log
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS failed_engine_effects_staff ON public.failed_engine_effects;
CREATE POLICY failed_engine_effects_tenant_staff ON public.failed_engine_effects
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- ============================================================================
-- P1.B CMS family
-- ============================================================================

DROP POLICY IF EXISTS cms_pages_staff_all ON public.cms_pages;
CREATE POLICY cms_pages_tenant_staff ON public.cms_pages
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS cms_posts_staff_all ON public.cms_posts;
CREATE POLICY cms_posts_tenant_staff ON public.cms_posts
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS cms_navigation_items_staff_all ON public.cms_navigation_items;
CREATE POLICY cms_navigation_items_tenant_staff ON public.cms_navigation_items
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS cms_redirects_staff_all ON public.cms_redirects;
CREATE POLICY cms_redirects_tenant_staff ON public.cms_redirects
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS cms_page_revisions_staff_all ON public.cms_page_revisions;
CREATE POLICY cms_page_revisions_tenant_staff ON public.cms_page_revisions
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS cms_post_revisions_staff_all ON public.cms_post_revisions;
CREATE POLICY cms_post_revisions_tenant_staff ON public.cms_post_revisions
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS collections_staff ON public.collections;
CREATE POLICY collections_tenant_staff ON public.collections
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS collection_items_staff ON public.collection_items;
CREATE POLICY collection_items_tenant_staff ON public.collection_items
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- ============================================================================
-- P1.B analytics family
-- ============================================================================

DROP POLICY IF EXISTS analytics_events_select_staff ON public.analytics_events;
CREATE POLICY analytics_events_tenant_select ON public.analytics_events
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS analytics_daily_rollups_select_staff ON public.analytics_daily_rollups;
CREATE POLICY analytics_daily_rollups_tenant_select ON public.analytics_daily_rollups
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS analytics_funnel_steps_select_staff ON public.analytics_funnel_steps;
CREATE POLICY analytics_funnel_steps_tenant_select ON public.analytics_funnel_steps
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS analytics_search_sessions_select_staff ON public.analytics_search_sessions;
CREATE POLICY analytics_search_sessions_tenant_select ON public.analytics_search_sessions
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS analytics_kpi_snapshots_select_staff ON public.analytics_kpi_snapshots;
CREATE POLICY analytics_kpi_snapshots_tenant_select ON public.analytics_kpi_snapshots
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS analytics_api_cache_select_staff ON public.analytics_api_cache;
CREATE POLICY analytics_api_cache_tenant_select ON public.analytics_api_cache
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

-- ============================================================================
-- P1.B misc ops
-- ============================================================================

DROP POLICY IF EXISTS activity_log_staff ON public.activity_log;
CREATE POLICY activity_log_tenant_staff ON public.activity_log
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS notifications_staff ON public.notifications;
CREATE POLICY notifications_tenant_staff ON public.notifications
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- saved_talent: NOT migrated. Its RLS is user-scoped (user_id = auth.uid()),
-- not staff-scoped, and hub-wide saves intentionally carry tenant_id = NULL.

DROP POLICY IF EXISTS client_accounts_staff_all ON public.client_accounts;
CREATE POLICY client_accounts_tenant_staff ON public.client_accounts
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS client_account_contacts_staff_all ON public.client_account_contacts;
CREATE POLICY client_account_contacts_tenant_staff ON public.client_account_contacts
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS translation_audit_staff_select ON public.translation_audit_events;
CREATE POLICY translation_audit_tenant_select ON public.translation_audit_events
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS ai_search_logs_select_staff ON public.ai_search_logs;
CREATE POLICY ai_search_logs_tenant_select ON public.ai_search_logs
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS talent_submission_snapshots_staff ON public.talent_submission_snapshots;
CREATE POLICY talent_submission_snapshots_tenant_staff ON public.talent_submission_snapshots
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS talent_submission_consents_staff ON public.talent_submission_consents;
CREATE POLICY talent_submission_consents_tenant_staff ON public.talent_submission_consents
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS talent_submission_history_staff ON public.talent_submission_history;
CREATE POLICY talent_submission_history_tenant_staff ON public.talent_submission_history
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS talent_workflow_events_staff ON public.talent_workflow_events;
CREATE POLICY talent_workflow_events_tenant_staff ON public.talent_workflow_events
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- ============================================================================
-- P1.B directory
-- ============================================================================

DROP POLICY IF EXISTS directory_filter_panel_items_staff_all ON public.directory_filter_panel_items;
CREATE POLICY directory_filter_panel_items_tenant_staff ON public.directory_filter_panel_items
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS directory_sidebar_layout_update_staff ON public.directory_sidebar_layout;
CREATE POLICY directory_sidebar_layout_tenant_update ON public.directory_sidebar_layout
  FOR UPDATE
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS directory_sidebar_layout_insert_staff ON public.directory_sidebar_layout;
CREATE POLICY directory_sidebar_layout_tenant_insert ON public.directory_sidebar_layout
  FOR INSERT
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- ============================================================================
-- Note: service-role `*_service` policies on analytics_daily_rollups /
-- analytics_kpi_snapshots / analytics_api_cache / translation_audit_events
-- are intentionally unchanged. The service role bypasses RLS entirely; those
-- policies are decorative. Rewriting them would be churn for no effect.

COMMIT;
