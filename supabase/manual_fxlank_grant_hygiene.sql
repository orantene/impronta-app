-- TUL-514 — fxlank-only SECURITY DEFINER grant hygiene
--
-- Target project ref: fxlankepwnvelxjrahwk (isolated / qa-journeys).
-- NEVER run on production. Not a ledger migration — do not `db:push`.
-- Apply via Supabase SQL Editor (or an isolated repair path) on fxlank only.
-- PM applies; Cursor agents do not db:push this file.
--
-- Production already closed anon EXECUTE on these names via:
--   20260906031100_integration_grants_and_definer_rpc_hygiene.sql
--   20261120000000_media_predicates_revoke_public.sql
--   20261124000000_lock_leftovers_and_revoke_anon_definer_rpcs.sql
-- Those migrations also touch leftover tables that may be missing on fxlank,
-- so this script extracts only the function REVOKEs/GRANTs and looks each
-- name up in pg_proc — missing functions are skipped (no error).

DO $$
DECLARE
  v_names text[] := ARRAY[
    'acceptance_summary_for_offer',
    'allocate_media_gallery_sort_order',
    'cms_page_revisions_trim',
    'cms_section_revisions_trim',
    'engine_emit_event',
    'engine_emit_notification',
    'engine_emit_system_event',
    'engine_inquiry_group_shortfall',
    'engine_load_commission_context',
    'engine_send_offer',
    'engine_submit_approval',
    'engine_workspace_base_fee_inputs',
    'ensure_country',
    'find_auth_user_identity_by_email',
    'generate_profile_code',
    'guest_submit_inquiry',
    'increment_ai_usage_monthly',
    'is_cross_tenant_inquiry',
    'lineup_status_summary',
    'list_table_columns',
    'match_talent_embeddings',
    'media_asset_presentable_on_tenant',
    'media_assets_presentable_on_tenant',
    'media_assets_watermark_required_on_tenant',
    'media_grant_active',
    'owning_parties_for_inquiry',
    'pending_exclusivity_prompts_for_talent',
    'recompute_talent_height_gender',
    'reconcile_expired_plan_overrides',
    'reconcile_expired_talent_plan_overrides',
    'record_media_release_bake_failures',
    'refresh_talent_discover_index',
    'refresh_talent_skill_metrics',
    'refresh_talent_skill_metrics_all',
    'review_is_arms_length_paid',
    'rotate_unsubscribe_token',
    'search_queries_fallback_reason_rollup',
    'sync_location_taxonomy_terms',
    'talent_compute_publicly_listed',
    'talent_recompute_completed_bookings',
    'talent_refresh_publicly_listed',
    'talent_reviews_recompute_summary',
    'tr_sync_location_taxonomy_terms',
    'usage_audit_metrics'
  ];
  v_name text;
  v_oid oid;
  v_reg regprocedure;
  v_touched int := 0;
BEGIN
  IF cardinality(v_names) <> 44 THEN
    RAISE EXCEPTION 'TUL-514 expected 44 function names, got %', cardinality(v_names);
  END IF;

  FOREACH v_name IN ARRAY v_names LOOP
    FOR v_oid IN
      SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = v_name
    LOOP
      v_reg := v_oid::regprocedure;
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
        v_reg
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO service_role',
        v_reg
      );
      v_touched := v_touched + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'TUL-514 fxlank grant hygiene: revoked/granted % function overload(s)', v_touched;
END $$;

-- Verification: any of the 44 still executable by anon? Empty result = pass.
SELECT
  format(
    '%s(%s)',
    p.proname,
    pg_get_function_identity_arguments(p.oid)
  ) AS still_anon_executable
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = ANY (ARRAY[
    'acceptance_summary_for_offer',
    'allocate_media_gallery_sort_order',
    'cms_page_revisions_trim',
    'cms_section_revisions_trim',
    'engine_emit_event',
    'engine_emit_notification',
    'engine_emit_system_event',
    'engine_inquiry_group_shortfall',
    'engine_load_commission_context',
    'engine_send_offer',
    'engine_submit_approval',
    'engine_workspace_base_fee_inputs',
    'ensure_country',
    'find_auth_user_identity_by_email',
    'generate_profile_code',
    'guest_submit_inquiry',
    'increment_ai_usage_monthly',
    'is_cross_tenant_inquiry',
    'lineup_status_summary',
    'list_table_columns',
    'match_talent_embeddings',
    'media_asset_presentable_on_tenant',
    'media_assets_presentable_on_tenant',
    'media_assets_watermark_required_on_tenant',
    'media_grant_active',
    'owning_parties_for_inquiry',
    'pending_exclusivity_prompts_for_talent',
    'recompute_talent_height_gender',
    'reconcile_expired_plan_overrides',
    'reconcile_expired_talent_plan_overrides',
    'record_media_release_bake_failures',
    'refresh_talent_discover_index',
    'refresh_talent_skill_metrics',
    'refresh_talent_skill_metrics_all',
    'review_is_arms_length_paid',
    'rotate_unsubscribe_token',
    'search_queries_fallback_reason_rollup',
    'sync_location_taxonomy_terms',
    'talent_compute_publicly_listed',
    'talent_recompute_completed_bookings',
    'talent_refresh_publicly_listed',
    'talent_reviews_recompute_summary',
    'tr_sync_location_taxonomy_terms',
    'usage_audit_metrics'
  ])
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY 1;
