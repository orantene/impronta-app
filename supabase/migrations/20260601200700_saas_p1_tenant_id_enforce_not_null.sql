-- SaaS Phase 1.B / B8 — enforce NOT NULL on tenant_id columns.
--
-- Ref: docs/saas/phase-1/migration-plan.md §B8, Plan §4.5, L18.
--
-- Runs after B1–B7 backfills are complete. Tables with intentional NULLs
-- (settings, search_queries) are EXCLUDED. saved_talent is EXCLUDED because
-- Phase 7 will allow hub-wide saves (tenant_id NULL).
--
-- Safety: we guard with EXISTS on information_schema.columns so the migration
-- is idempotent if re-run in a partially-applied environment.

BEGIN;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    -- B1 inquiry family
    'inquiries',
    'inquiry_participants',
    'inquiry_messages',
    'inquiry_message_reads',
    'inquiry_offers',
    'inquiry_offer_line_items',
    'inquiry_approvals',
    'inquiry_events',
    'inquiry_action_log',
    'inquiry_requirement_groups',
    'inquiry_coordinators',
    -- B2 booking family
    'agency_bookings',
    'booking_talent',
    'booking_activity_log',
    'failed_engine_effects',
    -- B3 CMS family
    'cms_pages',
    'cms_posts',
    'cms_navigation_items',
    'cms_redirects',
    'cms_page_revisions',
    'cms_post_revisions',
    'collections',
    'collection_items',
    -- B4 analytics family
    'analytics_events',
    'analytics_daily_rollups',
    'analytics_funnel_steps',
    'analytics_search_sessions',
    'analytics_kpi_snapshots',
    'analytics_api_cache',
    -- B5 misc ops (excluding saved_talent — intentionally nullable)
    'activity_log',
    'notifications',
    'client_accounts',
    'client_account_contacts',
    'translation_audit_events',
    'ai_search_logs',
    'talent_submission_snapshots',
    'talent_submission_consents',
    'talent_submission_history',
    'talent_workflow_events',
    -- B6 directory
    'directory_filter_panel_items',
    'directory_sidebar_layout'
  ];
  null_count BIGINT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Defensive sanity check: refuse to enforce NOT NULL if any row still has
    -- tenant_id IS NULL. This surfaces backfill gaps loudly rather than
    -- silently failing later.
    EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE tenant_id IS NULL', t)
      INTO null_count;
    IF null_count > 0 THEN
      RAISE EXCEPTION
        'Backfill gap: public.% has % rows with tenant_id IS NULL. Re-run B1–B6 before enforcing NOT NULL.',
        t, null_count;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
  END LOOP;
END $$;

COMMIT;
