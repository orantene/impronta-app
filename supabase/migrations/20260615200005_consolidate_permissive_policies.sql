-- 20260615200005_consolidate_permissive_policies.sql
-- Workstream A3: consolidate redundant PERMISSIVE RLS policies (perf advisor: multiple_permissive_policies).
--
-- For each (table, command, role-set) group with >1 PERMISSIVE policy, PostgreSQL OR's the
-- USING clauses (and OR's the WITH CHECK clauses). Replacing N same-command/same-role PERMISSIVE
-- policies with ONE policy whose USING = (u1) OR (u2) OR ... and WITH CHECK = (c1) OR (c2) OR ...
-- is SEMANTICALLY IDENTICAL for permissive policies. This reduces per-row policy evaluation count.
--
-- SAFETY ESTABLISHED BEFORE WRITING THIS MIGRATION:
--   * The database contains ZERO restrictive policies (verified) — no AND-combination semantics exist
--     anywhere, so there is no risk of an OR-merge altering a restrictive interaction.
--   * Only policies sharing the EXACT same command (polcmd) AND the EXACT same polroles OID array are
--     merged. ALL(*) policies are NEVER merged with command-specific policies (that would change
--     INSERT/UPDATE/DELETE semantics). Verified: every merged group has a single distinct polroles array.
--   * Each group is uniform in USING/WITH-CHECK presence (all members have a WITH CHECK or none do),
--     so the OR-combination reproduces the original effective predicate exactly.
--
-- SCOPE: 57 groups consolidated (139 policies → 57). 1 group SKIPPED for safety:
--   storage.objects FOR UPDATE (authenticated) — MIXED WITH CHECK (2 of 4 members omit WITH CHECK, so
--   their effective check defaults to their USING; combining that correctly is ambiguous → left untouched).
--
-- Merged policy expressions below are reproduced VERBATIM from pg_get_expr() of the live policies,
-- combined only with top-level OR and parentheses. No predicate text was hand-edited.

BEGIN;
-- ── public.agency_talent_roster  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "agency_talent_roster_public_site_visible" ON "public"."agency_talent_roster";
DROP POLICY IF EXISTS "agency_talent_roster_talent_self_read" ON "public"."agency_talent_roster";
CREATE POLICY "agency_talent_roster_merged_select_public" ON "public"."agency_talent_roster"
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((((status = 'active'::text) AND (agency_visibility = ANY (ARRAY['site_visible'::text, 'featured'::text])) AND (talent_site_hidden = false))) OR ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = agency_talent_roster.talent_profile_id) AND (tp.user_id = auth.uid()))))));

-- ── public.booking_commission_snapshot  FOR SELECT  roles=[authenticated]  (2 → 1) ──
DROP POLICY IF EXISTS "booking_commission_snapshot_coordinator_select" ON "public"."booking_commission_snapshot";
DROP POLICY IF EXISTS "booking_commission_snapshot_select_talent" ON "public"."booking_commission_snapshot";
CREATE POLICY "booking_commission_snapshot_merged_select_authenticated" ON "public"."booking_commission_snapshot"
  AS PERMISSIVE FOR SELECT
  TO "authenticated"
  USING ((is_booking_coordinator(booking_id)) OR ((EXISTS ( SELECT 1
   FROM (booking_talent bt
     JOIN talent_profiles tp ON ((tp.id = bt.talent_profile_id)))
  WHERE ((bt.booking_id = booking_commission_snapshot.booking_id) AND (tp.user_id = auth.uid()))))));

-- ── public.booking_transactions  FOR SELECT  roles=[public]  (3 → 1) ──
DROP POLICY IF EXISTS "booking_transactions_payer_read" ON "public"."booking_transactions";
DROP POLICY IF EXISTS "booking_transactions_receiver_read" ON "public"."booking_transactions";
DROP POLICY IF EXISTS "booking_transactions_staff_read" ON "public"."booking_transactions";
CREATE POLICY "booking_transactions_merged_select_public" ON "public"."booking_transactions"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((payer_user_id = auth.uid())) OR (((payout_receiver_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (payout_accounts pa
     LEFT JOIN talent_profiles tp ON (((pa.owner_type = 'talent'::text) AND (tp.id = pa.owner_id))))
  WHERE ((pa.id = booking_transactions.payout_receiver_id) AND (pa.tenant_id = booking_transactions.source_tenant_id) AND (((pa.owner_type = 'profile'::text) AND (pa.owner_id = auth.uid())) OR ((pa.owner_type = 'talent'::text) AND (tp.user_id = auth.uid())))))))) OR (is_staff_of_tenant(source_tenant_id)));

-- ── public.builder_template_revisions  FOR SELECT  roles=[authenticated]  (2 → 1) ──
DROP POLICY IF EXISTS "btr_select_published" ON "public"."builder_template_revisions";
DROP POLICY IF EXISTS "btr_select_super_admin" ON "public"."builder_template_revisions";
CREATE POLICY "builder_template_revisions_merged_select_authenticated" ON "public"."builder_template_revisions"
  AS PERMISSIVE FOR SELECT
  TO "authenticated"
  USING (((EXISTS ( SELECT 1
   FROM builder_templates t
  WHERE ((t.id = builder_template_revisions.template_id) AND (t.status = 'published'::builder_template_status))))) OR (is_super_admin()));

-- ── public.builder_templates  FOR SELECT  roles=[authenticated]  (2 → 1) ──
DROP POLICY IF EXISTS "bt_select_published" ON "public"."builder_templates";
DROP POLICY IF EXISTS "bt_select_super_admin" ON "public"."builder_templates";
CREATE POLICY "builder_templates_merged_select_authenticated" ON "public"."builder_templates"
  AS PERMISSIVE FOR SELECT
  TO "authenticated"
  USING (((status = 'published'::builder_template_status)) OR (is_super_admin()));

