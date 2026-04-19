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

### Tenant backfill completeness (all tables, Phase 1)

Run after each `ADD COLUMN tenant_id UUID … / backfill / SET NOT NULL` sequence. Expected = `0` for every table.

```sql
SELECT 'inquiries' AS table_name, COUNT(*) AS null_tenant_rows FROM public.inquiries WHERE tenant_id IS NULL
UNION ALL SELECT 'agency_bookings', COUNT(*) FROM public.agency_bookings WHERE tenant_id IS NULL
UNION ALL SELECT 'cms_pages', COUNT(*) FROM public.cms_pages WHERE tenant_id IS NULL
UNION ALL SELECT 'cms_posts', COUNT(*) FROM public.cms_posts WHERE tenant_id IS NULL
UNION ALL SELECT 'cms_navigation_items', COUNT(*) FROM public.cms_navigation_items WHERE tenant_id IS NULL
UNION ALL SELECT 'collections', COUNT(*) FROM public.collections WHERE tenant_id IS NULL
UNION ALL SELECT 'collection_items', COUNT(*) FROM public.collection_items WHERE tenant_id IS NULL
UNION ALL SELECT 'notifications', COUNT(*) FROM public.notifications WHERE tenant_id IS NULL
UNION ALL SELECT 'activity_log', COUNT(*) FROM public.activity_log WHERE tenant_id IS NULL
UNION ALL SELECT 'saved_talent', COUNT(*) FROM public.saved_talent WHERE tenant_id IS NULL
UNION ALL SELECT 'directory_filter_panel_items', COUNT(*) FROM public.directory_filter_panel_items WHERE tenant_id IS NULL
UNION ALL SELECT 'directory_sidebar_layout', COUNT(*) FROM public.directory_sidebar_layout WHERE tenant_id IS NULL
UNION ALL SELECT 'client_accounts', COUNT(*) FROM public.client_accounts WHERE tenant_id IS NULL
UNION ALL SELECT 'client_account_contacts', COUNT(*) FROM public.client_account_contacts WHERE tenant_id IS NULL
UNION ALL SELECT 'translation_audit_events', COUNT(*) FROM public.translation_audit_events WHERE tenant_id IS NULL
UNION ALL SELECT 'analytics_events', COUNT(*) FROM public.analytics_events WHERE tenant_id IS NULL
UNION ALL SELECT 'analytics_daily_rollups', COUNT(*) FROM public.analytics_daily_rollups WHERE tenant_id IS NULL
UNION ALL SELECT 'analytics_funnel_steps', COUNT(*) FROM public.analytics_funnel_steps WHERE tenant_id IS NULL
UNION ALL SELECT 'analytics_search_sessions', COUNT(*) FROM public.analytics_search_sessions WHERE tenant_id IS NULL
UNION ALL SELECT 'analytics_kpi_snapshots', COUNT(*) FROM public.analytics_kpi_snapshots WHERE tenant_id IS NULL
UNION ALL SELECT 'failed_engine_effects', COUNT(*) FROM public.failed_engine_effects WHERE tenant_id IS NULL
UNION ALL SELECT 'talent_submission_snapshots', COUNT(*) FROM public.talent_submission_snapshots WHERE tenant_id IS NULL
UNION ALL SELECT 'talent_submission_consents', COUNT(*) FROM public.talent_submission_consents WHERE tenant_id IS NULL
UNION ALL SELECT 'talent_submission_history', COUNT(*) FROM public.talent_submission_history WHERE tenant_id IS NULL
UNION ALL SELECT 'talent_workflow_events', COUNT(*) FROM public.talent_workflow_events WHERE tenant_id IS NULL;
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
