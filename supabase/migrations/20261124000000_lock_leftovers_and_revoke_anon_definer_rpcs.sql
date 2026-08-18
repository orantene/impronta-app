-- 20261124000000_lock_leftovers_and_revoke_anon_definer_rpcs.sql
--
-- Two things, one transaction:
--   1. Clear the Critical advisor `rls_disabled_in_public`.
--   2. Close the much larger hole that advisor was sitting next to — SECURITY
--      DEFINER functions with no caller check that `anon` can execute.
--
-- Timestamp note: this repo's migration filenames are a LOCAL SEQUENCE, not
-- wall clock. A `date -u` stamp (2026-08-18) would sort BEFORE the November
-- files and apply out of order. Continue the sequence.
--
-- COLLISION: this file was originally authored as 20261122000000 and renumbered
-- to 20261124000000 before it was ever pushed. Another agent had already pushed
-- version 20261122000000 (`talent_pages_meta_title`) to the remote ledger from a
-- branch whose file is not on origin/main yet. `supabase db push` keys off
-- supabase_migrations.schema_migrations.version, so it would have seen the
-- version present, SKIPPED this migration entirely, and reported success —
-- leaving every revoke below unapplied while `db:check` said everything was fine.
-- Always check the remote ledger, not just the local directory, before pushing:
--   select version, name from supabase_migrations.schema_migrations order by version desc limit 5;
--
--
-- PART 1 — THE CRITICAL ADVISOR
-- ═════════════════════════════
-- `public._impronta_pages_backup_20260817` is a 52-row CMS page snapshot left
-- behind by a manual backup. RLS was never enabled and the default grants were
-- never revoked, so `anon` could SELECT, UPDATE and DELETE every row. Verified
-- live: has_table_privilege('anon', …, 'DELETE') = true.
--
-- No application code references it (`grep -r _impronta_pages_backup web/src
-- supabase` → no hits). We LOCK rather than DROP: the owner wants a
-- confirmation window before the rows go. Dropping is a follow-up ticket.
--
-- The four `_archive_deprecated_field_*` tables are a different case and the
-- distinction matters. They already have RLS ON with ZERO policies, which is a
-- complete API deny — they are NOT "publicly accessible" today, despite still
-- carrying default table grants. Revoking those grants is defense in depth, not
-- remediation. (`_backfill_is_primary_20260805` is deliberately absent from
-- this migration: 20261113000000 already revoked it. Verified live:
-- has_table_privilege('anon', …, 'SELECT') = false. Re-revoking would be a
-- no-op that implies a hole that is not there.)
--
--
-- PART 2 — ANON-EXECUTABLE SECURITY DEFINER FUNCTIONS
-- ═══════════════════════════════════════════════════
-- SECURITY DEFINER runs as the owner and BYPASSES RLS on every table it
-- touches. A SECURITY DEFINER function with no `auth.uid()` / staff check that
-- `anon` may execute is an unauthenticated write into whatever it writes.
--
-- The live database had 79 such functions (parameterised, non-trigger,
-- anon-executable). 46 contained no caller guard at all. This is the same class
-- as 20261120000000 (media predicates) and the same root cause: `CREATE
-- FUNCTION` grants EXECUTE to PUBLIC by default, and PUBLIC is a SEPARATE grant
-- from any role grant. `REVOKE … FROM PUBLIC` is the operative statement —
-- revoking `anon` alone leaves the function reachable through PUBLIC.
--
-- Worst confirmed case, read in full before writing this migration:
--   engine_emit_notification(p_user_id, p_tenant_id, p_title, p_body)
--   → body is four NULL checks and an INSERT INTO public.notifications.
--     No auth.uid(). No tenant check. Anonymous callers could forge a
--     notification to any user in any tenant with arbitrary title and body:
--     an in-app phishing primitive.
--
--
-- WHAT IS DELIBERATELY *NOT* REVOKED (checked first — this would be an outage)
-- ───────────────────────────────────────────────────────────────────────────
-- RLS POLICY PREDICATES. A function called from a USING/WITH CHECK clause is
-- evaluated as the QUERYING role. Revoking EXECUTE from anon/authenticated does
-- not harden the policy — it makes every query against that table fail with
-- "permission denied for function". Live count of policies referencing each:
--
--     is_staff_of_tenant                181 policies
--     is_active_staff_of_tenant          19
--     is_talent_profile_owner             9
--     is_inquiry_coordinator              6
--     talent_is_site_visible_anywhere     4
--     is_booking_coordinator              3
--     talent_profile_has_max              3
--     talent_has_public_roster            1
--
-- Revoking `is_staff_of_tenant` alone would take down 181 tables platform-wide.
-- These KEEP their grants. They are guards, not holes.
--
-- GENUINELY PUBLIC SURFACES, verified to be called with an anon-key client
-- (`createPublicSupabaseClient`) and left untouched:
--     ensure_guest_session, guest_add_saved_talent, guest_list_saved_talent_ids,
--     guest_remove_saved_talent, talent_public_site_for_profile_code,
--     talent_site_domain_lookup, resolve_public_tenant_by_slug,
--     match_talent_embeddings
--
-- INTERNAL CALL CHAINS ARE SAFE. Every function below that is invoked by another
-- function or a trigger was checked: all such callers are themselves SECURITY
-- DEFINER, so the nested call executes as the owner, which always holds EXECUTE.
-- Revoking the API roles cannot break a trigger or an internal helper call.
--
--
-- BUCKET 1 vs BUCKET 2
-- ────────────────────
-- Bucket 1 loses PUBLIC, anon AND authenticated. Every one is either called
-- exclusively through `createServiceRoleClient()` (traced to the terminal
-- caller, not just the importing file) or has no application caller at all.
--
-- Bucket 2 loses PUBLIC and anon but KEEPS authenticated. These have at least
-- one call site that takes a `SupabaseClient` as a parameter, so the role
-- cannot be proven from the file alone. Closing the ANONYMOUS path is the
-- security win and carries no regression risk; revoking `authenticated` on an
-- unproven path could brick a logged-in surface. Same reasoning 20261120000000
-- used to keep `authenticated` on the media read predicates. Tightening bucket
-- 2 further is a follow-up that needs per-caller tracing, not a guess.