-- ── public.client_balance_ledger  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "client_balance_ledger_self_read" ON "public"."client_balance_ledger";
DROP POLICY IF EXISTS "client_balance_ledger_staff_read" ON "public"."client_balance_ledger";
CREATE POLICY "client_balance_ledger_merged_select_public" ON "public"."client_balance_ledger"
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (agency_client_relationships acr
     JOIN client_profiles cp ON ((cp.id = acr.client_profile_id)))
  WHERE ((cp.user_id = auth.uid()) AND (acr.tenant_id = client_balance_ledger.tenant_id) AND (COALESCE(acr.status, 'active'::text) <> 'removed'::text)))))) OR (is_staff_of_tenant(tenant_id)));

-- ── public.client_integrations  FOR ALL  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "client_integrations_own_all" ON "public"."client_integrations";
DROP POLICY IF EXISTS "client_integrations_platform_admin_all" ON "public"."client_integrations";
CREATE POLICY "client_integrations_merged_all_public" ON "public"."client_integrations"
  AS PERMISSIVE FOR ALL
  TO public
  USING (((user_id = auth.uid())) OR (is_platform_admin()))
  WITH CHECK (((user_id = auth.uid())) OR (is_platform_admin()));

-- ── public.client_reviews  FOR SELECT  roles=[public]  (3 → 1) ──
DROP POLICY IF EXISTS "client_reviews_author_select" ON "public"."client_reviews";
DROP POLICY IF EXISTS "client_reviews_staff_select" ON "public"."client_reviews";
DROP POLICY IF EXISTS "client_reviews_subject_select" ON "public"."client_reviews";
CREATE POLICY "client_reviews_merged_select_public" ON "public"."client_reviews"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((author_user_id = auth.uid())) OR (is_staff_of_tenant(tenant_id)) OR (((client_user_id = auth.uid()) AND (status = 'published'::text))));

-- ── public.client_reviews  FOR UPDATE  roles=[public]  (3 → 1) ──
DROP POLICY IF EXISTS "client_reviews_author_update" ON "public"."client_reviews";
DROP POLICY IF EXISTS "client_reviews_staff_update" ON "public"."client_reviews";
DROP POLICY IF EXISTS "client_reviews_subject_report" ON "public"."client_reviews";
CREATE POLICY "client_reviews_merged_update_public" ON "public"."client_reviews"
  AS PERMISSIVE FOR UPDATE
  TO public
  USING (((author_user_id = auth.uid())) OR (is_staff_of_tenant(tenant_id)) OR ((client_user_id = auth.uid())))
  WITH CHECK (((author_user_id = auth.uid())) OR (is_staff_of_tenant(tenant_id)) OR ((client_user_id = auth.uid())));

-- ── public.client_trust_state  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "client_trust_state_own_read" ON "public"."client_trust_state";
DROP POLICY IF EXISTS "client_trust_state_staff_read" ON "public"."client_trust_state";
CREATE POLICY "client_trust_state_merged_select_public" ON "public"."client_trust_state"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((user_id = auth.uid())) OR (is_staff_of_tenant(tenant_id)));

-- ── public.email_suppressions  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "email_suppressions_platform_admin" ON "public"."email_suppressions";
DROP POLICY IF EXISTS "email_suppressions_self_select" ON "public"."email_suppressions";
CREATE POLICY "email_suppressions_merged_select_public" ON "public"."email_suppressions"
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((is_platform_admin()) OR ((user_id = auth.uid())));

-- ── public.field_groups  FOR ALL  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "field_groups_write_canonical" ON "public"."field_groups";
DROP POLICY IF EXISTS "field_groups_write_tenant" ON "public"."field_groups";
CREATE POLICY "field_groups_merged_all_public" ON "public"."field_groups"
  AS PERMISSIVE FOR ALL
  TO public
  USING ((((tenant_id IS NULL) AND is_platform_admin())) OR (((tenant_id IS NOT NULL) AND is_staff_of_tenant(tenant_id))))
  WITH CHECK ((((tenant_id IS NULL) AND is_platform_admin())) OR (((tenant_id IS NOT NULL) AND is_staff_of_tenant(tenant_id))));

-- ── public.inquiries  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "inquiries_select_own" ON "public"."inquiries";
DROP POLICY IF EXISTS "inquiries_select_talent_participant" ON "public"."inquiries";
CREATE POLICY "inquiries_merged_select_public" ON "public"."inquiries"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((client_user_id = auth.uid())) OR ((EXISTS ( SELECT 1
   FROM (inquiry_participants p
     JOIN talent_profiles tp ON ((tp.id = p.talent_profile_id)))
  WHERE ((p.inquiry_id = inquiries.id) AND (p.role = 'talent'::inquiry_participant_role) AND (tp.user_id = auth.uid()))))));

-- ── public.inquiry_alternates  FOR ALL  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "inquiry_alternates_platform_admin_all" ON "public"."inquiry_alternates";
DROP POLICY IF EXISTS "inquiry_alternates_staff_all" ON "public"."inquiry_alternates";
CREATE POLICY "inquiry_alternates_merged_all_public" ON "public"."inquiry_alternates"
  AS PERMISSIVE FOR ALL
  TO public
  USING ((is_platform_admin()) OR (is_staff_of_tenant(tenant_id)))
  WITH CHECK ((is_platform_admin()) OR (is_staff_of_tenant(tenant_id)));

-- ── public.inquiry_approvals  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "inquiry_approvals_coordinator_select" ON "public"."inquiry_approvals";
DROP POLICY IF EXISTS "inquiry_approvals_participant_select_own" ON "public"."inquiry_approvals";
CREATE POLICY "inquiry_approvals_merged_select_public" ON "public"."inquiry_approvals"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((is_agency_staff() OR (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_approvals.inquiry_id) AND (p.user_id = auth.uid()) AND (p.role = 'coordinator'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status)))))) OR ((EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.id = inquiry_approvals.participant_id) AND (p.user_id = auth.uid()) AND (p.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status])))))));

-- ── public.inquiry_drafts  FOR ALL  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "inquiry_drafts_owner" ON "public"."inquiry_drafts";
DROP POLICY IF EXISTS "inquiry_drafts_tenant_staff" ON "public"."inquiry_drafts";
CREATE POLICY "inquiry_drafts_merged_all_public" ON "public"."inquiry_drafts"
  AS PERMISSIVE FOR ALL
  TO public
  USING (((requester_user_id = auth.uid())) OR (is_staff_of_tenant(tenant_id)))
  WITH CHECK (((requester_user_id = auth.uid())) OR (is_staff_of_tenant(tenant_id)));

