# Phase 1 — Migration Plan

**Scope.** Additive schema foundation. Create agency-scoped tables, tenantise existing operational tables, backfill, enforce NOT NULL + index. **No RLS changes.** See [README](./README.md) for phase constraints.

**Migration root.** `supabase/migrations/`. Impronta uses timestamp-prefixed SQL migrations (`YYYYMMDDHHMMSS_description.sql`). Phase 1 begins at `20260601...`.

**Tenant #1 UUID.** `00000000-0000-0000-0000-000000000001` (L13 — matches existing `DEFAULT_AI_TENANT_ID` seed).

---

## Milestone breakdown

Phase 1 ships in **two milestones**, each its own PR. Breaks up review, allows independent rollback, lets the M2–M8 engine keep running against tenant #1 between milestones.

### Milestone P1.A — Agency tables + tenant #1 seed

**One PR.** Adds new tables only; touches no existing table (except `talent_profiles` for provenance). Zero risk to M2–M8 flows.

| # | File (planned) | Creates / changes |
|---|---|---|
| A1 | `20260601100000_saas_p1_agencies.sql` | `CREATE TABLE public.agencies` with lifecycle status enum, slug, display_name, template_key, timestamps, `onboarding_completed_at`. Seed tenant #1 row. |
| A2 | `20260601100100_saas_p1_agency_memberships.sql` | `CREATE TABLE public.agency_memberships` (tenant_id, profile_id, role TEXT, status, invited_* columns). Seed superadmin `platform` linkage for tenant #1 owner. |
| A3 | `20260601100200_saas_p1_agency_domains.sql` | `CREATE TABLE public.agency_domains`. Seed tenant #1 subdomain row (`impronta.studiobooking.io`, status `active`, `is_primary = true`). |
| A4 | `20260601100300_saas_p1_agency_entitlements.sql` | `CREATE TABLE public.agency_entitlements` + `agency_usage_counters`. Seed tenant #1 defaults (all features enabled; counters = 0). |
| A5 | `20260601100400_saas_p1_agency_branding.sql` | `CREATE TABLE public.agency_branding`. Seed tenant #1 default branding. |
| A6 | `20260601100500_saas_p1_agency_talent_roster.sql` | `CREATE TABLE public.agency_talent_roster` with `source_type`, `status`, `agency_visibility`, `hub_visibility_status`. Backfill: rostered talent = every existing talent with `workflow_status = 'approved'` → assigned to tenant #1, `agency_visibility = 'site_visible'`, `hub_visibility_status = 'not_submitted'`, `source_type = 'legacy'`. |
| A7 | `20260601100600_saas_p1_agency_talent_overlays.sql` | `CREATE TABLE public.agency_talent_overlays` — schema only, no initial rows (overlays are agency-created post-launch). |
| A8 | `20260601100700_saas_p1_agency_client_relationships.sql` | `CREATE TABLE public.agency_client_relationships` (per O6 default). Backfill: every row in `client_profiles` gets a tenant #1 overlay row with defaults. |
| A9 | `20260601100800_saas_p1_platform_audit_log.sql` | `CREATE TABLE public.platform_audit_log` (distinct from `activity_log` per L26). |
| A10 | `20260601100900_saas_p1_talent_profiles_provenance.sql` | `ALTER TABLE public.talent_profiles ADD COLUMN created_by_agency_id UUID NULL, created_by_user_id_provenance UUID NULL, source_type TEXT NULL`. Backfill `source_type = 'legacy'` for all existing rows. Do **not** set NOT NULL in Phase 1 (future talent rows will populate; legacy rows stay labeled). |

**Exit criteria A.**
- All new tables exist with PKs, FKs, CHECK constraints.
- Tenant #1 row exists with slug `impronta` + subdomain row.
- `agency_talent_roster` contains one row per approved legacy talent.
- `agency_client_relationships` contains one row per existing client.
- `web/` app builds; M2–M8 flows unchanged.

**Rollback plan.** Each migration is a single transaction; drop new tables + drop new columns in reverse order. No data loss since these are new structures.

---

### Milestone P1.B — Tenantise existing operational tables

**One PR.** Adds `tenant_id UUID` (nullable) → backfill with tenant #1 UUID → `SET NOT NULL` → btree index. Done in strict order per table.

Per Plan §4.5 Migration/Backfill Order + Phase 0 ownership map §3.

| # | File (planned) | Target tables |
|---|---|---|
| B1 | `20260601200000_saas_p1_tenant_id_inquiries.sql` | `inquiries`, `inquiry_participants`, `inquiry_messages`, `inquiry_message_reads`, `inquiry_offers`, `inquiry_offer_line_items`, `inquiry_approvals`, `inquiry_events`, `inquiry_action_log`, `inquiry_requirement_groups`, `inquiry_coordinators` |
| B2 | `20260601200100_saas_p1_tenant_id_bookings.sql` | `agency_bookings`, `booking_talent`, `booking_activity_log`, `failed_engine_effects` |
| B3 | `20260601200200_saas_p1_tenant_id_cms.sql` | `cms_pages`, `cms_posts`, `cms_navigation_items`, `cms_redirects`, `cms_page_revisions`, `cms_post_revisions`, `collections`, `collection_items` |
| B4 | `20260601200300_saas_p1_tenant_id_analytics.sql` | `analytics_events`, `analytics_daily_rollups`, `analytics_funnel_steps`, `analytics_search_sessions`, `analytics_kpi_snapshots`, `analytics_api_cache` |
| B5 | `20260601200400_saas_p1_tenant_id_misc_ops.sql` | `activity_log`, `notifications`, `saved_talent` (nullable for hub-wide), `client_accounts`, `client_account_contacts`, `translation_audit_events`, `ai_search_logs`, `talent_submission_snapshots`, `talent_submission_consents`, `talent_submission_history`, `talent_workflow_events` |
| B6 | `20260601200500_saas_p1_tenant_id_directory.sql` | `directory_filter_panel_items`, `directory_sidebar_layout` |
| B7 | `20260601200600_saas_p1_tenant_id_settings_and_search.sql` | `settings` (nullable — Layer 4 rows stay NULL), `search_queries` (nullable — hub = NULL) |
| B8 | `20260601200700_saas_p1_tenant_id_enforce_not_null.sql` | `ALTER TABLE ... ALTER COLUMN tenant_id SET NOT NULL` for every table above *except* tables where nullable is intentional (`settings`, `search_queries`, `saved_talent`) |
| B9 | `20260601200800_saas_p1_tenant_id_indexes.sql` | `CREATE INDEX CONCURRENTLY` per tenantised table (composite where useful, e.g. `(tenant_id, created_at DESC)` on high-volume tables) |

