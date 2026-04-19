-- SaaS Phase 1.B / B9 — tenant_id indexes on every tenantised table.
--
-- Ref: docs/saas/phase-1/migration-plan.md §B9, Plan §4.5.
--
-- Note on CONCURRENTLY: the plan called for CREATE INDEX CONCURRENTLY, but
-- Supabase wraps each migration in a transaction which is incompatible with
-- CONCURRENTLY. Tenant #1 is the only tenant in Phase 1, and all tables are
-- small (< 100k rows on prod), so plain CREATE INDEX is safe. Phase 2+ can
-- rebuild with CONCURRENTLY via out-of-band SQL if needed.
--
-- High-volume tables also get composite (tenant_id, created_at DESC) indexes
-- to support the default tenant-scoped list query pattern without falling
-- back to a sort.

BEGIN;

-- B1 inquiry family ---------------------------------------------------------

CREATE INDEX IF NOT EXISTS inquiries_tenant_id_created_idx
  ON public.inquiries (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inquiry_participants_tenant_id_idx
  ON public.inquiry_participants (tenant_id);

CREATE INDEX IF NOT EXISTS inquiry_messages_tenant_id_created_idx
  ON public.inquiry_messages (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inquiry_message_reads_tenant_id_idx
  ON public.inquiry_message_reads (tenant_id);

CREATE INDEX IF NOT EXISTS inquiry_offers_tenant_id_idx
  ON public.inquiry_offers (tenant_id);

CREATE INDEX IF NOT EXISTS inquiry_offer_line_items_tenant_id_idx
  ON public.inquiry_offer_line_items (tenant_id);

CREATE INDEX IF NOT EXISTS inquiry_approvals_tenant_id_idx
  ON public.inquiry_approvals (tenant_id);

CREATE INDEX IF NOT EXISTS inquiry_events_tenant_id_created_idx
  ON public.inquiry_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inquiry_action_log_tenant_id_created_idx
  ON public.inquiry_action_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inquiry_requirement_groups_tenant_id_idx
  ON public.inquiry_requirement_groups (tenant_id);

CREATE INDEX IF NOT EXISTS inquiry_coordinators_tenant_id_idx
  ON public.inquiry_coordinators (tenant_id);

-- B2 booking family ---------------------------------------------------------

CREATE INDEX IF NOT EXISTS agency_bookings_tenant_id_created_idx
  ON public.agency_bookings (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS booking_talent_tenant_id_idx
  ON public.booking_talent (tenant_id);

CREATE INDEX IF NOT EXISTS booking_activity_log_tenant_id_created_idx
  ON public.booking_activity_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS failed_engine_effects_tenant_id_idx
  ON public.failed_engine_effects (tenant_id);

-- B3 CMS family -------------------------------------------------------------

CREATE INDEX IF NOT EXISTS cms_pages_tenant_id_idx
  ON public.cms_pages (tenant_id);

CREATE INDEX IF NOT EXISTS cms_posts_tenant_id_idx
  ON public.cms_posts (tenant_id);

CREATE INDEX IF NOT EXISTS cms_navigation_items_tenant_id_idx
  ON public.cms_navigation_items (tenant_id);

CREATE INDEX IF NOT EXISTS cms_redirects_tenant_id_idx
  ON public.cms_redirects (tenant_id);

CREATE INDEX IF NOT EXISTS cms_page_revisions_tenant_id_idx
  ON public.cms_page_revisions (tenant_id);

CREATE INDEX IF NOT EXISTS cms_post_revisions_tenant_id_idx
  ON public.cms_post_revisions (tenant_id);

CREATE INDEX IF NOT EXISTS collections_tenant_id_idx
  ON public.collections (tenant_id);

CREATE INDEX IF NOT EXISTS collection_items_tenant_id_idx
  ON public.collection_items (tenant_id);

-- B4 analytics family -------------------------------------------------------

CREATE INDEX IF NOT EXISTS analytics_events_tenant_id_created_idx
  ON public.analytics_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_daily_rollups_tenant_id_idx
  ON public.analytics_daily_rollups (tenant_id);

CREATE INDEX IF NOT EXISTS analytics_funnel_steps_tenant_id_idx
  ON public.analytics_funnel_steps (tenant_id);

CREATE INDEX IF NOT EXISTS analytics_search_sessions_tenant_id_idx
  ON public.analytics_search_sessions (tenant_id);

CREATE INDEX IF NOT EXISTS analytics_kpi_snapshots_tenant_id_idx
  ON public.analytics_kpi_snapshots (tenant_id);

CREATE INDEX IF NOT EXISTS analytics_api_cache_tenant_id_idx
  ON public.analytics_api_cache (tenant_id);

-- B5 misc ops ---------------------------------------------------------------

CREATE INDEX IF NOT EXISTS activity_log_tenant_id_created_idx
  ON public.activity_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_tenant_id_idx
  ON public.notifications (tenant_id);

CREATE INDEX IF NOT EXISTS saved_talent_tenant_id_idx
  ON public.saved_talent (tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS client_accounts_tenant_id_idx
  ON public.client_accounts (tenant_id);

CREATE INDEX IF NOT EXISTS client_account_contacts_tenant_id_idx
  ON public.client_account_contacts (tenant_id);

CREATE INDEX IF NOT EXISTS translation_audit_events_tenant_id_idx
  ON public.translation_audit_events (tenant_id);

CREATE INDEX IF NOT EXISTS ai_search_logs_tenant_id_created_idx
  ON public.ai_search_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS talent_submission_snapshots_tenant_id_idx
  ON public.talent_submission_snapshots (tenant_id);

CREATE INDEX IF NOT EXISTS talent_submission_consents_tenant_id_idx
  ON public.talent_submission_consents (tenant_id);

CREATE INDEX IF NOT EXISTS talent_submission_history_tenant_id_idx
  ON public.talent_submission_history (tenant_id);

CREATE INDEX IF NOT EXISTS talent_workflow_events_tenant_id_idx
  ON public.talent_workflow_events (tenant_id);

-- B6 directory --------------------------------------------------------------

CREATE INDEX IF NOT EXISTS directory_filter_panel_items_tenant_id_idx
  ON public.directory_filter_panel_items (tenant_id);

CREATE INDEX IF NOT EXISTS directory_sidebar_layout_tenant_id_idx
  ON public.directory_sidebar_layout (tenant_id);

-- B7 settings + search_queries (nullable — partial indexes) ----------------

CREATE INDEX IF NOT EXISTS settings_tenant_id_idx
  ON public.settings (tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS search_queries_tenant_id_idx
  ON public.search_queries (tenant_id)
  WHERE tenant_id IS NOT NULL;

COMMIT;
