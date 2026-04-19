# Validation Queries — Evidence Log

Canonical record of the `SELECT COUNT(*) … WHERE tenant_id IS NULL = 0` style validation runs that gate each Phase 1 PR. Charter Directive #8: **no green PR without the number.**

---

## Format

Every entry is the full query, the date, the result, and the PR it accompanied.

```
### YYYY-MM-DD — <table / check name> (PR #<n>)
Query:
  <sql>
Result: <number, or table>
PR: <link>
Notes: <if any>
```

---

## Gate queries (Plan §22, §22.5, §22.9)

### Phase 1.A — Agency tables exist

```sql
SELECT COUNT(*) AS expected_10
  FROM pg_tables
 WHERE schemaname = 'public'
   AND tablename IN (
     'agencies','agency_memberships','agency_domains',
     'agency_entitlements','agency_usage_counters','agency_branding',
     'agency_talent_roster','agency_talent_overlays',
     'agency_client_relationships','platform_audit_log'
   );
-- Expected: 10
```

### Phase 1.A — Tenant #1 seed

```sql
SELECT id, slug, display_name, status
  FROM public.agencies
 WHERE id = '00000000-0000-0000-0000-000000000001'::UUID;
-- Expected: one row, slug='impronta', status='active'

SELECT tenant_id, hostname, kind, is_primary, status
  FROM public.agency_domains
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::UUID;
-- Expected: at least one row, hostname='impronta.studiobooking.io',
--           kind='subdomain', is_primary=true, status='active'

SELECT tenant_id, plan_key, ai_enabled
  FROM public.agency_entitlements
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::UUID;
-- Expected: one row, plan_key='legacy', ai_enabled=true
```

### Phase 1.A — Provenance backfill on talent_profiles

```sql
SELECT COUNT(*) FROM public.talent_profiles WHERE source_type IS NULL;
-- Expected: 0 (all existing rows labeled 'legacy')

SELECT source_type, COUNT(*)
  FROM public.talent_profiles
 GROUP BY source_type;
-- Expected: one 'legacy' row-count line matching existing talent total.
```

### Phase 1.A — Roster + relationship backfills

```sql
SELECT
  (SELECT COUNT(*) FROM public.talent_profiles)       AS talent_total,
  (SELECT COUNT(*) FROM public.agency_talent_roster
    WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
      AND source_type = 'legacy')                     AS roster_legacy;
-- Expected: roster_legacy = talent_total (1 roster row per legacy talent).

SELECT
  (SELECT COUNT(*) FROM public.client_profiles)                       AS clients_total,
  (SELECT COUNT(*) FROM public.agency_client_relationships
    WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
      AND source_type = 'legacy')                                     AS rel_legacy;
-- Expected: rel_legacy = clients_total.
```

### Phase 1.B — Tenant backfill completeness (all tables)

Run after each `ADD COLUMN tenant_id UUID … / backfill / SET NOT NULL` sequence. Expected = `0` for every table.