-- ── public.inquiry_events  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "inquiry_events_participant_read" ON "public"."inquiry_events";
DROP POLICY IF EXISTS "inquiry_events_tenant_select" ON "public"."inquiry_events";
CREATE POLICY "inquiry_events_merged_select_public" ON "public"."inquiry_events"
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((((visibility = 'participants'::inquiry_event_visibility) AND (EXISTS ( SELECT 1
   FROM inquiry_participants ip
  WHERE ((ip.inquiry_id = inquiry_events.inquiry_id) AND (ip.user_id = auth.uid()) AND (ip.status = 'active'::inquiry_participant_status)))))) OR (is_staff_of_tenant(tenant_id)));

-- ── public.inquiry_message_reads  FOR ALL  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "inquiry_message_reads_participant_own" ON "public"."inquiry_message_reads";
DROP POLICY IF EXISTS "inquiry_message_reads_tenant_staff" ON "public"."inquiry_message_reads";
CREATE POLICY "inquiry_message_reads_merged_all_public" ON "public"."inquiry_message_reads"
  AS PERMISSIVE FOR ALL
  TO public
  USING (((user_id = auth.uid())) OR (is_staff_of_tenant(COALESCE(target_owning_party_id, tenant_id))))
  WITH CHECK (((user_id = auth.uid())) OR (is_staff_of_tenant(COALESCE(target_owning_party_id, tenant_id))));

-- ── public.inquiry_messages  FOR INSERT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "inquiry_messages_group_insert_participant" ON "public"."inquiry_messages";
DROP POLICY IF EXISTS "inquiry_messages_private_insert_participant_v2" ON "public"."inquiry_messages";
CREATE POLICY "inquiry_messages_merged_insert_public" ON "public"."inquiry_messages"
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK ((((thread_type = 'group'::inquiry_thread_type) AND (sender_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_messages.inquiry_id) AND (p.user_id = auth.uid()) AND (p.status = ANY (ARRAY['active'::inquiry_participant_status, 'invited'::inquiry_participant_status])) AND (p.role <> 'client'::inquiry_participant_role)))))) OR (((thread_type = 'private'::inquiry_thread_type) AND (sender_user_id = auth.uid()) AND ((EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_messages.inquiry_id) AND (p.user_id = auth.uid()) AND (p.role = ANY (ARRAY['client'::inquiry_participant_role, 'coordinator'::inquiry_participant_role])) AND (p.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status]))))) OR (EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = inquiry_messages.inquiry_id) AND (i.client_user_id = auth.uid()))))))));

-- ── public.inquiry_messages  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "inquiry_messages_group_select_participant" ON "public"."inquiry_messages";
DROP POLICY IF EXISTS "inquiry_messages_private_select_participant_v2" ON "public"."inquiry_messages";
CREATE POLICY "inquiry_messages_merged_select_public" ON "public"."inquiry_messages"
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((((thread_type = 'group'::inquiry_thread_type) AND (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_messages.inquiry_id) AND (p.user_id = auth.uid()) AND (p.status = ANY (ARRAY['active'::inquiry_participant_status, 'invited'::inquiry_participant_status])) AND (p.role <> 'client'::inquiry_participant_role)))))) OR (((thread_type = 'private'::inquiry_thread_type) AND ((EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_messages.inquiry_id) AND (p.user_id = auth.uid()) AND (p.role = ANY (ARRAY['client'::inquiry_participant_role, 'coordinator'::inquiry_participant_role])) AND (p.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status]))))) OR (EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = inquiry_messages.inquiry_id) AND (i.client_user_id = auth.uid()))))))));

-- ── public.inquiry_offer_line_items  FOR ALL  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "inquiry_offer_line_items_coordinator_write" ON "public"."inquiry_offer_line_items";
DROP POLICY IF EXISTS "inquiry_offer_line_items_tenant_staff" ON "public"."inquiry_offer_line_items";
CREATE POLICY "inquiry_offer_line_items_merged_all_public" ON "public"."inquiry_offer_line_items"
  AS PERMISSIVE FOR ALL
  TO public
  USING (((is_agency_staff() OR (EXISTS ( SELECT 1
   FROM (inquiry_offers o
     JOIN inquiry_participants p ON ((p.inquiry_id = o.inquiry_id)))
  WHERE ((o.id = inquiry_offer_line_items.offer_id) AND (p.user_id = auth.uid()) AND (p.role = 'coordinator'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status)))))) OR (is_staff_of_tenant(tenant_id)))
  WITH CHECK (((is_agency_staff() OR (EXISTS ( SELECT 1
   FROM (inquiry_offers o
     JOIN inquiry_participants p ON ((p.inquiry_id = o.inquiry_id)))
  WHERE ((o.id = inquiry_offer_line_items.offer_id) AND (p.user_id = auth.uid()) AND (p.role = 'coordinator'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status)))))) OR (is_staff_of_tenant(tenant_id)));

-- ── public.inquiry_offer_line_items  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "inquiry_offer_line_items_client_select" ON "public"."inquiry_offer_line_items";
DROP POLICY IF EXISTS "inquiry_offer_line_items_coordinator_select" ON "public"."inquiry_offer_line_items";
CREATE POLICY "inquiry_offer_line_items_merged_select_public" ON "public"."inquiry_offer_line_items"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((EXISTS ( SELECT 1
   FROM (inquiry_offers o
     JOIN inquiry_participants p ON ((p.inquiry_id = o.inquiry_id)))
  WHERE ((o.id = inquiry_offer_line_items.offer_id) AND (o.status = ANY (ARRAY['sent'::inquiry_offer_status, 'accepted'::inquiry_offer_status])) AND (p.user_id = auth.uid()) AND (p.role = 'client'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status))))) OR ((is_agency_staff() OR (EXISTS ( SELECT 1
   FROM (inquiry_offers o
     JOIN inquiry_participants p ON ((p.inquiry_id = o.inquiry_id)))
  WHERE ((o.id = inquiry_offer_line_items.offer_id) AND (p.user_id = auth.uid()) AND (p.role = 'coordinator'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status)))))));

