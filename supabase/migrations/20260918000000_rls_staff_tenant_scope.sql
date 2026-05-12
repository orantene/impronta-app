-- ============================================================================
-- RLS Staff Tenant-Scope Hardening — 2026-05-12
-- ============================================================================
--
-- WHY
-- ───
-- Several RLS policies on tables that DO carry a `tenant_id` column still
-- evaluate `public.is_agency_staff()` (the legacy "any agency_staff or
-- super_admin" predicate) without scoping to the caller's tenant. The
-- effect is a cross-tenant data leak: a staff member of tenant A can
-- SELECT / INSERT / UPDATE / DELETE rows on tenant B's data via every
-- policy listed below.
--
-- `public.is_staff_of_tenant(uuid)` (migration 20260602100000) consults
-- agency_memberships to confirm the caller is staff of the SPECIFIC tenant
-- the row belongs to. Platform super_admins still bypass via the
-- `is_platform_admin()` short-circuit baked into is_staff_of_tenant().
--
-- Multi-policy interaction note: PostgreSQL combines per-command RLS
-- policies with OR. A tenant-scoped FOR ALL policy (e.g. `inquiries_tenant_
-- staff`) does NOT mitigate a sibling FOR SELECT policy whose USING clause
-- says "client = me OR is_agency_staff()" — the SELECT policy alone grants
-- read on every tenant's rows. This migration removes / rewrites every
-- such sibling.
--
-- WHAT
-- ────
-- Rewrites the vulnerable policies on every tenanted public.* table. Group
-- 1 covers tables created AFTER the Phase 2 tenant-scope swap (P2.2 at
-- 20260602100100). Group 2 covers tables created BEFORE P2.2 whose
-- sibling FOR-SELECT or per-command policies were not part of the swap
-- array, plus tables where P2.2 added a tenant-scoped FOR ALL but the
-- original FOR SELECT predicate still grants cross-tenant reads.
--
-- Group 1 — post-P2.2 leaks (created after 20260602100100):
--   • analytics_events                  (select)
--   • cms_section_comments              (all)
--   • talent_service_areas              (select + write)
--   • talent_languages                  (select + write)
--   • workspace_profile_field_settings  (select + write)
--   • talent_profile_field_values       (select + write)
--   • stripe_customers                  (select)
--   • workspace_subscriptions           (select)
--   • talent_subscriptions              (select via roster path)
--
-- Group 2 — pre-P2.2 leaks (table tenantised in Phase 1; legacy SELECT/
-- non-staff-only policies missed by the P2.2 swap):
--   • inquiries                         (inquiries_select_own — was
--                                        "client = me OR ANY staff")
--   • collections                       (collections_select — was
--                                        "archived_at IS NULL OR ANY staff")
--   • collection_items                  (collection_items_select — same)
--   • saved_talent                      (select_own + delete_own — was
--                                        "client = me OR ANY staff")
--   • media_assets                      (media_select complex EXISTS, plus
--                                        media_write_staff — both used
--                                        ANY-staff)
--   • search_queries                    (search_queries_select_staff)
--   • settings                          (settings_staff)
--   • translation_audit_events          (translation_audit_service_insert
--                                        WITH CHECK only)
--   • talent_profile_taxonomy           (talent_taxonomy_select + write)
--   • ai_provider_instances             (all)
--   • ai_tenant_controls                (all)
--   • ai_usage_monthly                  (all)
--   • ai_provider_audit                 (select + insert)
--
-- Tables INTENTIONALLY NOT TOUCHED — no tenant_id column. These remain on
-- is_agency_staff(). They are flagged for a separate follow-up to tighten
-- staff-write to is_platform_admin() where the intent is "platform staff
-- only":
--   • profile_field_definitions     (global catalog)
--   • profile_field_recommendations (global catalog)
--   • talent_skill_metrics          (booking aggregate, no tenant_id)
--   • taxonomy_terms, locations, countries, app_locales
--   • profiles, client_profiles, talent_profiles, profile_revisions
--   • saved_talent / collections / collection_items: tenanted (fixed here)
--   • settings, staff_permissions, field_values, talent_embeddings,
--     guest_sessions
--
-- IDEMPOTENCY: every change is DROP POLICY IF EXISTS + CREATE POLICY. A
-- final DO block sweeps pg_policies and raises if ANY public.* policy whose
-- target table has a `tenant_id` column still calls is_agency_staff().
-- The check is structural (table column → must use is_staff_of_tenant) so
-- the assertion stays useful as new tables land — no manual allow-list.
--
-- ============================================================================

BEGIN;

-- ─── dependency assertion ─────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.is_staff_of_tenant(uuid)') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42883',
      MESSAGE = 'Missing dependency: public.is_staff_of_tenant(uuid)',
      HINT = 'Apply 20260602100000_saas_p2_tenant_helpers.sql before this migration.';
  END IF;
END$$;

-- ════════════════════════════════════════════════════════════════════════════
-- GROUP 1 — Post-P2.2 tables (created after the broad swap)
-- ════════════════════════════════════════════════════════════════════════════

-- 1. analytics_events ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.analytics_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS analytics_events_select_staff ON public.analytics_events;
    CREATE POLICY analytics_events_select_staff ON public.analytics_events
      FOR SELECT
      USING (public.is_staff_of_tenant(tenant_id));
  END IF;
END$$;

-- 2. cms_section_comments ────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.cms_section_comments') IS NOT NULL THEN
    DROP POLICY IF EXISTS cms_section_comments_staff_all ON public.cms_section_comments;
    CREATE POLICY cms_section_comments_staff_all ON public.cms_section_comments
      FOR ALL
      USING       (public.is_staff_of_tenant(tenant_id))
      WITH CHECK  (public.is_staff_of_tenant(tenant_id));
  END IF;
END$$;

-- 3. talent_service_areas ────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.talent_service_areas') IS NOT NULL THEN
    DROP POLICY IF EXISTS talent_service_areas_select_staff ON public.talent_service_areas;
    CREATE POLICY talent_service_areas_select_staff ON public.talent_service_areas
      FOR SELECT
      USING (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id));

    DROP POLICY IF EXISTS talent_service_areas_write_own_or_staff ON public.talent_service_areas;
    CREATE POLICY talent_service_areas_write_own_or_staff ON public.talent_service_areas
      FOR ALL
      USING (
        (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
        OR EXISTS (
          SELECT 1 FROM public.talent_profiles tp
           WHERE tp.id = talent_service_areas.talent_profile_id
             AND tp.user_id = auth.uid()
        )
      )
      WITH CHECK (
        (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
        OR EXISTS (
          SELECT 1 FROM public.talent_profiles tp
           WHERE tp.id = talent_service_areas.talent_profile_id
             AND tp.user_id = auth.uid()
        )
      );
  END IF;
END$$;

-- 4. talent_languages ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.talent_languages') IS NOT NULL THEN
    DROP POLICY IF EXISTS talent_languages_select_staff ON public.talent_languages;
    CREATE POLICY talent_languages_select_staff ON public.talent_languages
      FOR SELECT
      USING (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id));

    DROP POLICY IF EXISTS talent_languages_write_own_or_staff ON public.talent_languages;
    CREATE POLICY talent_languages_write_own_or_staff ON public.talent_languages
      FOR ALL
      USING (
        (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
        OR EXISTS (
          SELECT 1 FROM public.talent_profiles tp
           WHERE tp.id = talent_languages.talent_profile_id
             AND tp.user_id = auth.uid()
        )
      )
      WITH CHECK (
        (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
        OR EXISTS (
          SELECT 1 FROM public.talent_profiles tp
           WHERE tp.id = talent_languages.talent_profile_id
             AND tp.user_id = auth.uid()
        )
      );
  END IF;
END$$;

-- 5. workspace_profile_field_settings ────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.workspace_profile_field_settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS wpfs_select_tenant_or_platform ON public.workspace_profile_field_settings;
    CREATE POLICY wpfs_select_tenant_or_platform ON public.workspace_profile_field_settings
      FOR SELECT
      USING (public.is_staff_of_tenant(tenant_id));

    DROP POLICY IF EXISTS wpfs_write_tenant_or_platform ON public.workspace_profile_field_settings;
    CREATE POLICY wpfs_write_tenant_or_platform ON public.workspace_profile_field_settings
      FOR ALL
      USING       (public.is_staff_of_tenant(tenant_id))
      WITH CHECK  (public.is_staff_of_tenant(tenant_id));
  END IF;
END$$;

-- 6. talent_profile_field_values ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.talent_profile_field_values') IS NOT NULL THEN
    DROP POLICY IF EXISTS tpfv_select_staff ON public.talent_profile_field_values;
    CREATE POLICY tpfv_select_staff ON public.talent_profile_field_values
      FOR SELECT
      USING (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id));

    DROP POLICY IF EXISTS tpfv_write_own_or_staff ON public.talent_profile_field_values;
    CREATE POLICY tpfv_write_own_or_staff ON public.talent_profile_field_values
      FOR ALL
      USING (
        (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
        OR EXISTS (
          SELECT 1 FROM public.talent_profiles tp
           WHERE tp.id = talent_profile_field_values.talent_profile_id
             AND tp.user_id = auth.uid()
        )
      )
      WITH CHECK (
        (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
        OR EXISTS (
          SELECT 1 FROM public.talent_profiles tp
           WHERE tp.id = talent_profile_field_values.talent_profile_id
             AND tp.user_id = auth.uid()
        )
      );
  END IF;
END$$;

-- 7. stripe_customers ────────────────────────────────────────────────────────
-- CRITICAL: prior policy leaked billing email + Stripe customer ID across
-- every tenant.
DO $$
BEGIN
  IF to_regclass('public.stripe_customers') IS NOT NULL THEN
    DROP POLICY IF EXISTS stripe_customers_staff_read ON public.stripe_customers;
    CREATE POLICY stripe_customers_staff_read ON public.stripe_customers
      FOR SELECT
      USING (public.is_staff_of_tenant(tenant_id));
  END IF;
END$$;

-- 8. workspace_subscriptions ─────────────────────────────────────────────────
-- CRITICAL: prior policy leaked subscription plan, status, period, Stripe
-- IDs across every tenant.
DO $$
BEGIN
  IF to_regclass('public.workspace_subscriptions') IS NOT NULL THEN
    DROP POLICY IF EXISTS workspace_subscriptions_staff_read ON public.workspace_subscriptions;
    CREATE POLICY workspace_subscriptions_staff_read ON public.workspace_subscriptions
      FOR SELECT
      USING (public.is_staff_of_tenant(tenant_id));
  END IF;
END$$;

-- 9. talent_subscriptions ────────────────────────────────────────────────────
-- talent_subscriptions has no tenant_id directly; the staff path goes
-- through agency_talent_roster. Prior policy gated the EXISTS on
-- is_agency_staff() (scope-free) — fix is to scope to the roster row's
-- tenant via is_staff_of_tenant(atr.tenant_id).
DO $$
BEGIN
  IF to_regclass('public.talent_subscriptions') IS NOT NULL THEN
    DROP POLICY IF EXISTS talent_subscriptions_staff_read ON public.talent_subscriptions;
    CREATE POLICY talent_subscriptions_staff_read ON public.talent_subscriptions
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.agency_talent_roster atr
          WHERE atr.talent_profile_id = talent_subscriptions.talent_profile_id
            AND public.is_staff_of_tenant(atr.tenant_id)
        )
      );
  END IF;
END$$;

-- ════════════════════════════════════════════════════════════════════════════
-- GROUP 2 — Pre-P2.2 tables (tenantised in Phase 1; missed by P2.2 swap)
-- ════════════════════════════════════════════════════════════════════════════

-- 10. inquiries (inquiries_select_own) ───────────────────────────────────────
-- The FOR ALL `inquiries_tenant_staff` policy added by P2.2 already gives
-- correct tenant-scoped staff access. The legacy `inquiries_select_own`
-- read policy had `client_user_id = auth.uid() OR is_agency_staff()` — the
-- second arm gives staff cross-tenant read by OR-combining with
-- inquiries_tenant_staff. Drop the staff arm; staff path is
-- inquiries_tenant_staff.
DO $$
BEGIN
  IF to_regclass('public.inquiries') IS NOT NULL THEN
    DROP POLICY IF EXISTS inquiries_select_own ON public.inquiries;
    CREATE POLICY inquiries_select_own ON public.inquiries
      FOR SELECT
      USING (client_user_id = auth.uid());
  END IF;
END$$;

-- 11. collections / collection_items ─────────────────────────────────────────
-- The legacy *_select policies allow public-ish read of non-archived rows
-- and grant `is_agency_staff()` access to archived rows. Replace the staff
-- arm with `is_staff_of_tenant(tenant_id)` so archived-read is tenant-
-- scoped. The FOR ALL `*_tenant_staff` policies remain unchanged.
DO $$
BEGIN
  IF to_regclass('public.collections') IS NOT NULL THEN
    DROP POLICY IF EXISTS collections_select ON public.collections;
    CREATE POLICY collections_select ON public.collections
      FOR SELECT
      USING (archived_at IS NULL OR public.is_staff_of_tenant(tenant_id));
  END IF;

  IF to_regclass('public.collection_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS collection_items_select ON public.collection_items;
    CREATE POLICY collection_items_select ON public.collection_items
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.collections c
           WHERE c.id = collection_items.collection_id
             AND (c.archived_at IS NULL OR public.is_staff_of_tenant(c.tenant_id))
        )
      );
  END IF;
END$$;

-- 12. saved_talent ───────────────────────────────────────────────────────────
-- saved_talent.tenant_id is nullable by design (hub-wide saves leave it
-- NULL; per 20260601200400). Legitimate reads: the client who saved the
-- row, OR staff of the row's tenant. Cross-tenant staff read is the leak.
DO $$
BEGIN
  IF to_regclass('public.saved_talent') IS NOT NULL THEN
    DROP POLICY IF EXISTS saved_select_own ON public.saved_talent;
    CREATE POLICY saved_select_own ON public.saved_talent
      FOR SELECT
      USING (
        client_user_id = auth.uid()
        OR (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
      );

    DROP POLICY IF EXISTS saved_delete_own ON public.saved_talent;
    CREATE POLICY saved_delete_own ON public.saved_talent
      FOR DELETE
      USING (
        client_user_id = auth.uid()
        OR (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
      );
  END IF;
END$$;

-- 13. media_assets ───────────────────────────────────────────────────────────
-- `media_assets_tenant_staff_all` (FOR ALL) already covers non-talent media
-- with proper tenant scope. `media_write_staff` and `media_select` still
-- use bare is_agency_staff() — the former gives cross-tenant write on
-- talent media, the latter gives cross-tenant read on every asset.
-- After Phase 5 M0, every media_assets row has tenant_id NOT NULL.
DO $$
BEGIN
  IF to_regclass('public.media_assets') IS NOT NULL THEN
    DROP POLICY IF EXISTS media_select ON public.media_assets;
    CREATE POLICY media_select ON public.media_assets
      FOR SELECT
      USING (
        deleted_at IS NULL
        AND (
          public.is_staff_of_tenant(tenant_id)
          OR EXISTS (
            SELECT 1 FROM public.talent_profiles t
             WHERE t.id = media_assets.owner_talent_profile_id
               AND t.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.talent_profiles t
             WHERE t.id = media_assets.owner_talent_profile_id
               AND t.workflow_status = 'approved'::profile_workflow_status
               AND t.visibility = 'public'::visibility
               AND media_assets.approval_state = 'approved'::media_approval_state
               AND media_assets.variant_kind <> 'original'::media_variant_kind
          )
        )
      );

    DROP POLICY IF EXISTS media_write_staff ON public.media_assets;
    CREATE POLICY media_write_staff ON public.media_assets
      FOR ALL
      USING       (public.is_staff_of_tenant(tenant_id))
      WITH CHECK  (public.is_staff_of_tenant(tenant_id));
  END IF;
END$$;

-- 14. search_queries ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.search_queries') IS NOT NULL THEN
    DROP POLICY IF EXISTS search_queries_select_staff ON public.search_queries;
    CREATE POLICY search_queries_select_staff ON public.search_queries
      FOR SELECT
      USING (public.is_staff_of_tenant(tenant_id));
  END IF;
END$$;

-- 15. settings ───────────────────────────────────────────────────────────────
-- settings has tenant_id (added in Phase 1 settings backfill). The legacy
-- `settings_staff` FOR ALL policy with bare is_agency_staff() lets any
-- staff edit any tenant's settings. `settings_public_select_frontend`
-- (anon-readable subset) is unchanged.
DO $$
BEGIN
  IF to_regclass('public.settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS settings_staff ON public.settings;
    CREATE POLICY settings_staff ON public.settings
      FOR ALL
      USING       (public.is_staff_of_tenant(tenant_id))
      WITH CHECK  (public.is_staff_of_tenant(tenant_id));
  END IF;
END$$;

-- 16. translation_audit_events ───────────────────────────────────────────────
-- The legacy `translation_audit_service_insert` is an INSERT policy with
-- WITH CHECK = is_agency_staff(). service_role bypasses RLS anyway so the
-- policy is decorative for service-role writes; but authenticated agency
-- staff hit the WITH CHECK and could insert rows for any tenant. Scope to
-- the row's tenant.
DO $$
BEGIN
  IF to_regclass('public.translation_audit_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS translation_audit_service_insert ON public.translation_audit_events;
    CREATE POLICY translation_audit_service_insert ON public.translation_audit_events
      FOR INSERT
      WITH CHECK (public.is_staff_of_tenant(tenant_id));
  END IF;
END$$;

-- 17. talent_profile_taxonomy ────────────────────────────────────────────────
-- `tpt_agency_roster_all` (FOR ALL) and `tpt_talent_self_*` cover the
-- correct paths via roster + self. The legacy `talent_taxonomy_select`
-- combined "approved+public" public-read with `OR is_agency_staff()` — the
-- staff arm is the cross-tenant leak. `talent_taxonomy_write_staff` is
-- pure bare staff and is a leak by itself.
-- Strategy: keep the public-read predicate intact, switch the staff arm
-- to `is_staff_of_tenant(t.tenant_id)` via talent_profiles.tenant_id (if
-- present) else via the roster join; drop the standalone write policy.
DO $$
DECLARE
  v_has_tp_tenant_id BOOLEAN;
BEGIN
  IF to_regclass('public.talent_profile_taxonomy') IS NULL THEN
    RETURN;
  END IF;

  -- Determine whether talent_profiles has a tenant_id column we can join on.
  SELECT EXISTS (
    SELECT 1 FROM pg_attribute a
     WHERE a.attrelid = 'public.talent_profiles'::regclass
       AND a.attname  = 'tenant_id'
       AND a.attnum   > 0
       AND NOT a.attisdropped
  ) INTO v_has_tp_tenant_id;

  -- Drop the standalone broad staff write policy. `tpt_agency_roster_all`
  -- already provides correctly-scoped staff write via the roster join.
  DROP POLICY IF EXISTS talent_taxonomy_write_staff ON public.talent_profile_taxonomy;

  -- Rewrite the public-read policy. Staff path now goes through the
  -- (talent_profile_id, tenant_id) lookup on agency_talent_roster:
  -- the talent has at least one active roster row in a tenant the caller
  -- is staff of.
  DROP POLICY IF EXISTS talent_taxonomy_select ON public.talent_profile_taxonomy;
  CREATE POLICY talent_taxonomy_select ON public.talent_profile_taxonomy
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.talent_profiles t
         WHERE t.id = talent_profile_taxonomy.talent_profile_id
           AND t.deleted_at IS NULL
           AND (
                (t.workflow_status = 'approved'::profile_workflow_status
                 AND t.visibility   = 'public'::visibility)
             OR t.user_id = auth.uid()
             OR EXISTS (
                  SELECT 1 FROM public.agency_talent_roster atr
                   WHERE atr.talent_profile_id = t.id
                     AND public.is_staff_of_tenant(atr.tenant_id)
                )
           )
      )
    );
END$$;

-- ════════════════════════════════════════════════════════════════════════════
-- GROUP 3 — AI tables (created pre-P2.2; not in P2.2 swap array)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.ai_provider_instances') IS NOT NULL THEN
    DROP POLICY IF EXISTS ai_provider_instances_staff ON public.ai_provider_instances;
    CREATE POLICY ai_provider_instances_staff ON public.ai_provider_instances
      FOR ALL
      TO authenticated
      USING       (public.is_staff_of_tenant(tenant_id))
      WITH CHECK  (public.is_staff_of_tenant(tenant_id));
  END IF;

  IF to_regclass('public.ai_tenant_controls') IS NOT NULL THEN
    DROP POLICY IF EXISTS ai_tenant_controls_staff ON public.ai_tenant_controls;
    CREATE POLICY ai_tenant_controls_staff ON public.ai_tenant_controls
      FOR ALL
      TO authenticated
      USING       (public.is_staff_of_tenant(tenant_id))
      WITH CHECK  (public.is_staff_of_tenant(tenant_id));
  END IF;

  IF to_regclass('public.ai_usage_monthly') IS NOT NULL THEN
    DROP POLICY IF EXISTS ai_usage_monthly_staff ON public.ai_usage_monthly;
    CREATE POLICY ai_usage_monthly_staff ON public.ai_usage_monthly
      FOR ALL
      TO authenticated
      USING       (public.is_staff_of_tenant(tenant_id))
      WITH CHECK  (public.is_staff_of_tenant(tenant_id));
  END IF;

  IF to_regclass('public.ai_provider_audit') IS NOT NULL THEN
    DROP POLICY IF EXISTS ai_provider_audit_select_staff ON public.ai_provider_audit;
    CREATE POLICY ai_provider_audit_select_staff ON public.ai_provider_audit
      FOR SELECT
      TO authenticated
      USING (public.is_staff_of_tenant(tenant_id));

    DROP POLICY IF EXISTS ai_provider_audit_insert_staff ON public.ai_provider_audit;
    CREATE POLICY ai_provider_audit_insert_staff ON public.ai_provider_audit
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_staff_of_tenant(tenant_id));
  END IF;
END$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Final assertion — fail the migration if ANY public.* policy whose target
-- table carries a `tenant_id` column still references `is_agency_staff(`
-- inside its USING or WITH CHECK expression. The check is structural so it
-- stays useful as new tables land — no manual allow-list to maintain.
--
-- Tables WITHOUT tenant_id keep their existing is_agency_staff() usage
-- (intentional, separate follow-up). Examples: profile_field_definitions,
-- profile_field_recommendations, talent_skill_metrics, taxonomy_terms,
-- locations, countries, profiles, talent_profiles, settings (no — settings
-- DOES have tenant_id; covered above), etc.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_offender RECORD;
  v_count    INT := 0;
BEGIN
  FOR v_offender IN
    SELECT n.nspname AS schema_name,
           c.relname AS table_name,
           p.polname AS policy_name,
           pg_get_expr(p.polqual, p.polrelid)       AS using_expr,
           pg_get_expr(p.polwithcheck, p.polrelid)  AS withcheck_expr
      FROM pg_policy p
      JOIN pg_class      c ON c.oid = p.polrelid
      JOIN pg_namespace  n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND (
            pg_get_expr(p.polqual, p.polrelid)       LIKE '%is_agency_staff(%'
         OR pg_get_expr(p.polwithcheck, p.polrelid)  LIKE '%is_agency_staff(%'
       )
       AND EXISTS (
         SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = c.oid
            AND a.attname  = 'tenant_id'
            AND a.attnum   > 0
            AND NOT a.attisdropped
       )
  LOOP
    v_count := v_count + 1;
    RAISE WARNING
      'rls_staff_tenant_scope: policy % on %.% (has tenant_id) still references is_agency_staff() — using=%, withcheck=%',
      v_offender.policy_name, v_offender.schema_name, v_offender.table_name,
      v_offender.using_expr, v_offender.withcheck_expr;
  END LOOP;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'rls_staff_tenant_scope: % tenanted-table policy(ies) still reference is_agency_staff(). See WARNING messages above. Switch each to is_staff_of_tenant(tenant_id) (or a tenant-aware EXISTS subquery for tables that obtain tenant via a parent row).',
      v_count;
  END IF;

  RAISE NOTICE 'rls_staff_tenant_scope: every public.* table with tenant_id is free of is_agency_staff() in its policies.';
END$$;

COMMIT;