```sql
-- Inquiry family (B1)
SELECT 'inquiries' AS table_name, COUNT(*) AS null_tenant_rows FROM public.inquiries WHERE tenant_id IS NULL
UNION ALL SELECT 'inquiry_participants',       COUNT(*) FROM public.inquiry_participants       WHERE tenant_id IS NULL
UNION ALL SELECT 'inquiry_messages',           COUNT(*) FROM public.inquiry_messages           WHERE tenant_id IS NULL
UNION ALL SELECT 'inquiry_message_reads',      COUNT(*) FROM public.inquiry_message_reads      WHERE tenant_id IS NULL
UNION ALL SELECT 'inquiry_offers',             COUNT(*) FROM public.inquiry_offers             WHERE tenant_id IS NULL
UNION ALL SELECT 'inquiry_offer_line_items',   COUNT(*) FROM public.inquiry_offer_line_items   WHERE tenant_id IS NULL
UNION ALL SELECT 'inquiry_approvals',          COUNT(*) FROM public.inquiry_approvals          WHERE tenant_id IS NULL
UNION ALL SELECT 'inquiry_events',             COUNT(*) FROM public.inquiry_events             WHERE tenant_id IS NULL
UNION ALL SELECT 'inquiry_action_log',         COUNT(*) FROM public.inquiry_action_log         WHERE tenant_id IS NULL
UNION ALL SELECT 'inquiry_requirement_groups', COUNT(*) FROM public.inquiry_requirement_groups WHERE tenant_id IS NULL
UNION ALL SELECT 'inquiry_coordinators',       COUNT(*) FROM public.inquiry_coordinators       WHERE tenant_id IS NULL
-- Booking family (B2)
UNION ALL SELECT 'agency_bookings',            COUNT(*) FROM public.agency_bookings            WHERE tenant_id IS NULL
UNION ALL SELECT 'booking_talent',             COUNT(*) FROM public.booking_talent             WHERE tenant_id IS NULL
UNION ALL SELECT 'booking_activity_log',       COUNT(*) FROM public.booking_activity_log       WHERE tenant_id IS NULL
UNION ALL SELECT 'failed_engine_effects',      COUNT(*) FROM public.failed_engine_effects      WHERE tenant_id IS NULL
-- CMS family (B3)
UNION ALL SELECT 'cms_pages',                  COUNT(*) FROM public.cms_pages                  WHERE tenant_id IS NULL
UNION ALL SELECT 'cms_posts',                  COUNT(*) FROM public.cms_posts                  WHERE tenant_id IS NULL
UNION ALL SELECT 'cms_navigation_items',       COUNT(*) FROM public.cms_navigation_items       WHERE tenant_id IS NULL
UNION ALL SELECT 'cms_redirects',              COUNT(*) FROM public.cms_redirects              WHERE tenant_id IS NULL
UNION ALL SELECT 'cms_page_revisions',         COUNT(*) FROM public.cms_page_revisions         WHERE tenant_id IS NULL
UNION ALL SELECT 'cms_post_revisions',         COUNT(*) FROM public.cms_post_revisions         WHERE tenant_id IS NULL
UNION ALL SELECT 'collections',                COUNT(*) FROM public.collections                WHERE tenant_id IS NULL
UNION ALL SELECT 'collection_items',           COUNT(*) FROM public.collection_items           WHERE tenant_id IS NULL
-- Analytics family (B4)
UNION ALL SELECT 'analytics_events',           COUNT(*) FROM public.analytics_events           WHERE tenant_id IS NULL
UNION ALL SELECT 'analytics_daily_rollups',    COUNT(*) FROM public.analytics_daily_rollups    WHERE tenant_id IS NULL
UNION ALL SELECT 'analytics_funnel_steps',     COUNT(*) FROM public.analytics_funnel_steps     WHERE tenant_id IS NULL
UNION ALL SELECT 'analytics_search_sessions',  COUNT(*) FROM public.analytics_search_sessions  WHERE tenant_id IS NULL
UNION ALL SELECT 'analytics_kpi_snapshots',    COUNT(*) FROM public.analytics_kpi_snapshots    WHERE tenant_id IS NULL
UNION ALL SELECT 'analytics_api_cache',        COUNT(*) FROM public.analytics_api_cache        WHERE tenant_id IS NULL
-- Misc ops (B5) — saved_talent excluded: nullable by design for hub-wide saves
UNION ALL SELECT 'activity_log',               COUNT(*) FROM public.activity_log               WHERE tenant_id IS NULL
UNION ALL SELECT 'notifications',              COUNT(*) FROM public.notifications              WHERE tenant_id IS NULL
UNION ALL SELECT 'client_accounts',            COUNT(*) FROM public.client_accounts            WHERE tenant_id IS NULL
UNION ALL SELECT 'client_account_contacts',    COUNT(*) FROM public.client_account_contacts    WHERE tenant_id IS NULL
UNION ALL SELECT 'translation_audit_events',   COUNT(*) FROM public.translation_audit_events   WHERE tenant_id IS NULL
UNION ALL SELECT 'ai_search_logs',             COUNT(*) FROM public.ai_search_logs             WHERE tenant_id IS NULL
UNION ALL SELECT 'talent_submission_snapshots',COUNT(*) FROM public.talent_submission_snapshots WHERE tenant_id IS NULL
UNION ALL SELECT 'talent_submission_consents', COUNT(*) FROM public.talent_submission_consents  WHERE tenant_id IS NULL
UNION ALL SELECT 'talent_submission_history',  COUNT(*) FROM public.talent_submission_history   WHERE tenant_id IS NULL
UNION ALL SELECT 'talent_workflow_events',     COUNT(*) FROM public.talent_workflow_events      WHERE tenant_id IS NULL
-- Directory (B6)
UNION ALL SELECT 'directory_filter_panel_items', COUNT(*) FROM public.directory_filter_panel_items WHERE tenant_id IS NULL
UNION ALL SELECT 'directory_sidebar_layout',     COUNT(*) FROM public.directory_sidebar_layout     WHERE tenant_id IS NULL;
-- Expected: every row returns null_tenant_rows = 0.
```

### Phase 1.B — Documented-nullable tables (expect NON-zero)

These tables are tenantised but intentionally allow `tenant_id IS NULL`. Verify the column exists; do not enforce zero nulls.

```sql
SELECT 'saved_talent'   AS table_name, COUNT(*) AS null_tenant_rows FROM public.saved_talent   WHERE tenant_id IS NULL
UNION ALL SELECT 'settings',       COUNT(*) FROM public.settings       WHERE tenant_id IS NULL
UNION ALL SELECT 'search_queries', COUNT(*) FROM public.search_queries WHERE tenant_id IS NULL;
-- Expected: non-zero is acceptable; the NULL semantically means "platform-wide"
--           (settings Layer 4), "hub search" (search_queries), or "hub-wide save"
--           (saved_talent post-Phase-7).
```

### Phase 1.B — Index presence

```sql
SELECT tablename, indexname
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname LIKE '%_tenant_id_%'
 ORDER BY tablename;
-- Expected: one index per tenantised table (B1–B7, plus P1.A tables
--           that ship with tenant indexes like agency_talent_roster_tenant_idx).
```

### Cross-tenant RLS zero-leak test (Plan §22.9)

Run with two tenant contexts + multiple agency staff. Expected = `0` rows for each table when reading across tenants.

```sql
-- Run as tenant A staff
SET LOCAL app.current_tenant_id = '<tenant-a-uuid>';
SELECT 'visible_other_tenant_inquiries' AS check_name, COUNT(*) AS leak_count
FROM public.inquiries WHERE tenant_id <> '<tenant-a-uuid>';
-- Expected: 0
```

### Fail-hard tenant resolution (Plan §22.7, §22.9)

Unregistered domain / unknown slug MUST return no tenant; any mutation attempt MUST NOT attach to tenant #1. Verified via integration test, not a single query — test results are logged here.

### Cross-surface serialization contract (Plan §22.9, §24)

Hub response JSON inspection. Expected: zero overlay keys.

```
Test: GET /api/hub/talent/<id> under tenant-present and tenant-absent contexts
Assertion: response body contains no keys from agency_talent_overlays
  (display_headline, local_bio, local_tags, booking_notes, availability_notes,
   internal_score, sort_override, pricing_notes, portfolio_media_ids, metadata)
```

---

## Run log (append newest at top)

*No runs yet — Phase 0 is docs only.*