BEGIN;

-- ─── PART 1a. The Critical advisor: lock the CMS backup table ───────────────
ALTER TABLE public._impronta_pages_backup_20260817 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._impronta_pages_backup_20260817
  FROM PUBLIC, anon, authenticated;
-- No policies + no grants = deny for every API role. service_role still bypasses.

COMMENT ON TABLE public._impronta_pages_backup_20260817 IS
  'LEFTOVER manual backup (52 CMS page rows, 2026-08-17). RLS on, zero policies, no API grants. No application references it. Scheduled for DROP once the owner confirms the rows are unused.';

-- ─── PART 1b. Archive leftovers: defense in depth (already RLS-denied) ──────
REVOKE ALL ON TABLE public._archive_deprecated_field_defs_20260615
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public._archive_deprecated_field_recs_20260615
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public._archive_deprecated_field_settings_20260615
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public._archive_deprecated_field_values_20260615
  FROM PUBLIC, anon, authenticated;

-- ─── PART 2a. Bucket 1 — service-role-only or no application caller ─────────
-- Writers reached only through createServiceRoleClient(), terminal callers traced:
REVOKE EXECUTE ON FUNCTION public.engine_emit_notification(p_user_id uuid, p_tenant_id uuid, p_title text, p_body text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rotate_unsubscribe_token(p_user_id uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_auth_user_identity_by_email(p_email text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.allocate_media_gallery_sort_order(p_talent_profile_id uuid, p_count integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_offering_stock(p_offering_id uuid, p_qty integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_offering_stock(p_offering_id uuid, p_qty integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_expired_talent_plan_overrides(p_talent_profile_id uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_ai_usage_monthly(p_tenant_id uuid, p_month_key text, p_spend_delta_cents integer)
  FROM PUBLIC, anon, authenticated;

-- No application caller anywhere in web/src; only SECURITY DEFINER internal callers:
REVOKE EXECUTE ON FUNCTION public.bootstrap_agency_taxonomy_defaults(p_tenant_id uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cms_page_revisions_trim(p_tenant_id uuid, p_page_id uuid, p_keep integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cms_section_revisions_trim(p_tenant_id uuid, p_section_id uuid, p_keep integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.engine_emit_event(p_inquiry_id uuid, p_event_type text, p_actor_user_id uuid, p_actor_role inquiry_event_actor_role, p_visibility inquiry_event_visibility, p_payload jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_country(p_iso2 text, p_name_en text, p_name_es text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_talent_height_gender(p_talent_profile_id uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_talent_skill_metrics(p_talent_profile_id uuid, p_taxonomy_term_id uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.review_is_arms_length_paid(p_booking_id uuid, p_talent_profile_id uuid, p_client_user_id uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.talent_recompute_completed_bookings(p_talent_profile_id uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.talent_refresh_publicly_listed(p_ids uuid[])
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.talent_reviews_recompute_summary(p_talent_profile_id uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.talent_compute_publicly_listed(p_talent_profile_id uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pending_exclusivity_prompts_for_talent(p_talent_profile_id uuid)
  FROM PUBLIC, anon, authenticated;

-- set_tenant_context: the GUC setter. Only reference in web/src is the
-- generated database.types.ts — no runtime caller. It is SECURITY INVOKER and
-- uses set_config(…, TRUE) so the GUC is transaction-local and PostgREST gives
-- each request its own transaction; it is therefore NOT exploitable today.
-- Revoked as hygiene so it cannot become the pivot if a GUC-scoped read policy
-- is ever reintroduced.
REVOKE EXECUTE ON FUNCTION public.set_tenant_context(p_tenant_id uuid)
  FROM PUBLIC, anon, authenticated;

-- ─── PART 2b. Bucket 2 — close anon, keep authenticated ────────────────────
REVOKE EXECUTE ON FUNCTION public.engine_send_offer(p_inquiry_id uuid, p_offer_id uuid, p_actor_user_id uuid, p_inquiry_expected_version integer, p_offer_expected_version integer)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.engine_submit_approval(p_inquiry_id uuid, p_offer_id uuid, p_participant_id uuid, p_actor_user_id uuid, p_inquiry_expected_version integer, p_decision text, p_notes text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.engine_emit_system_event(p_inquiry_id uuid, p_event_type text, p_payload jsonb)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.engine_load_commission_context(p_booking_id uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.engine_persist_booking_commission_snapshot(p_booking_id uuid, p_rows jsonb)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.engine_workspace_base_fee_inputs(p_tenant_id uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.engine_inquiry_group_shortfall(p_inquiry_id uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.acceptance_summary_for_offer(p_offer_id uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.lineup_status_summary(p_inquiry_id uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owning_parties_for_inquiry(p_inquiry_id uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_cross_tenant_inquiry(p_inquiry_id uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_queries_fallback_reason_rollup(p_since timestamp with time zone, p_limit integer)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_expired_plan_overrides(p_tenant_id uuid)
  FROM PUBLIC, anon;

-- ─── PART 3. Assertions — db:push must not silently succeed ────────────────
DO $$
DECLARE
  v_bucket1 TEXT[] := ARRAY[
    'public.engine_emit_notification(uuid,uuid,text,text)',
    'public.rotate_unsubscribe_token(uuid)',
    'public.find_auth_user_identity_by_email(text)',
    'public.allocate_media_gallery_sort_order(uuid,integer)',
    'public.release_offering_stock(uuid,integer)',
    'public.reserve_offering_stock(uuid,integer)',
    'public.reconcile_expired_talent_plan_overrides(uuid)',
    'public.increment_ai_usage_monthly(uuid,text,integer)',
    'public.bootstrap_agency_taxonomy_defaults(uuid)',
    'public.cms_page_revisions_trim(uuid,uuid,integer)',
    'public.cms_section_revisions_trim(uuid,uuid,integer)',
    'public.ensure_country(text,text,text)',
    'public.recompute_talent_height_gender(uuid)',
    'public.refresh_talent_skill_metrics(uuid,uuid)',
    'public.review_is_arms_length_paid(uuid,uuid,uuid)',
    'public.talent_recompute_completed_bookings(uuid)',
    'public.talent_refresh_publicly_listed(uuid[])',
    'public.talent_reviews_recompute_summary(uuid)',
    'public.talent_compute_publicly_listed(uuid)',
    'public.pending_exclusivity_prompts_for_talent(uuid)',
    'public.set_tenant_context(uuid)'
  ];
  v_bucket2 TEXT[] := ARRAY[
    'public.engine_emit_system_event(uuid,text,jsonb)',
    'public.engine_load_commission_context(uuid)',
    'public.engine_persist_booking_commission_snapshot(uuid,jsonb)',
    'public.engine_workspace_base_fee_inputs(uuid)',
    'public.engine_inquiry_group_shortfall(uuid)',
    'public.acceptance_summary_for_offer(uuid)',
    'public.lineup_status_summary(uuid)',
    'public.owning_parties_for_inquiry(uuid)',
    'public.is_cross_tenant_inquiry(uuid)',
    'public.reconcile_expired_plan_overrides(uuid)'
  ];
  -- Policy predicates that MUST stay executable. If one of these ever loses its
  -- grant, RLS evaluation fails and the affected tables go dark. Assert loudly.
  v_predicates TEXT[] := ARRAY[
    'public.is_staff_of_tenant(uuid)',
    'public.is_active_staff_of_tenant(uuid)',
    'public.is_talent_profile_owner(uuid)',
    'public.is_inquiry_coordinator(uuid)',
    'public.is_booking_coordinator(uuid)',
    'public.talent_is_site_visible_anywhere(uuid)',
    'public.talent_profile_has_max(uuid)',
    'public.talent_has_public_roster(uuid)'
  ];
  v_fn TEXT;
BEGIN
  -- Table: RLS on AND no anon grant. has_table_privilege reports GRANTS and
  -- ignores RLS entirely, so both halves are required — neither alone proves it.
  IF NOT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public._impronta_pages_backup_20260817'::regclass) THEN
    RAISE EXCEPTION 'assertion failed: RLS not enabled on _impronta_pages_backup_20260817';
  END IF;
  IF has_table_privilege('anon', 'public._impronta_pages_backup_20260817', 'SELECT')
     OR has_table_privilege('anon', 'public._impronta_pages_backup_20260817', 'DELETE') THEN
    RAISE EXCEPTION 'assertion failed: anon still holds grants on _impronta_pages_backup_20260817';
  END IF;

  FOREACH v_fn IN ARRAY v_bucket1 LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'assertion failed: anon can still execute %', v_fn;
    END IF;
    IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'assertion failed: authenticated can still execute %', v_fn;
    END IF;
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'assertion failed: service_role LOST execute on %', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY v_bucket2 LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'assertion failed: anon can still execute %', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'assertion failed: authenticated LOST execute on % (bucket 2 must keep it)', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY v_predicates LOOP
    IF NOT has_function_privilege('anon', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'assertion failed: RLS predicate % lost EXECUTE — policies referencing it will now error', v_fn;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