-- ── public.inquiry_offers  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "inquiry_offers_client_select" ON "public"."inquiry_offers";
DROP POLICY IF EXISTS "inquiry_offers_coordinator_select" ON "public"."inquiry_offers";
CREATE POLICY "inquiry_offers_merged_select_public" ON "public"."inquiry_offers"
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((((status = ANY (ARRAY['sent'::inquiry_offer_status, 'accepted'::inquiry_offer_status])) AND (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_offers.inquiry_id) AND (p.user_id = auth.uid()) AND (p.role = 'client'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status)))))) OR ((is_agency_staff() OR (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_offers.inquiry_id) AND (p.user_id = auth.uid()) AND (p.role = 'coordinator'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status)))))));

-- ── public.inquiry_participants  FOR ALL  roles=[public]  (3 → 1) ──
DROP POLICY IF EXISTS "inquiry_participants_nontalent_tenant_staff" ON "public"."inquiry_participants";
DROP POLICY IF EXISTS "inquiry_participants_talent_legacy_tenant_staff" ON "public"."inquiry_participants";
DROP POLICY IF EXISTS "inquiry_participants_talent_owning_party_staff" ON "public"."inquiry_participants";
CREATE POLICY "inquiry_participants_merged_all_public" ON "public"."inquiry_participants"
  AS PERMISSIVE FOR ALL
  TO public
  USING ((((role <> 'talent'::inquiry_participant_role) AND is_staff_of_tenant(tenant_id))) OR (((role = 'talent'::inquiry_participant_role) AND (owning_party_type IS NULL) AND is_staff_of_tenant(tenant_id))) OR (((role = 'talent'::inquiry_participant_role) AND (owning_party_type = ANY (ARRAY['agency'::text, 'workspace'::text])) AND is_staff_of_tenant(owning_party_id))))
  WITH CHECK ((((role <> 'talent'::inquiry_participant_role) AND is_staff_of_tenant(tenant_id))) OR (((role = 'talent'::inquiry_participant_role) AND (owning_party_type IS NULL) AND is_staff_of_tenant(tenant_id))) OR (((role = 'talent'::inquiry_participant_role) AND (owning_party_type = ANY (ARRAY['agency'::text, 'workspace'::text])) AND is_staff_of_tenant(owning_party_id))));

-- ── public.inquiry_participants  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "inquiry_participants_client_select" ON "public"."inquiry_participants";
DROP POLICY IF EXISTS "inquiry_participants_talent_select" ON "public"."inquiry_participants";
CREATE POLICY "inquiry_participants_merged_select_public" ON "public"."inquiry_participants"
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((((user_id = auth.uid()) AND (role = 'client'::inquiry_participant_role))) OR (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = inquiry_participants.talent_profile_id) AND (tp.user_id = auth.uid())))) AND (role = 'talent'::inquiry_participant_role))));

-- ── public.inquiry_participants  FOR SELECT  roles=[authenticated]  (2 → 1) ──
DROP POLICY IF EXISTS "inquiry_participants_coordinator_select" ON "public"."inquiry_participants";
DROP POLICY IF EXISTS "inquiry_participants_own_coordinator_select" ON "public"."inquiry_participants";
CREATE POLICY "inquiry_participants_merged_select_authenticated" ON "public"."inquiry_participants"
  AS PERMISSIVE FOR SELECT
  TO "authenticated"
  USING ((is_inquiry_coordinator(inquiry_id)) OR (((user_id = auth.uid()) AND (role = 'coordinator'::inquiry_participant_role))));

-- ── public.media_assets  FOR ALL  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "media_assets_tenant_staff_all" ON "public"."media_assets";
DROP POLICY IF EXISTS "media_write_staff" ON "public"."media_assets";
CREATE POLICY "media_assets_merged_all_public" ON "public"."media_assets"
  AS PERMISSIVE FOR ALL
  TO public
  USING ((((purpose <> 'talent'::media_purpose) AND ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.app_role = 'super_admin'::app_role)))) OR (EXISTS ( SELECT 1
   FROM agency_memberships m
  WHERE ((m.profile_id = auth.uid()) AND (m.tenant_id = media_assets.tenant_id) AND (m.status = ANY (ARRAY['active'::text, 'pending_acceptance'::text])))))))) OR (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.app_role = 'super_admin'::app_role)))) OR (EXISTS ( SELECT 1
   FROM agency_memberships m
  WHERE ((m.profile_id = auth.uid()) AND (m.tenant_id = media_assets.tenant_id) AND (m.status = ANY (ARRAY['active'::text, 'pending_acceptance'::text]))))))))
  WITH CHECK ((((purpose <> 'talent'::media_purpose) AND ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.app_role = 'super_admin'::app_role)))) OR (EXISTS ( SELECT 1
   FROM agency_memberships m
  WHERE ((m.profile_id = auth.uid()) AND (m.tenant_id = media_assets.tenant_id) AND (m.status = ANY (ARRAY['active'::text, 'pending_acceptance'::text])))))))) OR (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.app_role = 'super_admin'::app_role)))) OR (EXISTS ( SELECT 1
   FROM agency_memberships m
  WHERE ((m.profile_id = auth.uid()) AND (m.tenant_id = media_assets.tenant_id) AND (m.status = ANY (ARRAY['active'::text, 'pending_acceptance'::text]))))))));

-- ── public.notifications  FOR ALL  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "notifications_own" ON "public"."notifications";
DROP POLICY IF EXISTS "notifications_tenant_staff" ON "public"."notifications";
CREATE POLICY "notifications_merged_all_public" ON "public"."notifications"
  AS PERMISSIVE FOR ALL
  TO public
  USING (((user_id = auth.uid())) OR (is_staff_of_tenant(tenant_id)))
  WITH CHECK (((user_id = auth.uid())) OR (is_staff_of_tenant(tenant_id)));

-- ── public.talent_agency_applications  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "taa_staff_select" ON "public"."talent_agency_applications";
DROP POLICY IF EXISTS "taa_talent_select" ON "public"."talent_agency_applications";
CREATE POLICY "talent_agency_applications_merged_select_public" ON "public"."talent_agency_applications"
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((is_staff_of_tenant(tenant_id)) OR ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_agency_applications.talent_profile_id) AND (tp.user_id = auth.uid()))))));

