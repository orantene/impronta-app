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
--
-- Defensive: each index is created through a DO block that first checks the
-- underlying table exists via to_regclass(). This keeps the migration green
-- on environments that never applied the legacy table creation (matches
-- B1–B8 which are likewise guarded).

BEGIN;

DO $$
DECLARE
  spec RECORD;
  -- (index_name, table_name, columns, where_clause).
  -- where_clause is '' for normal indexes and a trailing 'WHERE …' for partial.
  specs CONSTANT TEXT[][] := ARRAY[
    -- B1 inquiry family
    ARRAY['inquiries_tenant_id_created_idx', 'inquiries', '(tenant_id, created_at DESC)', ''],
    ARRAY['inquiry_participants_tenant_id_idx', 'inquiry_participants', '(tenant_id)', ''],
    ARRAY['inquiry_messages_tenant_id_created_idx', 'inquiry_messages', '(tenant_id, created_at DESC)', ''],
    ARRAY['inquiry_message_reads_tenant_id_idx', 'inquiry_message_reads', '(tenant_id)', ''],
    ARRAY['inquiry_offers_tenant_id_idx', 'inquiry_offers', '(tenant_id)', ''],
    ARRAY['inquiry_offer_line_items_tenant_id_idx', 'inquiry_offer_line_items', '(tenant_id)', ''],
    ARRAY['inquiry_approvals_tenant_id_idx', 'inquiry_approvals', '(tenant_id)', ''],
    ARRAY['inquiry_events_tenant_id_created_idx', 'inquiry_events', '(tenant_id, created_at DESC)', ''],
    ARRAY['inquiry_action_log_tenant_id_created_idx', 'inquiry_action_log', '(tenant_id, created_at DESC)', ''],
    ARRAY['inquiry_requirement_groups_tenant_id_idx', 'inquiry_requirement_groups', '(tenant_id)', ''],
    ARRAY['inquiry_coordinators_tenant_id_idx', 'inquiry_coordinators', '(tenant_id)', ''],
    -- B2 booking family
    ARRAY['agency_bookings_tenant_id_created_idx', 'agency_bookings', '(tenant_id, created_at DESC)', ''],
    ARRAY['booking_talent_tenant_id_idx', 'booking_talent', '(tenant_id)', ''],
    ARRAY['booking_activity_log_tenant_id_created_idx', 'booking_activity_log', '(tenant_id, created_at DESC)', ''],
    ARRAY['failed_engine_effects_tenant_id_idx', 'failed_engine_effects', '(tenant_id)', ''],
    -- B3 CMS family
    ARRAY['cms_pages_tenant_id_idx', 'cms_pages', '(tenant_id)', ''],
    ARRAY['cms_posts_tenant_id_idx', 'cms_posts', '(tenant_id)', ''],
    ARRAY['cms_navigation_items_tenant_id_idx', 'cms_navigation_items', '(tenant_id)', ''],
    ARRAY['cms_redirects_tenant_id_idx', 'cms_redirects', '(tenant_id)', ''],
    ARRAY['cms_page_revisions_tenant_id_idx', 'cms_page_revisions', '(tenant_id)', ''],
    ARRAY['cms_post_revisions_tenant_id_idx', 'cms_post_revisions', '(tenant_id)', ''],
    ARRAY['collections_tenant_id_idx', 'collections', '(tenant_id)', ''],
    ARRAY['collection_items_tenant_id_idx', 'collection_items', '(tenant_id)', ''],
    -- B4 analytics family
    ARRAY['analytics_events_tenant_id_created_idx', 'analytics_events', '(tenant_id, created_at DESC)', ''],
    ARRAY['analytics_daily_rollups_tenant_id_idx', 'analytics_daily_rollups', '(tenant_id)', ''],
    ARRAY['analytics_funnel_steps_tenant_id_idx', 'analytics_funnel_steps', '(tenant_id)', ''],
    ARRAY['analytics_search_sessions_tenant_id_idx', 'analytics_search_sessions', '(tenant_id)', ''],
    ARRAY['analytics_kpi_snapshots_tenant_id_idx', 'analytics_kpi_snapshots', '(tenant_id)', ''],
    ARRAY['analytics_api_cache_tenant_id_idx', 'analytics_api_cache', '(tenant_id)', ''],
    -- B5 misc ops
    ARRAY['activity_log_tenant_id_created_idx', 'activity_log', '(tenant_id, created_at DESC)', ''],
    ARRAY['notifications_tenant_id_idx', 'notifications', '(tenant_id)', ''],
    ARRAY['saved_talent_tenant_id_idx', 'saved_talent', '(tenant_id)', 'WHERE tenant_id IS NOT NULL'],
    ARRAY['client_accounts_tenant_id_idx', 'client_accounts', '(tenant_id)', ''],
    ARRAY['client_account_contacts_tenant_id_idx', 'client_account_contacts', '(tenant_id)', ''],
    ARRAY['translation_audit_events_tenant_id_idx', 'translation_audit_events', '(tenant_id)', ''],
    ARRAY['ai_search_logs_tenant_id_created_idx', 'ai_search_logs', '(tenant_id, created_at DESC)', ''],
    ARRAY['talent_submission_snapshots_tenant_id_idx', 'talent_submission_snapshots', '(tenant_id)', ''],
    ARRAY['talent_submission_consents_tenant_id_idx', 'talent_submission_consents', '(tenant_id)', ''],
    ARRAY['talent_submission_history_tenant_id_idx', 'talent_submission_history', '(tenant_id)', ''],
    ARRAY['talent_workflow_events_tenant_id_idx', 'talent_workflow_events', '(tenant_id)', ''],
    -- B6 directory
    ARRAY['directory_filter_panel_items_tenant_id_idx', 'directory_filter_panel_items', '(tenant_id)', ''],
    ARRAY['directory_sidebar_layout_tenant_id_idx', 'directory_sidebar_layout', '(tenant_id)', ''],
    -- B7 settings + search_queries (nullable — partial indexes)
    ARRAY['settings_tenant_id_idx', 'settings', '(tenant_id)', 'WHERE tenant_id IS NOT NULL'],
    ARRAY['search_queries_tenant_id_idx', 'search_queries', '(tenant_id)', 'WHERE tenant_id IS NOT NULL']
  ];
  idx_name TEXT;
  tbl_name TEXT;
  cols TEXT;
  where_clause TEXT;
BEGIN
  FOR i IN 1 .. array_length(specs, 1) LOOP
    idx_name     := specs[i][1];
    tbl_name     := specs[i][2];
    cols         := specs[i][3];
    where_clause := specs[i][4];

    IF to_regclass('public.' || tbl_name) IS NULL THEN
      RAISE NOTICE '% absent — skipping index %', tbl_name, idx_name;
      CONTINUE;
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I %s %s',
      idx_name, tbl_name, cols, where_clause
    );
  END LOOP;
END $$;

COMMIT;
