-- Security hardening (integ/now-sec-rls), 2026-10-14.
--
-- 1. talent_addon_groups / talent_addon_group_attachments had RLS OFF, so any
--    anon-key client could read and write every talent's shared extras.
--    All app access goes through the service-role client (services-settings-
--    actions.ts, merge-addon-groups.ts, offerings-public.ts, instant-purchase.ts),
--    which bypasses RLS, so owner-only policies change nothing for the app.
--    The public talent site does NOT read these with anon (offerings-public.ts
--    uses createServiceRoleClient), so there is no anon policy on purpose.
--
-- 2. inquiry_offer_line_items_talent_view was SECURITY DEFINER and auto-
--    updatable, so an authenticated talent could UPDATE/DELETE their own line
--    items (talent_cost) through it, bypassing base-table RLS. No app code reads
--    the view (only database.types.ts), so flipping it to invoker blanks no UI.
--    Supersedes the "stays DEFINER" note in 20261125000000.
--
-- 3. REVOKE EXECUTE from PUBLIC, anon, authenticated on SECURITY DEFINER
--    functions with no API-role caller: no .rpc() in web/src, no policy, view or
--    invoker-function reference on prod (checked 2026-10-14). Trigger functions
--    never need EXECUTE to fire. service_role keeps EXECUTE.
--    Pinned by web/src/lib/saas/sec-rls-addon-definer-revoke.static.test.ts.

-- 1 ------------------------------------------------------------------------
ALTER TABLE public.talent_addon_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_addon_group_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_addon_groups_owner_all ON public.talent_addon_groups;
CREATE POLICY talent_addon_groups_owner_all ON public.talent_addon_groups
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.talent_profiles tp
                 WHERE tp.id = talent_addon_groups.talent_profile_id
                   AND tp.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.talent_profiles tp
                 WHERE tp.id = talent_addon_groups.talent_profile_id
                   AND tp.user_id = auth.uid()));

DROP POLICY IF EXISTS talent_addon_group_attachments_owner_all ON public.talent_addon_group_attachments;
CREATE POLICY talent_addon_group_attachments_owner_all ON public.talent_addon_group_attachments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.talent_addon_groups g
                 JOIN public.talent_profiles tp ON tp.id = g.talent_profile_id
                 WHERE g.id = talent_addon_group_attachments.addon_group_id
                   AND tp.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.talent_addon_groups g
                 JOIN public.talent_profiles tp ON tp.id = g.talent_profile_id
                 JOIN public.talent_offerings o ON o.id = talent_addon_group_attachments.offering_id
                                              AND o.talent_profile_id = g.talent_profile_id
                 WHERE g.id = talent_addon_group_attachments.addon_group_id
                   AND tp.user_id = auth.uid()));

-- 2 ------------------------------------------------------------------------
ALTER VIEW public.inquiry_offer_line_items_talent_view SET (security_invoker = true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.inquiry_offer_line_items_talent_view FROM anon, authenticated;

-- 3 ------------------------------------------------------------------------
DO $$
DECLARE
  fn text;
  r record;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'archive_inquiries_for_user',
    'bootstrap_profile_from_auth_email',
    'current_user_tenant_ids',
    'engine_caller_may_write_tenant_finances',
    'engine_cancel_inquiry',
    'inquiry_approval_summary',
    'media_grant_active',
    'pos_touch_device_session',
    'submit_own_talent_profile_for_review',
    'talent_onboarding_existing_profile',
    'talent_soft_delete_own_media',
    'toggle_inquiry_manual_unread',
    'toggle_inquiry_pin',
    '_agency_taxonomy_settings_after_agency',
    '_sync_location_taxonomy_terms_trigger',
    'agencies_propagate_slug_to_domains',
    'agency_bookings_recompute_completed_bookings',
    'agency_domains_sync_tenant_slug',
    'booking_talent_recompute_completed_bookings',
    'ensure_talent_in_platform_hub',
    'guard_order_not_overcollected',
    'guard_profile_self_update',
    'handle_new_user',
    'inquiries_sync_coordinator_table',
    'inquiry_coordinators_sync_inquiry',
    'invalidate_talent_embedding_on_field_values_change',
    'invalidate_talent_embedding_on_profile_change',
    'invalidate_talent_embedding_on_taxonomy_change',
    'sync_agency_domain_slug',
    'sync_gender_presenting_label',
    'sync_location_country_defaults',
    'sync_talent_profile_canonical_locations',
    'talent_representation_requests_effectuate',
    'talent_reviews_recompute_trigger',
    'talent_reviews_verify_on_insert',
    'tpfv_record_history',
    'trg_agencies_publicly_listed',
    'trg_refresh_skill_metrics_for_booking',
    'trg_refresh_skill_metrics_for_booking_talent',
    'trg_roster_publicly_listed',
    'trg_sync_talent_height_gender',
    'trg_talent_profiles_publicly_listed'
  ] LOOP
    FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = fn AND p.prosecdef LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
      IF has_function_privilege('anon', r.sig, 'EXECUTE')
         OR has_function_privilege('authenticated', r.sig, 'EXECUTE') THEN
        RAISE EXCEPTION 'assertion failed: % still executable by an API role', r.sig;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.talent_addon_groups'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.talent_addon_group_attachments'::regclass) THEN
    RAISE EXCEPTION 'assertion failed: addon group RLS not enabled';
  END IF;
END $$;