-- ── public.talent_agency_applications  FOR UPDATE  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "taa_staff_update" ON "public"."talent_agency_applications";
DROP POLICY IF EXISTS "taa_talent_withdraw" ON "public"."talent_agency_applications";
CREATE POLICY "talent_agency_applications_merged_update_public" ON "public"."talent_agency_applications"
  AS PERMISSIVE FOR UPDATE
  TO public
  USING ((is_staff_of_tenant(tenant_id)) OR (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_agency_applications.talent_profile_id) AND (tp.user_id = auth.uid())))) AND (status = 'pending'::talent_application_status))))
  WITH CHECK ((is_staff_of_tenant(tenant_id)) OR ((status = 'withdrawn'::talent_application_status)));

-- ── public.talent_agency_data_grants  FOR ALL  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "tadg_all_own_talent" ON "public"."talent_agency_data_grants";
DROP POLICY IF EXISTS "tadg_platform_admin" ON "public"."talent_agency_data_grants";
CREATE POLICY "talent_agency_data_grants_merged_all_public" ON "public"."talent_agency_data_grants"
  AS PERMISSIVE FOR ALL
  TO public
  USING (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_agency_data_grants.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR (is_platform_admin()))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_agency_data_grants.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR (is_platform_admin()));

-- ── public.talent_agency_permission_requests  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "tapr_select_own_talent" ON "public"."talent_agency_permission_requests";
DROP POLICY IF EXISTS "tapr_select_requesting_tenant" ON "public"."talent_agency_permission_requests";
CREATE POLICY "talent_agency_permission_requests_merged_select_public" ON "public"."talent_agency_permission_requests"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_agency_permission_requests.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR (is_staff_of_tenant(requesting_tenant_id)));

-- ── public.talent_bookings  FOR SELECT  roles=[authenticated]  (3 → 1) ──
DROP POLICY IF EXISTS "talent_bookings_select_client" ON "public"."talent_bookings";
DROP POLICY IF EXISTS "talent_bookings_select_self" ON "public"."talent_bookings";
DROP POLICY IF EXISTS "talent_bookings_select_staff" ON "public"."talent_bookings";
CREATE POLICY "talent_bookings_merged_select_authenticated" ON "public"."talent_bookings"
  AS PERMISSIVE FOR SELECT
  TO "authenticated"
  USING ((((inquiry_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = talent_bookings.inquiry_id) AND (i.client_user_id = auth.uid())))))) OR ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_bookings.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR (is_staff_of_tenant(tenant_id)));

-- ── public.talent_contact_preferences  FOR ALL  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "talent_contact_prefs_own" ON "public"."talent_contact_preferences";
DROP POLICY IF EXISTS "talent_contact_prefs_staff" ON "public"."talent_contact_preferences";
CREATE POLICY "talent_contact_preferences_merged_all_public" ON "public"."talent_contact_preferences"
  AS PERMISSIVE FOR ALL
  TO public
  USING (((EXISTS ( SELECT 1
   FROM (talent_profiles tp
     JOIN agency_talent_roster atr ON (((atr.talent_profile_id = tp.id) AND (atr.tenant_id = talent_contact_preferences.tenant_id) AND (atr.status <> 'removed'::text))))
  WHERE ((tp.id = talent_contact_preferences.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR (is_staff_of_tenant(tenant_id)))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM (talent_profiles tp
     JOIN agency_talent_roster atr ON (((atr.talent_profile_id = tp.id) AND (atr.tenant_id = talent_contact_preferences.tenant_id) AND (atr.status <> 'removed'::text))))
  WHERE ((tp.id = talent_contact_preferences.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR (is_staff_of_tenant(tenant_id)));

-- ── public.talent_holds  FOR SELECT  roles=[authenticated]  (2 → 1) ──
DROP POLICY IF EXISTS "talent_holds_select_self" ON "public"."talent_holds";
DROP POLICY IF EXISTS "talent_holds_select_staff" ON "public"."talent_holds";
CREATE POLICY "talent_holds_merged_select_authenticated" ON "public"."talent_holds"
  AS PERMISSIVE FOR SELECT
  TO "authenticated"
  USING (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_holds.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR (is_staff_of_tenant(tenant_id)));

-- ── public.talent_hub_applications  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "tha_staff_select" ON "public"."talent_hub_applications";
DROP POLICY IF EXISTS "tha_talent_select" ON "public"."talent_hub_applications";
CREATE POLICY "talent_hub_applications_merged_select_public" ON "public"."talent_hub_applications"
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((is_staff_of_tenant(tenant_id)) OR ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_hub_applications.talent_profile_id) AND (tp.user_id = auth.uid()))))));

-- ── public.talent_hub_applications  FOR UPDATE  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "tha_staff_update" ON "public"."talent_hub_applications";
DROP POLICY IF EXISTS "tha_talent_withdraw" ON "public"."talent_hub_applications";
CREATE POLICY "talent_hub_applications_merged_update_public" ON "public"."talent_hub_applications"
  AS PERMISSIVE FOR UPDATE
  TO public
  USING ((is_staff_of_tenant(tenant_id)) OR (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_hub_applications.talent_profile_id) AND (tp.user_id = auth.uid())))) AND (status = 'pending'::talent_application_status))))
  WITH CHECK ((is_staff_of_tenant(tenant_id)) OR ((status = 'withdrawn'::talent_application_status)));

-- ── public.talent_integration_items  FOR ALL  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "talent_integration_items_own_all" ON "public"."talent_integration_items";
DROP POLICY IF EXISTS "talent_integration_items_platform_admin_all" ON "public"."talent_integration_items";
CREATE POLICY "talent_integration_items_merged_all_public" ON "public"."talent_integration_items"
  AS PERMISSIVE FOR ALL
  TO public
  USING (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_integration_items.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR (is_platform_admin()))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_integration_items.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR (is_platform_admin()));