**Per-table SQL pattern (B1–B7).**

```sql
BEGIN;

ALTER TABLE public.<table>
  ADD COLUMN IF NOT EXISTS tenant_id UUID NULL REFERENCES public.agencies(id);

UPDATE public.<table>
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
 WHERE tenant_id IS NULL;

COMMIT;
```

**NOT NULL enforcement (B8).**

```sql
ALTER TABLE public.<table>
  ALTER COLUMN tenant_id SET NOT NULL;
```

**Index creation (B9).** `CREATE INDEX CONCURRENTLY` outside a transaction to avoid lock escalation on large tables.

**Special cases.**
- `settings` — nullable by design (Layer 4 rows stay NULL per deliverable 4 §4). No SET NOT NULL.
- `search_queries` — nullable by design (hub search rows stay NULL per ownership map §2).
- `saved_talent` — nullable by design (hub-wide saved list). Ownership map §3.
- `booking_talent`, `booking_activity_log` — nullable-then-backfill per inherited parent (`agency_bookings`). Backfill joins parent to derive tenant_id.

**Exit criteria B.**
- Every tenantised table has `tenant_id` set, NOT NULL (except documented exceptions), btree index present.
- `docs/saas/validation-queries.md` completeness queries return 0 rows with `tenant_id IS NULL` for each NOT NULL column.
- `web/` app still builds; M2–M8 flows still pass.
- No RLS policy changed (invariant — Phase 2 work).

**Rollback plan.** Per-milestone: `DROP COLUMN tenant_id CASCADE` on each table. No data loss (tenant #1 is the only value present). Safer alternative: keep the column but don't reference it until Phase 2 — the column is innocuous until RLS uses it.

---

## Validation queries (Phase 1 exit gate)

Extend [../validation-queries.md](../validation-queries.md) with:

1. **Per-table backfill completeness** — for every tenantised table:
   ```sql
   SELECT COUNT(*) FROM public.<table> WHERE tenant_id IS NULL;
   -- expected: 0 (for NOT NULL tables), or documented-nullable cardinality
   ```

2. **Agency table existence**:
   ```sql
   SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public'
     AND tablename IN (
       'agencies','agency_memberships','agency_domains',
       'agency_entitlements','agency_usage_counters','agency_branding',
       'agency_talent_roster','agency_talent_overlays',
       'agency_client_relationships','platform_audit_log'
     );
   -- expected: 10
   ```

3. **Tenant #1 seed**:
   ```sql
   SELECT id, slug, display_name, status FROM public.agencies
    WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
   -- expected: one row, slug='impronta', status='active'
   ```

4. **Domain seed**:
   ```sql
   SELECT agency_id, hostname, kind, is_primary, status
     FROM public.agency_domains
    WHERE agency_id = '00000000-0000-0000-0000-000000000001'::uuid;
   -- expected: at least one row for 'impronta.studiobooking.io' with status='active', is_primary=true
   ```

5. **Provenance backfill on `talent_profiles`**:
   ```sql
   SELECT COUNT(*) FROM public.talent_profiles WHERE source_type IS NULL;
   -- expected: 0 (all existing rows labeled 'legacy')
   ```

6. **Index presence**:
   ```sql
   SELECT tablename, indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname LIKE '%_tenant_id_%'
    ORDER BY tablename;
   -- expected: one index per tenantised table
   ```

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Large table takes long to backfill (e.g. `inquiry_events`) | Backfill in batches if > 100k rows; verify before NOT NULL enforcement |
| Existing FK to a column we're adding to blocks NOT NULL | Check pg_constraint before each SET NOT NULL; error early if found |
| App code crashes on unknown `tenant_id` column during deployment | Column is additive + nullable in Phase 1.B backfill stage; app doesn't reference it yet |
| Seed value for `agency_branding` conflicts with existing hardcoded theme | Seed matches current dashboard theme setting (see `20260408200000_dashboard_theme_setting.sql`) |
| `agency_memberships` owner row FK fails because owner profile doesn't exist | Reference the current super-admin profile; fall back to NULL + flag in audit if absent |

---

## What Phase 1 does NOT do

- No RLS policy updates. Phase 2.
- No `withTenantScope()` helper. Phase 2.
- No tenant resolution middleware. Phase 2 (app-layer guards) + Phase 4 (hostname routing).
- No capability guards. Phase 2.
- No admin UI changes. Phase 3.
- No agency-local fields. Phase 6.
- No hub visibility workflow code. Phase 7.
- No billing enforcement. Phase 8.

Phase 1 is **structural**. The app keeps running against tenant #1 exactly as today.