-- ── public.talent_integrations  FOR ALL  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "talent_integrations_own_all" ON "public"."talent_integrations";
DROP POLICY IF EXISTS "talent_integrations_platform_admin_all" ON "public"."talent_integrations";
CREATE POLICY "talent_integrations_merged_all_public" ON "public"."talent_integrations"
  AS PERMISSIVE FOR ALL
  TO public
  USING (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_integrations.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR (is_platform_admin()))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_integrations.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR (is_platform_admin()));

-- ── public.talent_languages  FOR SELECT  roles=[public]  (3 → 1) ──
DROP POLICY IF EXISTS "talent_languages_select_own" ON "public"."talent_languages";
DROP POLICY IF EXISTS "talent_languages_select_public" ON "public"."talent_languages";
DROP POLICY IF EXISTS "talent_languages_select_staff" ON "public"."talent_languages";
CREATE POLICY "talent_languages_merged_select_public" ON "public"."talent_languages"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_languages.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_languages.talent_profile_id) AND (tp.deleted_at IS NULL) AND (tp.is_publicly_hidden = false) AND talent_is_site_visible_anywhere(tp.id))))) OR (((tenant_id IS NOT NULL) AND is_staff_of_tenant(tenant_id))));

-- ── public.talent_page_revisions  FOR ALL  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "talent_page_revisions_owner" ON "public"."talent_page_revisions";
DROP POLICY IF EXISTS "talent_page_revisions_staff" ON "public"."talent_page_revisions";
CREATE POLICY "talent_page_revisions_merged_all_public" ON "public"."talent_page_revisions"
  AS PERMISSIVE FOR ALL
  TO public
  USING (((EXISTS ( SELECT 1
   FROM (talent_pages p
     JOIN talent_profiles tp ON ((tp.id = p.talent_profile_id)))
  WHERE ((p.id = talent_page_revisions.page_id) AND (tp.user_id = auth.uid()))))) OR ((EXISTS ( SELECT 1
   FROM (talent_pages p
     JOIN talent_profiles tp ON ((tp.id = p.talent_profile_id)))
  WHERE ((p.id = talent_page_revisions.page_id) AND is_staff_of_tenant(tp.created_by_agency_id))))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM (talent_pages p
     JOIN talent_profiles tp ON ((tp.id = p.talent_profile_id)))
  WHERE ((p.id = talent_page_revisions.page_id) AND (tp.user_id = auth.uid()))))) OR ((EXISTS ( SELECT 1
   FROM (talent_pages p
     JOIN talent_profiles tp ON ((tp.id = p.talent_profile_id)))
  WHERE ((p.id = talent_page_revisions.page_id) AND is_staff_of_tenant(tp.created_by_agency_id))))));

-- ── public.talent_pages  FOR ALL  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "talent_pages_owner" ON "public"."talent_pages";
DROP POLICY IF EXISTS "talent_pages_staff" ON "public"."talent_pages";
CREATE POLICY "talent_pages_merged_all_public" ON "public"."talent_pages"
  AS PERMISSIVE FOR ALL
  TO public
  USING (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_pages.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_pages.talent_profile_id) AND is_staff_of_tenant(tp.created_by_agency_id))))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_pages.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_pages.talent_profile_id) AND is_staff_of_tenant(tp.created_by_agency_id))))));

-- ── public.talent_profile_external_calendars  FOR ALL  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "tpec_all_own_talent" ON "public"."talent_profile_external_calendars";
DROP POLICY IF EXISTS "tpec_platform_admin" ON "public"."talent_profile_external_calendars";
CREATE POLICY "talent_profile_external_calendars_merged_all_public" ON "public"."talent_profile_external_calendars"
  AS PERMISSIVE FOR ALL
  TO public
  USING (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_profile_external_calendars.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR (is_platform_admin()))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_profile_external_calendars.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR (is_platform_admin()));

-- ── public.talent_profile_field_values  FOR SELECT  roles=[public]  (3 → 1) ──
DROP POLICY IF EXISTS "tpfv_select_own" ON "public"."talent_profile_field_values";
DROP POLICY IF EXISTS "tpfv_select_public" ON "public"."talent_profile_field_values";
DROP POLICY IF EXISTS "tpfv_select_staff" ON "public"."talent_profile_field_values";
CREATE POLICY "talent_profile_field_values_merged_select_public" ON "public"."talent_profile_field_values"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_profile_field_values.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR (((workflow_state = 'live'::text) AND (EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_profile_field_values.talent_profile_id) AND (tp.deleted_at IS NULL) AND (tp.is_publicly_hidden = false) AND talent_is_site_visible_anywhere(tp.id)))) AND (EXISTS ( SELECT 1
   FROM profile_field_definitions pfd
  WHERE ((pfd.id = talent_profile_field_values.field_definition_id) AND ('public'::text = ANY (COALESCE(talent_profile_field_values.visibility_override, pfd.default_visibility)))))))) OR (((tenant_id IS NOT NULL) AND is_staff_of_tenant(tenant_id))));

-- ── public.talent_profile_taxonomy  FOR ALL  roles=[public]  (3 → 1) ──
DROP POLICY IF EXISTS "talent_taxonomy_write_own_talent" ON "public"."talent_profile_taxonomy";
DROP POLICY IF EXISTS "tpt_agency_roster_all" ON "public"."talent_profile_taxonomy";
DROP POLICY IF EXISTS "tpt_talent_self_modify" ON "public"."talent_profile_taxonomy";
CREATE POLICY "talent_profile_taxonomy_merged_all_public" ON "public"."talent_profile_taxonomy"
  AS PERMISSIVE FOR ALL
  TO public
  USING (((EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = talent_profile_taxonomy.talent_profile_id) AND (t.user_id = auth.uid()))))) OR ((talent_profile_id IN ( SELECT atr.talent_profile_id
   FROM (agency_talent_roster atr
     JOIN agency_memberships atm ON ((atm.tenant_id = atr.tenant_id)))
  WHERE ((atm.profile_id = auth.uid()) AND (atm.status = 'active'::text) AND (atr.status = ANY (ARRAY['active'::text, 'pending'::text])))))) OR ((talent_profile_id IN ( SELECT talent_profiles.id
   FROM talent_profiles
  WHERE (talent_profiles.user_id = auth.uid())))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = talent_profile_taxonomy.talent_profile_id) AND (t.user_id = auth.uid()))))) OR ((talent_profile_id IN ( SELECT atr.talent_profile_id
   FROM (agency_talent_roster atr
     JOIN agency_memberships atm ON ((atm.tenant_id = atr.tenant_id)))
  WHERE ((atm.profile_id = auth.uid()) AND (atm.status = 'active'::text) AND (atr.status = ANY (ARRAY['active'::text, 'pending'::text])))))) OR ((talent_profile_id IN ( SELECT talent_profiles.id
   FROM talent_profiles
  WHERE (talent_profiles.user_id = auth.uid())))));

-- ── public.talent_profile_taxonomy  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "talent_taxonomy_select" ON "public"."talent_profile_taxonomy";
DROP POLICY IF EXISTS "tpt_talent_self_select" ON "public"."talent_profile_taxonomy";
CREATE POLICY "talent_profile_taxonomy_merged_select_public" ON "public"."talent_profile_taxonomy"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = talent_profile_taxonomy.talent_profile_id) AND (t.deleted_at IS NULL) AND (((t.is_publicly_hidden = false) AND talent_is_site_visible_anywhere(t.id)) OR (t.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM agency_talent_roster atr
          WHERE ((atr.talent_profile_id = t.id) AND is_staff_of_tenant(atr.tenant_id))))))))) OR ((talent_profile_id IN ( SELECT talent_profiles.id
   FROM talent_profiles
  WHERE (talent_profiles.user_id = auth.uid())))));

-- ── public.talent_profile_trust_badges  FOR ALL  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "tptb_write_agency_scoped" ON "public"."talent_profile_trust_badges";
DROP POLICY IF EXISTS "tptb_write_platform_admin" ON "public"."talent_profile_trust_badges";
CREATE POLICY "talent_profile_trust_badges_merged_all_public" ON "public"."talent_profile_trust_badges"
  AS PERMISSIVE FOR ALL
  TO public
  USING ((((scope = 'agency'::text) AND (scope_tenant_id IS NOT NULL) AND is_staff_of_tenant(scope_tenant_id))) OR (is_platform_admin()))
  WITH CHECK ((((scope = 'agency'::text) AND (scope_tenant_id IS NOT NULL) AND is_staff_of_tenant(scope_tenant_id))) OR (is_platform_admin()));

-- ── public.talent_profile_trust_badges  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "tptb_select_own" ON "public"."talent_profile_trust_badges";
DROP POLICY IF EXISTS "tptb_select_tenant_staff" ON "public"."talent_profile_trust_badges";
CREATE POLICY "talent_profile_trust_badges_merged_select_public" ON "public"."talent_profile_trust_badges"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_profile_trust_badges.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR ((((scope = 'agency'::text) AND (scope_tenant_id IS NOT NULL) AND is_staff_of_tenant(scope_tenant_id)) OR (EXISTS ( SELECT 1
   FROM agency_talent_roster atr
  WHERE ((atr.talent_profile_id = talent_profile_trust_badges.talent_profile_id) AND (atr.status = 'active'::text) AND is_staff_of_tenant(atr.tenant_id)))))));

-- ── public.talent_profiles  FOR SELECT  roles=[public]  (3 → 1) ──
DROP POLICY IF EXISTS "talent_select_own" ON "public"."talent_profiles";
DROP POLICY IF EXISTS "talent_select_public" ON "public"."talent_profiles";
DROP POLICY IF EXISTS "talent_select_staff" ON "public"."talent_profiles";
CREATE POLICY "talent_profiles_merged_select_public" ON "public"."talent_profiles"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((user_id = auth.uid())) OR (((deleted_at IS NULL) AND (is_publicly_hidden = false) AND talent_has_public_roster(id))) OR (is_agency_staff()));

-- ── public.talent_reviews  FOR SELECT  roles=[public]  (4 → 1) ──
DROP POLICY IF EXISTS "talent_reviews_client_select_own" ON "public"."talent_reviews";
DROP POLICY IF EXISTS "talent_reviews_public_select" ON "public"."talent_reviews";
DROP POLICY IF EXISTS "talent_reviews_staff_select" ON "public"."talent_reviews";
DROP POLICY IF EXISTS "talent_reviews_subject_select" ON "public"."talent_reviews";
CREATE POLICY "talent_reviews_merged_select_public" ON "public"."talent_reviews"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((client_user_id = auth.uid())) OR ((status = 'published'::text)) OR (is_staff_of_tenant(tenant_id)) OR ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_reviews.talent_profile_id) AND (tp.user_id = auth.uid()))))));

-- ── public.talent_reviews  FOR UPDATE  roles=[public]  (3 → 1) ──
DROP POLICY IF EXISTS "talent_reviews_client_update" ON "public"."talent_reviews";
DROP POLICY IF EXISTS "talent_reviews_staff_update" ON "public"."talent_reviews";
DROP POLICY IF EXISTS "talent_reviews_subject_report" ON "public"."talent_reviews";
CREATE POLICY "talent_reviews_merged_update_public" ON "public"."talent_reviews"
  AS PERMISSIVE FOR UPDATE
  TO public
  USING (((client_user_id = auth.uid())) OR (is_staff_of_tenant(tenant_id)) OR ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_reviews.talent_profile_id) AND (tp.user_id = auth.uid()))))))
  WITH CHECK (((client_user_id = auth.uid())) OR (is_staff_of_tenant(tenant_id)) OR ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_reviews.talent_profile_id) AND (tp.user_id = auth.uid()))))));

-- ── public.talent_service_areas  FOR SELECT  roles=[public]  (3 → 1) ──
DROP POLICY IF EXISTS "talent_service_areas_select_own" ON "public"."talent_service_areas";
DROP POLICY IF EXISTS "talent_service_areas_select_public" ON "public"."talent_service_areas";
DROP POLICY IF EXISTS "talent_service_areas_select_staff" ON "public"."talent_service_areas";
CREATE POLICY "talent_service_areas_merged_select_public" ON "public"."talent_service_areas"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_service_areas.talent_profile_id) AND (tp.user_id = auth.uid()))))) OR ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_service_areas.talent_profile_id) AND (tp.deleted_at IS NULL) AND (tp.is_publicly_hidden = false) AND talent_is_site_visible_anywhere(tp.id))))) OR (((tenant_id IS NOT NULL) AND is_staff_of_tenant(tenant_id))));

-- ── public.talent_subscriptions  FOR SELECT  roles=[public]  (3 → 1) ──
DROP POLICY IF EXISTS "talent_subscriptions_platform_admin_read" ON "public"."talent_subscriptions";
DROP POLICY IF EXISTS "talent_subscriptions_self_read" ON "public"."talent_subscriptions";
DROP POLICY IF EXISTS "talent_subscriptions_staff_read" ON "public"."talent_subscriptions";
CREATE POLICY "talent_subscriptions_merged_select_public" ON "public"."talent_subscriptions"
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((is_platform_admin()) OR ((user_id = auth.uid())) OR ((EXISTS ( SELECT 1
   FROM agency_talent_roster atr
  WHERE ((atr.talent_profile_id = talent_subscriptions.talent_profile_id) AND is_staff_of_tenant(atr.tenant_id))))));

-- ── public.taxonomy_term_requests  FOR SELECT  roles=[public]  (2 → 1) ──
DROP POLICY IF EXISTS "ttr_select_own_submitter" ON "public"."taxonomy_term_requests";
DROP POLICY IF EXISTS "ttr_select_own_tenant" ON "public"."taxonomy_term_requests";
CREATE POLICY "taxonomy_term_requests_merged_select_public" ON "public"."taxonomy_term_requests"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((requested_by_user_id = auth.uid())) OR (((requested_by_tenant_id IS NOT NULL) AND is_staff_of_tenant(requested_by_tenant_id))));

-- ── storage.objects  FOR INSERT  roles=[authenticated]  (7 → 1) ──
DROP POLICY IF EXISTS "inquiry_files_staff_insert" ON "storage"."objects";
DROP POLICY IF EXISTS "pitch_files_staff_insert" ON "storage"."objects";
DROP POLICY IF EXISTS "staff_insert_originals_media" ON "storage"."objects";
DROP POLICY IF EXISTS "staff_insert_public_media" ON "storage"."objects";
DROP POLICY IF EXISTS "storage_media_public_insert_staff" ON "storage"."objects";
DROP POLICY IF EXISTS "talent_insert_originals_media" ON "storage"."objects";
DROP POLICY IF EXISTS "talent_insert_public_media" ON "storage"."objects";
CREATE POLICY "objects_merged_insert_authenticated" ON "storage"."objects"
  AS PERMISSIVE FOR INSERT
  TO "authenticated"
  WITH CHECK ((((bucket_id = 'inquiry-files'::text) AND is_staff_of_tenant(_inquiry_files_tenant_from_path(name)))) OR (((bucket_id = 'pitch-files'::text) AND is_staff_of_tenant(_pitch_files_tenant_from_path(name)))) OR (((bucket_id = 'media-originals'::text) AND is_agency_staff())) OR (((bucket_id = 'media-public'::text) AND is_agency_staff())) OR (((bucket_id = 'media-public'::text) AND is_agency_staff())) OR (((bucket_id = 'media-originals'::text) AND (EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE (((t.id)::text = (storage.foldername(objects.name))[1]) AND (t.user_id = auth.uid())))))) OR (((bucket_id = 'media-public'::text) AND (EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE (((t.id)::text = (storage.foldername(objects.name))[1]) AND (t.user_id = auth.uid())))))));

-- ── storage.objects  FOR DELETE  roles=[authenticated]  (6 → 1) ──
DROP POLICY IF EXISTS "inquiry_files_staff_delete" ON "storage"."objects";
DROP POLICY IF EXISTS "pitch_files_staff_delete" ON "storage"."objects";
DROP POLICY IF EXISTS "staff_delete_originals_media" ON "storage"."objects";
DROP POLICY IF EXISTS "staff_delete_public_media" ON "storage"."objects";
DROP POLICY IF EXISTS "talent_delete_own_originals_media" ON "storage"."objects";
DROP POLICY IF EXISTS "talent_delete_own_public_media" ON "storage"."objects";
CREATE POLICY "objects_merged_delete_authenticated" ON "storage"."objects"
  AS PERMISSIVE FOR DELETE
  TO "authenticated"
  USING ((((bucket_id = 'inquiry-files'::text) AND is_staff_of_tenant(_inquiry_files_tenant_from_path(name)))) OR (((bucket_id = 'pitch-files'::text) AND is_staff_of_tenant(_pitch_files_tenant_from_path(name)))) OR (((bucket_id = 'media-originals'::text) AND is_agency_staff())) OR (((bucket_id = 'media-public'::text) AND is_agency_staff())) OR (((bucket_id = 'media-originals'::text) AND (EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE (((t.id)::text = (storage.foldername(objects.name))[1]) AND (t.user_id = auth.uid())))))) OR (((bucket_id = 'media-public'::text) AND (EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE (((t.id)::text = (storage.foldername(objects.name))[1]) AND (t.user_id = auth.uid())))))));

-- ── storage.objects  FOR SELECT  roles=[authenticated]  (4 → 1) ──
DROP POLICY IF EXISTS "inquiry_files_staff_select" ON "storage"."objects";
DROP POLICY IF EXISTS "pitch_files_staff_select" ON "storage"."objects";
DROP POLICY IF EXISTS "staff_select_originals_media" ON "storage"."objects";
DROP POLICY IF EXISTS "talent_select_own_originals_media" ON "storage"."objects";
CREATE POLICY "objects_merged_select_authenticated" ON "storage"."objects"
  AS PERMISSIVE FOR SELECT
  TO "authenticated"
  USING ((((bucket_id = 'inquiry-files'::text) AND is_staff_of_tenant(_inquiry_files_tenant_from_path(name)))) OR (((bucket_id = 'pitch-files'::text) AND is_staff_of_tenant(_pitch_files_tenant_from_path(name)))) OR (((bucket_id = 'media-originals'::text) AND is_agency_staff())) OR (((bucket_id = 'media-originals'::text) AND (EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE (((t.id)::text = (storage.foldername(objects.name))[1]) AND (t.user_id = auth.uid())))))));
COMMIT;
