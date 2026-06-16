-- 20260615200003_rls_initplan_optimize.sql
-- Optimize 169 RLS policies flagged by Supabase advisor auth_rls_initplan.
-- Each bare auth.uid()/auth.jwt() call is wrapped in a scalar subselect
-- ((select auth.uid()) / (select auth.jwt())) so Postgres evaluates it once
-- per statement (InitPlan) instead of once per row. Semantically identical:
-- policy name, command, roles, permissive kind, and USING/WITH CHECK logic are
-- preserved; ONLY the auth function calls are wrapped. auth.uid()/auth.jwt() are
-- STABLE no-arg functions, so the scalar subselect returns an identical value.
-- Generated from pg_policy via pg_get_expr; rewrite verified equivalent by
-- unwrapping each expression back to the original (169/169 match).

BEGIN;

-- [1] agency_bookings.agency_bookings_client_select (SELECT)
DROP POLICY IF EXISTS "agency_bookings_client_select" ON public."agency_bookings";
CREATE POLICY "agency_bookings_client_select" ON public."agency_bookings"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((((client_visible_at IS NOT NULL) AND ((client_user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM client_account_contacts c
  WHERE ((c.id = agency_bookings.client_contact_id) AND (c.profile_user_id = (select auth.uid())) AND (c.archived_at IS NULL)))))) OR ((source_inquiry_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = agency_bookings.source_inquiry_id) AND (i.client_user_id = (select auth.uid()))))))));

-- [2] agency_memberships.agency_memberships_self_select (SELECT)
DROP POLICY IF EXISTS "agency_memberships_self_select" ON public."agency_memberships";
CREATE POLICY "agency_memberships_self_select" ON public."agency_memberships"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((profile_id = (select auth.uid())));

-- [3] agency_talent_media.atm_select_own_talent (SELECT)
DROP POLICY IF EXISTS "atm_select_own_talent" ON public."agency_talent_media";
CREATE POLICY "atm_select_own_talent" ON public."agency_talent_media"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = agency_talent_media.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [4] agency_talent_roster.agency_talent_roster_talent_self_read (SELECT)
DROP POLICY IF EXISTS "agency_talent_roster_talent_self_read" ON public."agency_talent_roster";
CREATE POLICY "agency_talent_roster_talent_self_read" ON public."agency_talent_roster"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = agency_talent_roster.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [5] agency_talent_skill_overrides.atso_select_own_talent (SELECT)
DROP POLICY IF EXISTS "atso_select_own_talent" ON public."agency_talent_skill_overrides";
CREATE POLICY "atso_select_own_talent" ON public."agency_talent_skill_overrides"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = agency_talent_skill_overrides.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [6] booking_commission_snapshot.booking_commission_snapshot_select_talent (SELECT)
DROP POLICY IF EXISTS "booking_commission_snapshot_select_talent" ON public."booking_commission_snapshot";
CREATE POLICY "booking_commission_snapshot_select_talent" ON public."booking_commission_snapshot"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (booking_talent bt
     JOIN talent_profiles tp ON ((tp.id = bt.talent_profile_id)))
  WHERE ((bt.booking_id = booking_commission_snapshot.booking_id) AND (tp.user_id = (select auth.uid()))))));

-- [7] booking_talent.booking_talent_client_select (SELECT)
DROP POLICY IF EXISTS "booking_talent_client_select" ON public."booking_talent";
CREATE POLICY "booking_talent_client_select" ON public."booking_talent"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM agency_bookings b
  WHERE ((b.id = booking_talent.booking_id) AND (((b.client_visible_at IS NOT NULL) AND ((b.client_user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
           FROM client_account_contacts c
          WHERE ((c.id = b.client_contact_id) AND (c.profile_user_id = (select auth.uid())) AND (c.archived_at IS NULL)))))) OR ((b.source_inquiry_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM inquiries i
          WHERE ((i.id = b.source_inquiry_id) AND (i.client_user_id = (select auth.uid())))))))))));

-- [8] booking_transactions.booking_transactions_payer_read (SELECT)
DROP POLICY IF EXISTS "booking_transactions_payer_read" ON public."booking_transactions";
CREATE POLICY "booking_transactions_payer_read" ON public."booking_transactions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((payer_user_id = (select auth.uid())));

-- [9] booking_transactions.booking_transactions_receiver_read (SELECT)
DROP POLICY IF EXISTS "booking_transactions_receiver_read" ON public."booking_transactions";
CREATE POLICY "booking_transactions_receiver_read" ON public."booking_transactions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((payout_receiver_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (payout_accounts pa
     LEFT JOIN talent_profiles tp ON (((pa.owner_type = 'talent'::text) AND (tp.id = pa.owner_id))))
  WHERE ((pa.id = booking_transactions.payout_receiver_id) AND (pa.tenant_id = booking_transactions.source_tenant_id) AND (((pa.owner_type = 'profile'::text) AND (pa.owner_id = (select auth.uid()))) OR ((pa.owner_type = 'talent'::text) AND (tp.user_id = (select auth.uid())))))))));

-- [10] client_balance_ledger.client_balance_ledger_self_read (SELECT)
DROP POLICY IF EXISTS "client_balance_ledger_self_read" ON public."client_balance_ledger";
CREATE POLICY "client_balance_ledger_self_read" ON public."client_balance_ledger"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM (agency_client_relationships acr
     JOIN client_profiles cp ON ((cp.id = acr.client_profile_id)))
  WHERE ((cp.user_id = (select auth.uid())) AND (acr.tenant_id = client_balance_ledger.tenant_id) AND (COALESCE(acr.status, 'active'::text) <> 'removed'::text))))));

-- [11] client_favorites.client_favorites_own_delete (DELETE)
DROP POLICY IF EXISTS "client_favorites_own_delete" ON public."client_favorites";
CREATE POLICY "client_favorites_own_delete" ON public."client_favorites"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((client_user_id = (select auth.uid())));

-- [12] client_favorites.client_favorites_own_insert (INSERT)
DROP POLICY IF EXISTS "client_favorites_own_insert" ON public."client_favorites";
CREATE POLICY "client_favorites_own_insert" ON public."client_favorites"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((client_user_id = (select auth.uid())));

-- [13] client_favorites.client_favorites_own_read (SELECT)
DROP POLICY IF EXISTS "client_favorites_own_read" ON public."client_favorites";
CREATE POLICY "client_favorites_own_read" ON public."client_favorites"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((client_user_id = (select auth.uid())));

-- [14] client_integrations.client_integrations_own_all (ALL)
DROP POLICY IF EXISTS "client_integrations_own_all" ON public."client_integrations";
CREATE POLICY "client_integrations_own_all" ON public."client_integrations"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((user_id = (select auth.uid())))
  WITH CHECK ((user_id = (select auth.uid())));

-- [15] client_profiles.client_profiles_select_own (SELECT)
DROP POLICY IF EXISTS "client_profiles_select_own" ON public."client_profiles";
CREATE POLICY "client_profiles_select_own" ON public."client_profiles"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((user_id = (select auth.uid())) OR is_agency_staff()));

-- [16] client_profiles.client_profiles_write_own (ALL)
DROP POLICY IF EXISTS "client_profiles_write_own" ON public."client_profiles";
CREATE POLICY "client_profiles_write_own" ON public."client_profiles"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((user_id = (select auth.uid())) OR is_agency_staff()))
  WITH CHECK (((user_id = (select auth.uid())) OR is_agency_staff()));

-- [17] client_reviews.client_reviews_author_insert (INSERT)
DROP POLICY IF EXISTS "client_reviews_author_insert" ON public."client_reviews";
CREATE POLICY "client_reviews_author_insert" ON public."client_reviews"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((author_user_id = (select auth.uid())));

-- [18] client_reviews.client_reviews_author_select (SELECT)
DROP POLICY IF EXISTS "client_reviews_author_select" ON public."client_reviews";
CREATE POLICY "client_reviews_author_select" ON public."client_reviews"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((author_user_id = (select auth.uid())));

-- [19] client_reviews.client_reviews_author_update (UPDATE)
DROP POLICY IF EXISTS "client_reviews_author_update" ON public."client_reviews";
CREATE POLICY "client_reviews_author_update" ON public."client_reviews"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((author_user_id = (select auth.uid())))
  WITH CHECK ((author_user_id = (select auth.uid())));

-- [20] client_reviews.client_reviews_subject_report (UPDATE)
DROP POLICY IF EXISTS "client_reviews_subject_report" ON public."client_reviews";
CREATE POLICY "client_reviews_subject_report" ON public."client_reviews"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((client_user_id = (select auth.uid())))
  WITH CHECK ((client_user_id = (select auth.uid())));

-- [21] client_reviews.client_reviews_subject_select (SELECT)
DROP POLICY IF EXISTS "client_reviews_subject_select" ON public."client_reviews";
CREATE POLICY "client_reviews_subject_select" ON public."client_reviews"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((client_user_id = (select auth.uid())) AND (status = 'published'::text)));

-- [22] client_shortlist_items.client_shortlist_items_via_shortlist_delete (DELETE)
DROP POLICY IF EXISTS "client_shortlist_items_via_shortlist_delete" ON public."client_shortlist_items";
CREATE POLICY "client_shortlist_items_via_shortlist_delete" ON public."client_shortlist_items"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM client_shortlists s
  WHERE ((s.id = client_shortlist_items.shortlist_id) AND (s.client_user_id = (select auth.uid()))))));

-- [23] client_shortlist_items.client_shortlist_items_via_shortlist_insert (INSERT)
DROP POLICY IF EXISTS "client_shortlist_items_via_shortlist_insert" ON public."client_shortlist_items";
CREATE POLICY "client_shortlist_items_via_shortlist_insert" ON public."client_shortlist_items"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM client_shortlists s
  WHERE ((s.id = client_shortlist_items.shortlist_id) AND (s.client_user_id = (select auth.uid()))))));

-- [24] client_shortlist_items.client_shortlist_items_via_shortlist_select (SELECT)
DROP POLICY IF EXISTS "client_shortlist_items_via_shortlist_select" ON public."client_shortlist_items";
CREATE POLICY "client_shortlist_items_via_shortlist_select" ON public."client_shortlist_items"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM client_shortlists s
  WHERE ((s.id = client_shortlist_items.shortlist_id) AND (s.client_user_id = (select auth.uid()))))));

-- [25] client_shortlists.client_shortlists_own_delete (DELETE)
DROP POLICY IF EXISTS "client_shortlists_own_delete" ON public."client_shortlists";
CREATE POLICY "client_shortlists_own_delete" ON public."client_shortlists"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((client_user_id = (select auth.uid())));

-- [26] client_shortlists.client_shortlists_own_insert (INSERT)
DROP POLICY IF EXISTS "client_shortlists_own_insert" ON public."client_shortlists";
CREATE POLICY "client_shortlists_own_insert" ON public."client_shortlists"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((client_user_id = (select auth.uid())));

-- [27] client_shortlists.client_shortlists_own_select (SELECT)
DROP POLICY IF EXISTS "client_shortlists_own_select" ON public."client_shortlists";
CREATE POLICY "client_shortlists_own_select" ON public."client_shortlists"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((client_user_id = (select auth.uid())));

-- [28] client_shortlists.client_shortlists_own_update (UPDATE)
DROP POLICY IF EXISTS "client_shortlists_own_update" ON public."client_shortlists";
CREATE POLICY "client_shortlists_own_update" ON public."client_shortlists"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((client_user_id = (select auth.uid())))
  WITH CHECK ((client_user_id = (select auth.uid())));

-- [29] client_stripe_customers.client_stripe_customers_self_read (SELECT)
DROP POLICY IF EXISTS "client_stripe_customers_self_read" ON public."client_stripe_customers";
CREATE POLICY "client_stripe_customers_self_read" ON public."client_stripe_customers"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((user_id = (select auth.uid())));

-- [30] client_subscriptions.client_subscriptions_own_select (SELECT)
DROP POLICY IF EXISTS "client_subscriptions_own_select" ON public."client_subscriptions";
CREATE POLICY "client_subscriptions_own_select" ON public."client_subscriptions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((client_user_id = (select auth.uid())));

-- [31] client_trust_state.client_trust_state_own_read (SELECT)
DROP POLICY IF EXISTS "client_trust_state_own_read" ON public."client_trust_state";
CREATE POLICY "client_trust_state_own_read" ON public."client_trust_state"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((user_id = (select auth.uid())));

-- [32] cms_collection_items.cms_collection_items_staff_rw (ALL)
DROP POLICY IF EXISTS "cms_collection_items_staff_rw" ON public."cms_collection_items";
CREATE POLICY "cms_collection_items_staff_rw" ON public."cms_collection_items"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM agency_memberships m
  WHERE ((m.tenant_id = cms_collection_items.tenant_id) AND (m.profile_id = (select auth.uid())) AND (m.status = 'active'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM agency_memberships m
  WHERE ((m.tenant_id = cms_collection_items.tenant_id) AND (m.profile_id = (select auth.uid())) AND (m.status = 'active'::text)))));

-- [33] cms_collections.cms_collections_staff_rw (ALL)
DROP POLICY IF EXISTS "cms_collections_staff_rw" ON public."cms_collections";
CREATE POLICY "cms_collections_staff_rw" ON public."cms_collections"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM agency_memberships m
  WHERE ((m.tenant_id = cms_collections.tenant_id) AND (m.profile_id = (select auth.uid())) AND (m.status = 'active'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM agency_memberships m
  WHERE ((m.tenant_id = cms_collections.tenant_id) AND (m.profile_id = (select auth.uid())) AND (m.status = 'active'::text)))));

-- [34] coordinator_join_requests.coord_request_insert (INSERT)
DROP POLICY IF EXISTS "coord_request_insert" ON public."coordinator_join_requests";
CREATE POLICY "coord_request_insert" ON public."coordinator_join_requests"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((requester_user_id = (select auth.uid())) AND (state = 'pending'::text) AND (EXISTS ( SELECT 1
   FROM inquiry_participants
  WHERE ((inquiry_participants.inquiry_id = coordinator_join_requests.inquiry_id) AND (inquiry_participants.user_id = (select auth.uid())) AND (inquiry_participants.role = 'talent'::inquiry_participant_role) AND (inquiry_participants.status = ANY (ARRAY['active'::inquiry_participant_status, 'invited'::inquiry_participant_status])))))));

-- [35] coordinator_join_requests.coord_request_select (SELECT)
DROP POLICY IF EXISTS "coord_request_select" ON public."coordinator_join_requests";
CREATE POLICY "coord_request_select" ON public."coordinator_join_requests"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((requester_user_id = (select auth.uid())) OR coord_request_can_approve(inquiry_id, (select auth.uid()))));

-- [36] email_suppressions.email_suppressions_self_select (SELECT)
DROP POLICY IF EXISTS "email_suppressions_self_select" ON public."email_suppressions";
CREATE POLICY "email_suppressions_self_select" ON public."email_suppressions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((user_id = (select auth.uid())));

-- [37] inquiries.inquiries_insert_client (INSERT)
DROP POLICY IF EXISTS "inquiries_insert_client" ON public."inquiries";
CREATE POLICY "inquiries_insert_client" ON public."inquiries"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((client_user_id = (select auth.uid())) OR (client_user_id IS NULL)));

-- [38] inquiries.inquiries_select_own (SELECT)
DROP POLICY IF EXISTS "inquiries_select_own" ON public."inquiries";
CREATE POLICY "inquiries_select_own" ON public."inquiries"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((client_user_id = (select auth.uid())));

-- [39] inquiries.inquiries_select_talent_participant (SELECT)
DROP POLICY IF EXISTS "inquiries_select_talent_participant" ON public."inquiries";
CREATE POLICY "inquiries_select_talent_participant" ON public."inquiries"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (inquiry_participants p
     JOIN talent_profiles tp ON ((tp.id = p.talent_profile_id)))
  WHERE ((p.inquiry_id = inquiries.id) AND (p.role = 'talent'::inquiry_participant_role) AND (tp.user_id = (select auth.uid()))))));

-- [40] inquiry_approvals.inquiry_approvals_coordinator_select (SELECT)
DROP POLICY IF EXISTS "inquiry_approvals_coordinator_select" ON public."inquiry_approvals";
CREATE POLICY "inquiry_approvals_coordinator_select" ON public."inquiry_approvals"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((is_agency_staff() OR (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_approvals.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.role = 'coordinator'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status))))));

-- [41] inquiry_approvals.inquiry_approvals_participant_select_own (SELECT)
DROP POLICY IF EXISTS "inquiry_approvals_participant_select_own" ON public."inquiry_approvals";
CREATE POLICY "inquiry_approvals_participant_select_own" ON public."inquiry_approvals"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.id = inquiry_approvals.participant_id) AND (p.user_id = (select auth.uid())) AND (p.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status]))))));

-- [42] inquiry_approvals.inquiry_approvals_participant_update_own (UPDATE)
DROP POLICY IF EXISTS "inquiry_approvals_participant_update_own" ON public."inquiry_approvals";
CREATE POLICY "inquiry_approvals_participant_update_own" ON public."inquiry_approvals"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.id = inquiry_approvals.participant_id) AND (p.user_id = (select auth.uid())) AND (p.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.id = inquiry_approvals.participant_id) AND (p.user_id = (select auth.uid())) AND (p.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status]))))));

-- [43] inquiry_attachments.inquiry_attachments_client_insert (INSERT)
DROP POLICY IF EXISTS "inquiry_attachments_client_insert" ON public."inquiry_attachments";
CREATE POLICY "inquiry_attachments_client_insert" ON public."inquiry_attachments"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((uploaded_by = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = inquiry_attachments.inquiry_id) AND (i.tenant_id = inquiry_attachments.tenant_id) AND (i.client_user_id = (select auth.uid())))))));

-- [44] inquiry_attachments.inquiry_attachments_client_select (SELECT)
DROP POLICY IF EXISTS "inquiry_attachments_client_select" ON public."inquiry_attachments";
CREATE POLICY "inquiry_attachments_client_select" ON public."inquiry_attachments"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = inquiry_attachments.inquiry_id) AND (i.tenant_id = inquiry_attachments.tenant_id) AND (i.client_user_id = (select auth.uid())))))));

-- [45] inquiry_attachments.inquiry_attachments_participant_select (SELECT)
DROP POLICY IF EXISTS "inquiry_attachments_participant_select" ON public."inquiry_attachments";
CREATE POLICY "inquiry_attachments_participant_select" ON public."inquiry_attachments"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((deleted_at IS NULL) AND (visibility = 'shared'::text) AND (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_attachments.inquiry_id) AND (p.tenant_id = inquiry_attachments.tenant_id) AND (p.user_id = (select auth.uid())) AND (p.removed_at IS NULL))))));

-- [46] inquiry_attachments.inquiry_attachments_uploader_softdel (UPDATE)
DROP POLICY IF EXISTS "inquiry_attachments_uploader_softdel" ON public."inquiry_attachments";
CREATE POLICY "inquiry_attachments_uploader_softdel" ON public."inquiry_attachments"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((uploaded_by = (select auth.uid())))
  WITH CHECK ((uploaded_by = (select auth.uid())));

-- [47] inquiry_audit_log.inquiry_audit_log_select (SELECT)
DROP POLICY IF EXISTS "inquiry_audit_log_select" ON public."inquiry_audit_log";
CREATE POLICY "inquiry_audit_log_select" ON public."inquiry_audit_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((EXISTS ( SELECT 1
   FROM agency_memberships
  WHERE ((agency_memberships.tenant_id = inquiry_audit_log.tenant_id) AND (agency_memberships.profile_id = (select auth.uid())) AND (agency_memberships.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_audit_log.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.status = ANY (ARRAY['active'::inquiry_participant_status, 'invited'::inquiry_participant_status])))))));

-- [48] inquiry_coordinators.inquiry_coordinators_select_visible (SELECT)
DROP POLICY IF EXISTS "inquiry_coordinators_select_visible" ON public."inquiry_coordinators";
CREATE POLICY "inquiry_coordinators_select_visible" ON public."inquiry_coordinators"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = inquiry_coordinators.inquiry_id) AND (i.client_user_id = (select auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM inquiry_participants ip
  WHERE ((ip.inquiry_id = inquiry_coordinators.inquiry_id) AND (ip.user_id = (select auth.uid())) AND (ip.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status])))))));

-- [49] inquiry_drafts.inquiry_drafts_owner (ALL)
DROP POLICY IF EXISTS "inquiry_drafts_owner" ON public."inquiry_drafts";
CREATE POLICY "inquiry_drafts_owner" ON public."inquiry_drafts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((requester_user_id = (select auth.uid())))
  WITH CHECK ((requester_user_id = (select auth.uid())));

-- [50] inquiry_events.inquiry_events_participant_read (SELECT)
DROP POLICY IF EXISTS "inquiry_events_participant_read" ON public."inquiry_events";
CREATE POLICY "inquiry_events_participant_read" ON public."inquiry_events"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((visibility = 'participants'::inquiry_event_visibility) AND (EXISTS ( SELECT 1
   FROM inquiry_participants ip
  WHERE ((ip.inquiry_id = inquiry_events.inquiry_id) AND (ip.user_id = (select auth.uid())) AND (ip.status = 'active'::inquiry_participant_status))))));

-- [51] inquiry_message_pins.inquiry_message_pins_delete (DELETE)
DROP POLICY IF EXISTS "inquiry_message_pins_delete" ON public."inquiry_message_pins";
CREATE POLICY "inquiry_message_pins_delete" ON public."inquiry_message_pins"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((is_staff_of_tenant(tenant_id) OR (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_message_pins.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status])))))));

-- [52] inquiry_message_pins.inquiry_message_pins_insert (INSERT)
DROP POLICY IF EXISTS "inquiry_message_pins_insert" ON public."inquiry_message_pins";
CREATE POLICY "inquiry_message_pins_insert" ON public."inquiry_message_pins"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((is_staff_of_tenant(tenant_id) OR (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_message_pins.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status])))))));

-- [53] inquiry_message_pins.inquiry_message_pins_select (SELECT)
DROP POLICY IF EXISTS "inquiry_message_pins_select" ON public."inquiry_message_pins";
CREATE POLICY "inquiry_message_pins_select" ON public."inquiry_message_pins"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((is_staff_of_tenant(tenant_id) OR (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_message_pins.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status])))))));

-- [54] inquiry_message_reads.inquiry_message_reads_participant_own (ALL)
DROP POLICY IF EXISTS "inquiry_message_reads_participant_own" ON public."inquiry_message_reads";
CREATE POLICY "inquiry_message_reads_participant_own" ON public."inquiry_message_reads"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((user_id = (select auth.uid())))
  WITH CHECK ((user_id = (select auth.uid())));

-- [55] inquiry_message_stars.inquiry_message_stars_delete_self (DELETE)
DROP POLICY IF EXISTS "inquiry_message_stars_delete_self" ON public."inquiry_message_stars";
CREATE POLICY "inquiry_message_stars_delete_self" ON public."inquiry_message_stars"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((user_id = (select auth.uid())));

-- [56] inquiry_message_stars.inquiry_message_stars_insert_self (INSERT)
DROP POLICY IF EXISTS "inquiry_message_stars_insert_self" ON public."inquiry_message_stars";
CREATE POLICY "inquiry_message_stars_insert_self" ON public."inquiry_message_stars"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_message_stars.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status])))))));

-- [57] inquiry_message_stars.inquiry_message_stars_select_self (SELECT)
DROP POLICY IF EXISTS "inquiry_message_stars_select_self" ON public."inquiry_message_stars";
CREATE POLICY "inquiry_message_stars_select_self" ON public."inquiry_message_stars"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((user_id = (select auth.uid())));

-- [58] inquiry_messages.inquiry_messages_group_insert_participant (INSERT)
DROP POLICY IF EXISTS "inquiry_messages_group_insert_participant" ON public."inquiry_messages";
CREATE POLICY "inquiry_messages_group_insert_participant" ON public."inquiry_messages"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((thread_type = 'group'::inquiry_thread_type) AND (sender_user_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_messages.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.status = ANY (ARRAY['active'::inquiry_participant_status, 'invited'::inquiry_participant_status])) AND (p.role <> 'client'::inquiry_participant_role))))));

-- [59] inquiry_messages.inquiry_messages_group_select_participant (SELECT)
DROP POLICY IF EXISTS "inquiry_messages_group_select_participant" ON public."inquiry_messages";
CREATE POLICY "inquiry_messages_group_select_participant" ON public."inquiry_messages"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((thread_type = 'group'::inquiry_thread_type) AND (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_messages.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.status = ANY (ARRAY['active'::inquiry_participant_status, 'invited'::inquiry_participant_status])) AND (p.role <> 'client'::inquiry_participant_role))))));

-- [60] inquiry_messages.inquiry_messages_private_insert_participant_v2 (INSERT)
DROP POLICY IF EXISTS "inquiry_messages_private_insert_participant_v2" ON public."inquiry_messages";
CREATE POLICY "inquiry_messages_private_insert_participant_v2" ON public."inquiry_messages"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((thread_type = 'private'::inquiry_thread_type) AND (sender_user_id = (select auth.uid())) AND ((EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_messages.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.role = ANY (ARRAY['client'::inquiry_participant_role, 'coordinator'::inquiry_participant_role])) AND (p.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status]))))) OR (EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = inquiry_messages.inquiry_id) AND (i.client_user_id = (select auth.uid()))))))));

-- [61] inquiry_messages.inquiry_messages_private_select_participant_v2 (SELECT)
DROP POLICY IF EXISTS "inquiry_messages_private_select_participant_v2" ON public."inquiry_messages";
CREATE POLICY "inquiry_messages_private_select_participant_v2" ON public."inquiry_messages"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((thread_type = 'private'::inquiry_thread_type) AND ((EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_messages.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.role = ANY (ARRAY['client'::inquiry_participant_role, 'coordinator'::inquiry_participant_role])) AND (p.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status]))))) OR (EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = inquiry_messages.inquiry_id) AND (i.client_user_id = (select auth.uid()))))))));

-- [62] inquiry_messages.inquiry_messages_update_own (UPDATE)
DROP POLICY IF EXISTS "inquiry_messages_update_own" ON public."inquiry_messages";
CREATE POLICY "inquiry_messages_update_own" ON public."inquiry_messages"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((sender_user_id = (select auth.uid())) AND (deleted_at IS NULL)))
  WITH CHECK ((sender_user_id = (select auth.uid())));

-- [63] inquiry_offer_line_items.inquiry_offer_line_items_client_select (SELECT)
DROP POLICY IF EXISTS "inquiry_offer_line_items_client_select" ON public."inquiry_offer_line_items";
CREATE POLICY "inquiry_offer_line_items_client_select" ON public."inquiry_offer_line_items"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (inquiry_offers o
     JOIN inquiry_participants p ON ((p.inquiry_id = o.inquiry_id)))
  WHERE ((o.id = inquiry_offer_line_items.offer_id) AND (o.status = ANY (ARRAY['sent'::inquiry_offer_status, 'accepted'::inquiry_offer_status])) AND (p.user_id = (select auth.uid())) AND (p.role = 'client'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status)))));

-- [64] inquiry_offer_line_items.inquiry_offer_line_items_coordinator_select (SELECT)
DROP POLICY IF EXISTS "inquiry_offer_line_items_coordinator_select" ON public."inquiry_offer_line_items";
CREATE POLICY "inquiry_offer_line_items_coordinator_select" ON public."inquiry_offer_line_items"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((is_agency_staff() OR (EXISTS ( SELECT 1
   FROM (inquiry_offers o
     JOIN inquiry_participants p ON ((p.inquiry_id = o.inquiry_id)))
  WHERE ((o.id = inquiry_offer_line_items.offer_id) AND (p.user_id = (select auth.uid())) AND (p.role = 'coordinator'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status))))));

-- [65] inquiry_offer_line_items.inquiry_offer_line_items_coordinator_write (ALL)
DROP POLICY IF EXISTS "inquiry_offer_line_items_coordinator_write" ON public."inquiry_offer_line_items";
CREATE POLICY "inquiry_offer_line_items_coordinator_write" ON public."inquiry_offer_line_items"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((is_agency_staff() OR (EXISTS ( SELECT 1
   FROM (inquiry_offers o
     JOIN inquiry_participants p ON ((p.inquiry_id = o.inquiry_id)))
  WHERE ((o.id = inquiry_offer_line_items.offer_id) AND (p.user_id = (select auth.uid())) AND (p.role = 'coordinator'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status))))))
  WITH CHECK ((is_agency_staff() OR (EXISTS ( SELECT 1
   FROM (inquiry_offers o
     JOIN inquiry_participants p ON ((p.inquiry_id = o.inquiry_id)))
  WHERE ((o.id = inquiry_offer_line_items.offer_id) AND (p.user_id = (select auth.uid())) AND (p.role = 'coordinator'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status))))));

-- [66] inquiry_offers.inquiry_offers_client_select (SELECT)
DROP POLICY IF EXISTS "inquiry_offers_client_select" ON public."inquiry_offers";
CREATE POLICY "inquiry_offers_client_select" ON public."inquiry_offers"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((status = ANY (ARRAY['sent'::inquiry_offer_status, 'accepted'::inquiry_offer_status])) AND (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_offers.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.role = 'client'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status))))));

-- [67] inquiry_offers.inquiry_offers_coordinator_select (SELECT)
DROP POLICY IF EXISTS "inquiry_offers_coordinator_select" ON public."inquiry_offers";
CREATE POLICY "inquiry_offers_coordinator_select" ON public."inquiry_offers"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((is_agency_staff() OR (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_offers.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.role = 'coordinator'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status))))));

-- [68] inquiry_offers.inquiry_offers_coordinator_update (UPDATE)
DROP POLICY IF EXISTS "inquiry_offers_coordinator_update" ON public."inquiry_offers";
CREATE POLICY "inquiry_offers_coordinator_update" ON public."inquiry_offers"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((is_agency_staff() OR (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_offers.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.role = 'coordinator'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status))))))
  WITH CHECK ((is_agency_staff() OR (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_offers.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.role = 'coordinator'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status))))));

-- [69] inquiry_offers.inquiry_offers_coordinator_write (INSERT)
DROP POLICY IF EXISTS "inquiry_offers_coordinator_write" ON public."inquiry_offers";
CREATE POLICY "inquiry_offers_coordinator_write" ON public."inquiry_offers"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((is_agency_staff() OR (EXISTS ( SELECT 1
   FROM inquiry_participants p
  WHERE ((p.inquiry_id = inquiry_offers.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.role = 'coordinator'::inquiry_participant_role) AND (p.status = 'active'::inquiry_participant_status))))));

-- [70] inquiry_participants.inquiry_participants_client_select (SELECT)
DROP POLICY IF EXISTS "inquiry_participants_client_select" ON public."inquiry_participants";
CREATE POLICY "inquiry_participants_client_select" ON public."inquiry_participants"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((user_id = (select auth.uid())) AND (role = 'client'::inquiry_participant_role)));

-- [71] inquiry_participants.inquiry_participants_own_coordinator_select (SELECT)
DROP POLICY IF EXISTS "inquiry_participants_own_coordinator_select" ON public."inquiry_participants";
CREATE POLICY "inquiry_participants_own_coordinator_select" ON public."inquiry_participants"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((user_id = (select auth.uid())) AND (role = 'coordinator'::inquiry_participant_role)));

-- [72] inquiry_participants.inquiry_participants_talent_select (SELECT)
DROP POLICY IF EXISTS "inquiry_participants_talent_select" ON public."inquiry_participants";
CREATE POLICY "inquiry_participants_talent_select" ON public."inquiry_participants"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = inquiry_participants.talent_profile_id) AND (tp.user_id = (select auth.uid()))))) AND (role = 'talent'::inquiry_participant_role)));

-- [73] inquiry_reports.inquiry_reports_self (SELECT)
DROP POLICY IF EXISTS "inquiry_reports_self" ON public."inquiry_reports";
CREATE POLICY "inquiry_reports_self" ON public."inquiry_reports"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((reporter_user_id = (select auth.uid())));

-- [74] inquiry_requirement_groups.inquiry_requirement_groups_select_visible (SELECT)
DROP POLICY IF EXISTS "inquiry_requirement_groups_select_visible" ON public."inquiry_requirement_groups";
CREATE POLICY "inquiry_requirement_groups_select_visible" ON public."inquiry_requirement_groups"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = inquiry_requirement_groups.inquiry_id) AND (i.client_user_id = (select auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM inquiry_participants ip
  WHERE ((ip.inquiry_id = inquiry_requirement_groups.inquiry_id) AND (ip.user_id = (select auth.uid())) AND (ip.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status])))))));

-- [75] inquiry_user_flags.inquiry_user_flags_self (ALL)
DROP POLICY IF EXISTS "inquiry_user_flags_self" ON public."inquiry_user_flags";
CREATE POLICY "inquiry_user_flags_self" ON public."inquiry_user_flags"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((profile_id = (select auth.uid())))
  WITH CHECK ((profile_id = (select auth.uid())));

-- [76] media_asset_activity.media_asset_activity_tenant_read (SELECT)
DROP POLICY IF EXISTS "media_asset_activity_tenant_read" ON public."media_asset_activity";
CREATE POLICY "media_asset_activity_tenant_read" ON public."media_asset_activity"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((tenant_id IN ( SELECT agency_memberships.tenant_id
   FROM agency_memberships
  WHERE (agency_memberships.profile_id = (select auth.uid())))));

-- [77] media_assets.media_assets_tenant_staff_all (ALL)
DROP POLICY IF EXISTS "media_assets_tenant_staff_all" ON public."media_assets";
CREATE POLICY "media_assets_tenant_staff_all" ON public."media_assets"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((purpose <> 'talent'::media_purpose) AND ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.app_role = 'super_admin'::app_role)))) OR (EXISTS ( SELECT 1
   FROM agency_memberships m
  WHERE ((m.profile_id = (select auth.uid())) AND (m.tenant_id = media_assets.tenant_id) AND (m.status = ANY (ARRAY['active'::text, 'pending_acceptance'::text]))))))))
  WITH CHECK (((purpose <> 'talent'::media_purpose) AND ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.app_role = 'super_admin'::app_role)))) OR (EXISTS ( SELECT 1
   FROM agency_memberships m
  WHERE ((m.profile_id = (select auth.uid())) AND (m.tenant_id = media_assets.tenant_id) AND (m.status = ANY (ARRAY['active'::text, 'pending_acceptance'::text]))))))));

-- [78] media_assets.media_select (SELECT)
DROP POLICY IF EXISTS "media_select" ON public."media_assets";
CREATE POLICY "media_select" ON public."media_assets"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((deleted_at IS NULL) AND ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.app_role = 'super_admin'::app_role)))) OR (EXISTS ( SELECT 1
   FROM agency_memberships m
  WHERE ((m.profile_id = (select auth.uid())) AND (m.tenant_id = media_assets.tenant_id) AND (m.status = ANY (ARRAY['active'::text, 'pending_acceptance'::text]))))) OR (EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = media_assets.owner_talent_profile_id) AND (t.user_id = (select auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = media_assets.owner_talent_profile_id) AND (t.workflow_status = 'approved'::profile_workflow_status) AND (t.visibility = 'public'::visibility) AND (media_assets.approval_state = 'approved'::media_approval_state) AND (media_assets.variant_kind <> 'original'::media_variant_kind)))))));

-- [79] media_assets.media_update_talent (UPDATE)
DROP POLICY IF EXISTS "media_update_talent" ON public."media_assets";
CREATE POLICY "media_update_talent" ON public."media_assets"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = media_assets.owner_talent_profile_id) AND (t.user_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = media_assets.owner_talent_profile_id) AND (t.user_id = (select auth.uid()))))));

-- [80] media_assets.media_write_staff (ALL)
DROP POLICY IF EXISTS "media_write_staff" ON public."media_assets";
CREATE POLICY "media_write_staff" ON public."media_assets"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.app_role = 'super_admin'::app_role)))) OR (EXISTS ( SELECT 1
   FROM agency_memberships m
  WHERE ((m.profile_id = (select auth.uid())) AND (m.tenant_id = media_assets.tenant_id) AND (m.status = ANY (ARRAY['active'::text, 'pending_acceptance'::text])))))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.app_role = 'super_admin'::app_role)))) OR (EXISTS ( SELECT 1
   FROM agency_memberships m
  WHERE ((m.profile_id = (select auth.uid())) AND (m.tenant_id = media_assets.tenant_id) AND (m.status = ANY (ARRAY['active'::text, 'pending_acceptance'::text])))))));

-- [81] media_assets.media_write_talent (INSERT)
DROP POLICY IF EXISTS "media_write_talent" ON public."media_assets";
CREATE POLICY "media_write_talent" ON public."media_assets"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = media_assets.owner_talent_profile_id) AND (t.user_id = (select auth.uid()))))));

-- [82] media_folder_items.media_folder_items_tenant_isolation (ALL)
DROP POLICY IF EXISTS "media_folder_items_tenant_isolation" ON public."media_folder_items";
CREATE POLICY "media_folder_items_tenant_isolation" ON public."media_folder_items"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((folder_id IN ( SELECT media_folders.id
   FROM media_folders
  WHERE (media_folders.tenant_id IN ( SELECT agency_memberships.tenant_id
           FROM agency_memberships
          WHERE (agency_memberships.profile_id = (select auth.uid())))))));

-- [83] media_folders.media_folders_tenant_isolation (ALL)
DROP POLICY IF EXISTS "media_folders_tenant_isolation" ON public."media_folders";
CREATE POLICY "media_folders_tenant_isolation" ON public."media_folders"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((tenant_id IN ( SELECT agency_memberships.tenant_id
   FROM agency_memberships
  WHERE (agency_memberships.profile_id = (select auth.uid())))));

-- [84] message_reactions.message_reactions_delete (DELETE)
DROP POLICY IF EXISTS "message_reactions_delete" ON public."message_reactions";
CREATE POLICY "message_reactions_delete" ON public."message_reactions"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((user_id = (select auth.uid())));

-- [85] message_reactions.message_reactions_insert (INSERT)
DROP POLICY IF EXISTS "message_reactions_insert" ON public."message_reactions";
CREATE POLICY "message_reactions_insert" ON public."message_reactions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM (inquiry_messages m
     JOIN inquiry_participants p ON (((p.inquiry_id = m.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.status = ANY (ARRAY['active'::inquiry_participant_status, 'invited'::inquiry_participant_status])))))
  WHERE ((m.id = message_reactions.message_id) AND (((m.thread_type = 'group'::inquiry_thread_type) AND (p.role <> 'client'::inquiry_participant_role)) OR ((m.thread_type = 'private'::inquiry_thread_type) AND (p.role = ANY (ARRAY['client'::inquiry_participant_role, 'coordinator'::inquiry_participant_role])))))))));

-- [86] message_reactions.message_reactions_select (SELECT)
DROP POLICY IF EXISTS "message_reactions_select" ON public."message_reactions";
CREATE POLICY "message_reactions_select" ON public."message_reactions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (inquiry_messages m
     JOIN inquiry_participants p ON (((p.inquiry_id = m.inquiry_id) AND (p.user_id = (select auth.uid())) AND (p.status = ANY (ARRAY['active'::inquiry_participant_status, 'invited'::inquiry_participant_status])))))
  WHERE (m.id = message_reactions.message_id))));

-- [87] notification_dispatch_log.ndl_select_self (SELECT)
DROP POLICY IF EXISTS "ndl_select_self" ON public."notification_dispatch_log";
CREATE POLICY "ndl_select_self" ON public."notification_dispatch_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((recipient_user_id = (select auth.uid())));

-- [88] notifications.notifications_own (ALL)
DROP POLICY IF EXISTS "notifications_own" ON public."notifications";
CREATE POLICY "notifications_own" ON public."notifications"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((user_id = (select auth.uid())))
  WITH CHECK ((user_id = (select auth.uid())));

-- [89] parent_category_field_groups.pcfg_select_authenticated (SELECT)
DROP POLICY IF EXISTS "pcfg_select_authenticated" ON public."parent_category_field_groups";
CREATE POLICY "pcfg_select_authenticated" ON public."parent_category_field_groups"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((select auth.uid()) IS NOT NULL));

-- [90] pitch_attachments.pitch_attachments_recipient_select (SELECT)
DROP POLICY IF EXISTS "pitch_attachments_recipient_select" ON public."pitch_attachments";
CREATE POLICY "pitch_attachments_recipient_select" ON public."pitch_attachments"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_attachments.pitch_id) AND (p.recipient_user_id = (select auth.uid())) AND (p.status <> ALL (ARRAY['draft'::pitch_status, 'cancelled'::pitch_status])))))));

-- [91] pitch_talents.pitch_talents_recipient_select (SELECT)
DROP POLICY IF EXISTS "pitch_talents_recipient_select" ON public."pitch_talents";
CREATE POLICY "pitch_talents_recipient_select" ON public."pitch_talents"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_talents.pitch_id) AND (p.recipient_user_id = (select auth.uid())) AND (p.status <> ALL (ARRAY['draft'::pitch_status, 'cancelled'::pitch_status]))))));

-- [92] pitches.pitches_recipient_select (SELECT)
DROP POLICY IF EXISTS "pitches_recipient_select" ON public."pitches";
CREATE POLICY "pitches_recipient_select" ON public."pitches"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((recipient_user_id = (select auth.uid())) AND (status <> ALL (ARRAY['draft'::pitch_status, 'cancelled'::pitch_status]))));

-- [93] platform_audit_log.platform_audit_log_super_admin_select (SELECT)
DROP POLICY IF EXISTS "platform_audit_log_super_admin_select" ON public."platform_audit_log";
CREATE POLICY "platform_audit_log_super_admin_select" ON public."platform_audit_log"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.app_role = 'super_admin'::app_role)))));

-- [94] platform_media_settings.platform_media_settings_super_admin_all (ALL)
DROP POLICY IF EXISTS "platform_media_settings_super_admin_all" ON public."platform_media_settings";
CREATE POLICY "platform_media_settings_super_admin_all" ON public."platform_media_settings"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.app_role = 'super_admin'::app_role)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.app_role = 'super_admin'::app_role)))));

-- [95] profile_field_groups.pfg_select_authenticated (SELECT)
DROP POLICY IF EXISTS "pfg_select_authenticated" ON public."profile_field_groups";
CREATE POLICY "pfg_select_authenticated" ON public."profile_field_groups"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((select auth.uid()) IS NOT NULL));

-- [96] profile_revisions.revisions_insert_talent (INSERT)
DROP POLICY IF EXISTS "revisions_insert_talent" ON public."profile_revisions";
CREATE POLICY "revisions_insert_talent" ON public."profile_revisions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = profile_revisions.talent_profile_id) AND (t.user_id = (select auth.uid()))))));

-- [97] profile_revisions.revisions_select (SELECT)
DROP POLICY IF EXISTS "revisions_select" ON public."profile_revisions";
CREATE POLICY "revisions_select" ON public."profile_revisions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((is_agency_staff() OR (EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = profile_revisions.talent_profile_id) AND (t.user_id = (select auth.uid())))))));

-- [98] profiles.profiles_select_self_or_staff (SELECT)
DROP POLICY IF EXISTS "profiles_select_self_or_staff" ON public."profiles";
CREATE POLICY "profiles_select_self_or_staff" ON public."profiles"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((id = (select auth.uid())) OR is_agency_staff()));

-- [99] profiles.profiles_update_self_or_staff (UPDATE)
DROP POLICY IF EXISTS "profiles_update_self_or_staff" ON public."profiles";
CREATE POLICY "profiles_update_self_or_staff" ON public."profiles"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((id = (select auth.uid())) OR is_agency_staff()));

-- [100] requirement_role_keys.requirement_role_keys_admin_write (ALL)
DROP POLICY IF EXISTS "requirement_role_keys_admin_write" ON public."requirement_role_keys";
CREATE POLICY "requirement_role_keys_admin_write" ON public."requirement_role_keys"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.app_role = 'super_admin'::app_role)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.app_role = 'super_admin'::app_role)))));

-- [101] requirement_role_keys.requirement_role_keys_authenticated_read (SELECT)
DROP POLICY IF EXISTS "requirement_role_keys_authenticated_read" ON public."requirement_role_keys";
CREATE POLICY "requirement_role_keys_authenticated_read" ON public."requirement_role_keys"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((select auth.uid()) IS NOT NULL));

-- [102] saved_talent.saved_delete_own (DELETE)
DROP POLICY IF EXISTS "saved_delete_own" ON public."saved_talent";
CREATE POLICY "saved_delete_own" ON public."saved_talent"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((client_user_id = (select auth.uid())) OR ((tenant_id IS NOT NULL) AND is_staff_of_tenant(tenant_id))));

-- [103] saved_talent.saved_insert_own (INSERT)
DROP POLICY IF EXISTS "saved_insert_own" ON public."saved_talent";
CREATE POLICY "saved_insert_own" ON public."saved_talent"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((client_user_id = (select auth.uid())));

-- [104] saved_talent.saved_select_own (SELECT)
DROP POLICY IF EXISTS "saved_select_own" ON public."saved_talent";
CREATE POLICY "saved_select_own" ON public."saved_talent"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((client_user_id = (select auth.uid())) OR ((tenant_id IS NOT NULL) AND is_staff_of_tenant(tenant_id))));

-- [105] talent_agency_applications.taa_talent_insert (INSERT)
DROP POLICY IF EXISTS "taa_talent_insert" ON public."talent_agency_applications";
CREATE POLICY "taa_talent_insert" ON public."talent_agency_applications"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((status = 'pending'::talent_application_status) AND (EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_agency_applications.talent_profile_id) AND (tp.user_id = (select auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM agencies a
  WHERE ((a.id = talent_agency_applications.tenant_id) AND (a.accepts_open_applications = true)))) AND (NOT (EXISTS ( SELECT 1
   FROM agency_talent_roster r
  WHERE ((r.talent_profile_id = talent_agency_applications.talent_profile_id) AND (r.exclusivity_status = ANY (ARRAY['confirmed'::exclusivity_status, 'auto_assigned'::exclusivity_status])) AND (r.status <> ALL (ARRAY['removed'::text, 'rejected'::text]))))))));

-- [106] talent_agency_applications.taa_talent_select (SELECT)
DROP POLICY IF EXISTS "taa_talent_select" ON public."talent_agency_applications";
CREATE POLICY "taa_talent_select" ON public."talent_agency_applications"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_agency_applications.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [107] talent_agency_applications.taa_talent_withdraw (UPDATE)
DROP POLICY IF EXISTS "taa_talent_withdraw" ON public."talent_agency_applications";
CREATE POLICY "taa_talent_withdraw" ON public."talent_agency_applications"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_agency_applications.talent_profile_id) AND (tp.user_id = (select auth.uid()))))) AND (status = 'pending'::talent_application_status)))
  WITH CHECK ((status = 'withdrawn'::talent_application_status));

-- [108] talent_agency_data_grants.tadg_all_own_talent (ALL)
DROP POLICY IF EXISTS "tadg_all_own_talent" ON public."talent_agency_data_grants";
CREATE POLICY "tadg_all_own_talent" ON public."talent_agency_data_grants"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_agency_data_grants.talent_profile_id) AND (tp.user_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_agency_data_grants.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [109] talent_agency_permission_requests.tapr_select_own_talent (SELECT)
DROP POLICY IF EXISTS "tapr_select_own_talent" ON public."talent_agency_permission_requests";
CREATE POLICY "tapr_select_own_talent" ON public."talent_agency_permission_requests"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_agency_permission_requests.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [110] talent_agency_permission_requests.tapr_update_own_talent (UPDATE)
DROP POLICY IF EXISTS "tapr_update_own_talent" ON public."talent_agency_permission_requests";
CREATE POLICY "tapr_update_own_talent" ON public."talent_agency_permission_requests"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_agency_permission_requests.talent_profile_id) AND (tp.user_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_agency_permission_requests.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [111] talent_availability_blocks.talent_blocks_self_full (ALL)
DROP POLICY IF EXISTS "talent_blocks_self_full" ON public."talent_availability_blocks";
CREATE POLICY "talent_blocks_self_full" ON public."talent_availability_blocks"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_availability_blocks.talent_profile_id) AND (tp.user_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_availability_blocks.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [112] talent_bookings.talent_bookings_select_client (SELECT)
DROP POLICY IF EXISTS "talent_bookings_select_client" ON public."talent_bookings";
CREATE POLICY "talent_bookings_select_client" ON public."talent_bookings"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((inquiry_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = talent_bookings.inquiry_id) AND (i.client_user_id = (select auth.uid())))))));

-- [113] talent_bookings.talent_bookings_select_self (SELECT)
DROP POLICY IF EXISTS "talent_bookings_select_self" ON public."talent_bookings";
CREATE POLICY "talent_bookings_select_self" ON public."talent_bookings"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_bookings.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [114] talent_contact_preferences.talent_contact_prefs_own (ALL)
DROP POLICY IF EXISTS "talent_contact_prefs_own" ON public."talent_contact_preferences";
CREATE POLICY "talent_contact_prefs_own" ON public."talent_contact_preferences"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (talent_profiles tp
     JOIN agency_talent_roster atr ON (((atr.talent_profile_id = tp.id) AND (atr.tenant_id = talent_contact_preferences.tenant_id) AND (atr.status <> 'removed'::text))))
  WHERE ((tp.id = talent_contact_preferences.talent_profile_id) AND (tp.user_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (talent_profiles tp
     JOIN agency_talent_roster atr ON (((atr.talent_profile_id = tp.id) AND (atr.tenant_id = talent_contact_preferences.tenant_id) AND (atr.status <> 'removed'::text))))
  WHERE ((tp.id = talent_contact_preferences.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [115] talent_holds.talent_holds_select_self (SELECT)
DROP POLICY IF EXISTS "talent_holds_select_self" ON public."talent_holds";
CREATE POLICY "talent_holds_select_self" ON public."talent_holds"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_holds.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [116] talent_hub_applications.tha_talent_insert (INSERT)
DROP POLICY IF EXISTS "tha_talent_insert" ON public."talent_hub_applications";
CREATE POLICY "tha_talent_insert" ON public."talent_hub_applications"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((status = 'pending'::talent_application_status) AND (EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_hub_applications.talent_profile_id) AND (tp.user_id = (select auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM agency_domains ad
  WHERE ((ad.tenant_id = talent_hub_applications.tenant_id) AND (ad.kind = 'hub'::text)))) AND (NOT (EXISTS ( SELECT 1
   FROM agency_talent_roster r
  WHERE ((r.talent_profile_id = talent_hub_applications.talent_profile_id) AND (r.exclusivity_status = ANY (ARRAY['confirmed'::exclusivity_status, 'auto_assigned'::exclusivity_status])) AND (r.status <> ALL (ARRAY['removed'::text, 'rejected'::text]))))))));

-- [117] talent_hub_applications.tha_talent_select (SELECT)
DROP POLICY IF EXISTS "tha_talent_select" ON public."talent_hub_applications";
CREATE POLICY "tha_talent_select" ON public."talent_hub_applications"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_hub_applications.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [118] talent_hub_applications.tha_talent_withdraw (UPDATE)
DROP POLICY IF EXISTS "tha_talent_withdraw" ON public."talent_hub_applications";
CREATE POLICY "tha_talent_withdraw" ON public."talent_hub_applications"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_hub_applications.talent_profile_id) AND (tp.user_id = (select auth.uid()))))) AND (status = 'pending'::talent_application_status)))
  WITH CHECK ((status = 'withdrawn'::talent_application_status));

-- [119] talent_integration_items.talent_integration_items_own_all (ALL)
DROP POLICY IF EXISTS "talent_integration_items_own_all" ON public."talent_integration_items";
CREATE POLICY "talent_integration_items_own_all" ON public."talent_integration_items"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_integration_items.talent_profile_id) AND (tp.user_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_integration_items.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [120] talent_integrations.talent_integrations_own_all (ALL)
DROP POLICY IF EXISTS "talent_integrations_own_all" ON public."talent_integrations";
CREATE POLICY "talent_integrations_own_all" ON public."talent_integrations"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_integrations.talent_profile_id) AND (tp.user_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_integrations.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [121] talent_languages.talent_languages_select_own (SELECT)
DROP POLICY IF EXISTS "talent_languages_select_own" ON public."talent_languages";
CREATE POLICY "talent_languages_select_own" ON public."talent_languages"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_languages.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [122] talent_languages.talent_languages_write_own_or_staff (ALL)
DROP POLICY IF EXISTS "talent_languages_write_own_or_staff" ON public."talent_languages";
CREATE POLICY "talent_languages_write_own_or_staff" ON public."talent_languages"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((((tenant_id IS NOT NULL) AND is_staff_of_tenant(tenant_id)) OR (EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_languages.talent_profile_id) AND (tp.user_id = (select auth.uid())))))))
  WITH CHECK ((((tenant_id IS NOT NULL) AND is_staff_of_tenant(tenant_id)) OR (EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_languages.talent_profile_id) AND (tp.user_id = (select auth.uid())))))));

-- [123] talent_page_revisions.talent_page_revisions_owner (ALL)
DROP POLICY IF EXISTS "talent_page_revisions_owner" ON public."talent_page_revisions";
CREATE POLICY "talent_page_revisions_owner" ON public."talent_page_revisions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (talent_pages p
     JOIN talent_profiles tp ON ((tp.id = p.talent_profile_id)))
  WHERE ((p.id = talent_page_revisions.page_id) AND (tp.user_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (talent_pages p
     JOIN talent_profiles tp ON ((tp.id = p.talent_profile_id)))
  WHERE ((p.id = talent_page_revisions.page_id) AND (tp.user_id = (select auth.uid()))))));

-- [124] talent_pages.talent_pages_owner (ALL)
DROP POLICY IF EXISTS "talent_pages_owner" ON public."talent_pages";
CREATE POLICY "talent_pages_owner" ON public."talent_pages"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_pages.talent_profile_id) AND (tp.user_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_pages.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [125] talent_plan_overrides.talent_plan_overrides_self_read (SELECT)
DROP POLICY IF EXISTS "talent_plan_overrides_self_read" ON public."talent_plan_overrides";
CREATE POLICY "talent_plan_overrides_self_read" ON public."talent_plan_overrides"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((talent_profile_id IN ( SELECT talent_profiles.id
   FROM talent_profiles
  WHERE (talent_profiles.user_id = (select auth.uid())))));

-- [126] talent_profile_change_requests.profile_change_requests_talent_self_select (SELECT)
DROP POLICY IF EXISTS "profile_change_requests_talent_self_select" ON public."talent_profile_change_requests";
CREATE POLICY "profile_change_requests_talent_self_select" ON public."talent_profile_change_requests"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_profile_change_requests.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [127] talent_profile_external_calendars.tpec_all_own_talent (ALL)
DROP POLICY IF EXISTS "tpec_all_own_talent" ON public."talent_profile_external_calendars";
CREATE POLICY "tpec_all_own_talent" ON public."talent_profile_external_calendars"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_profile_external_calendars.talent_profile_id) AND (tp.user_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_profile_external_calendars.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [128] talent_profile_field_values.tpfv_select_own (SELECT)
DROP POLICY IF EXISTS "tpfv_select_own" ON public."talent_profile_field_values";
CREATE POLICY "tpfv_select_own" ON public."talent_profile_field_values"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_profile_field_values.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [129] talent_profile_field_values.tpfv_write_own_or_staff (ALL)
DROP POLICY IF EXISTS "tpfv_write_own_or_staff" ON public."talent_profile_field_values";
CREATE POLICY "tpfv_write_own_or_staff" ON public."talent_profile_field_values"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((((tenant_id IS NOT NULL) AND is_staff_of_tenant(tenant_id)) OR (EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_profile_field_values.talent_profile_id) AND (tp.user_id = (select auth.uid())))))))
  WITH CHECK ((((tenant_id IS NOT NULL) AND is_staff_of_tenant(tenant_id)) OR (EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_profile_field_values.talent_profile_id) AND (tp.user_id = (select auth.uid())))))));

-- [130] talent_profile_taxonomy.talent_taxonomy_select (SELECT)
DROP POLICY IF EXISTS "talent_taxonomy_select" ON public."talent_profile_taxonomy";
CREATE POLICY "talent_taxonomy_select" ON public."talent_profile_taxonomy"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = talent_profile_taxonomy.talent_profile_id) AND (t.deleted_at IS NULL) AND (((t.is_publicly_hidden = false) AND talent_is_site_visible_anywhere(t.id)) OR (t.user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
           FROM agency_talent_roster atr
          WHERE ((atr.talent_profile_id = t.id) AND is_staff_of_tenant(atr.tenant_id)))))))));

-- [131] talent_profile_taxonomy.talent_taxonomy_write_own_talent (ALL)
DROP POLICY IF EXISTS "talent_taxonomy_write_own_talent" ON public."talent_profile_taxonomy";
CREATE POLICY "talent_taxonomy_write_own_talent" ON public."talent_profile_taxonomy"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = talent_profile_taxonomy.talent_profile_id) AND (t.user_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = talent_profile_taxonomy.talent_profile_id) AND (t.user_id = (select auth.uid()))))));

-- [132] talent_profile_taxonomy.tpt_agency_roster_all (ALL)
DROP POLICY IF EXISTS "tpt_agency_roster_all" ON public."talent_profile_taxonomy";
CREATE POLICY "tpt_agency_roster_all" ON public."talent_profile_taxonomy"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((talent_profile_id IN ( SELECT atr.talent_profile_id
   FROM (agency_talent_roster atr
     JOIN agency_memberships atm ON ((atm.tenant_id = atr.tenant_id)))
  WHERE ((atm.profile_id = (select auth.uid())) AND (atm.status = 'active'::text) AND (atr.status = ANY (ARRAY['active'::text, 'pending'::text]))))))
  WITH CHECK ((talent_profile_id IN ( SELECT atr.talent_profile_id
   FROM (agency_talent_roster atr
     JOIN agency_memberships atm ON ((atm.tenant_id = atr.tenant_id)))
  WHERE ((atm.profile_id = (select auth.uid())) AND (atm.status = 'active'::text) AND (atr.status = ANY (ARRAY['active'::text, 'pending'::text]))))));

-- [133] talent_profile_taxonomy.tpt_talent_self_modify (ALL)
DROP POLICY IF EXISTS "tpt_talent_self_modify" ON public."talent_profile_taxonomy";
CREATE POLICY "tpt_talent_self_modify" ON public."talent_profile_taxonomy"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((talent_profile_id IN ( SELECT talent_profiles.id
   FROM talent_profiles
  WHERE (talent_profiles.user_id = (select auth.uid())))))
  WITH CHECK ((talent_profile_id IN ( SELECT talent_profiles.id
   FROM talent_profiles
  WHERE (talent_profiles.user_id = (select auth.uid())))));

-- [134] talent_profile_taxonomy.tpt_talent_self_select (SELECT)
DROP POLICY IF EXISTS "tpt_talent_self_select" ON public."talent_profile_taxonomy";
CREATE POLICY "tpt_talent_self_select" ON public."talent_profile_taxonomy"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((talent_profile_id IN ( SELECT talent_profiles.id
   FROM talent_profiles
  WHERE (talent_profiles.user_id = (select auth.uid())))));

-- [135] talent_profile_trust_badges.tptb_select_own (SELECT)
DROP POLICY IF EXISTS "tptb_select_own" ON public."talent_profile_trust_badges";
CREATE POLICY "tptb_select_own" ON public."talent_profile_trust_badges"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_profile_trust_badges.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [136] talent_profiles.talent_insert_self (INSERT)
DROP POLICY IF EXISTS "talent_insert_self" ON public."talent_profiles";
CREATE POLICY "talent_insert_self" ON public."talent_profiles"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = (select auth.uid())));

-- [137] talent_profiles.talent_select_own (SELECT)
DROP POLICY IF EXISTS "talent_select_own" ON public."talent_profiles";
CREATE POLICY "talent_select_own" ON public."talent_profiles"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((user_id = (select auth.uid())));

-- [138] talent_profiles.talent_update_own (UPDATE)
DROP POLICY IF EXISTS "talent_update_own" ON public."talent_profiles";
CREATE POLICY "talent_update_own" ON public."talent_profiles"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((user_id = (select auth.uid())) OR is_agency_staff()))
  WITH CHECK (((user_id = (select auth.uid())) OR is_agency_staff()));

-- [139] talent_representation_requests.talent_representation_requests_insert (INSERT)
DROP POLICY IF EXISTS "talent_representation_requests_insert" ON public."talent_representation_requests";
CREATE POLICY "talent_representation_requests_insert" ON public."talent_representation_requests"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((is_platform_admin() OR is_staff_of_tenant(target_id) OR (EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_representation_requests.talent_profile_id) AND (tp.user_id = (select auth.uid())))))));

-- [140] talent_representation_requests.talent_representation_requests_read (SELECT)
DROP POLICY IF EXISTS "talent_representation_requests_read" ON public."talent_representation_requests";
CREATE POLICY "talent_representation_requests_read" ON public."talent_representation_requests"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((is_platform_admin() OR is_staff_of_tenant(target_id) OR (EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_representation_requests.talent_profile_id) AND (tp.user_id = (select auth.uid())))))));

-- [141] talent_representation_requests.talent_representation_requests_update (UPDATE)
DROP POLICY IF EXISTS "talent_representation_requests_update" ON public."talent_representation_requests";
CREATE POLICY "talent_representation_requests_update" ON public."talent_representation_requests"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((is_platform_admin() OR ((target_type = 'agency'::text) AND is_staff_of_tenant(target_id)) OR (EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_representation_requests.talent_profile_id) AND (tp.user_id = (select auth.uid())))))))
  WITH CHECK ((is_platform_admin() OR ((target_type = 'agency'::text) AND is_staff_of_tenant(target_id)) OR (EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_representation_requests.talent_profile_id) AND (tp.user_id = (select auth.uid())))))));

-- [142] talent_reviews.talent_reviews_client_insert (INSERT)
DROP POLICY IF EXISTS "talent_reviews_client_insert" ON public."talent_reviews";
CREATE POLICY "talent_reviews_client_insert" ON public."talent_reviews"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((client_user_id = (select auth.uid())));

-- [143] talent_reviews.talent_reviews_client_select_own (SELECT)
DROP POLICY IF EXISTS "talent_reviews_client_select_own" ON public."talent_reviews";
CREATE POLICY "talent_reviews_client_select_own" ON public."talent_reviews"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((client_user_id = (select auth.uid())));

-- [144] talent_reviews.talent_reviews_client_update (UPDATE)
DROP POLICY IF EXISTS "talent_reviews_client_update" ON public."talent_reviews";
CREATE POLICY "talent_reviews_client_update" ON public."talent_reviews"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((client_user_id = (select auth.uid())))
  WITH CHECK ((client_user_id = (select auth.uid())));

-- [145] talent_reviews.talent_reviews_subject_report (UPDATE)
DROP POLICY IF EXISTS "talent_reviews_subject_report" ON public."talent_reviews";
CREATE POLICY "talent_reviews_subject_report" ON public."talent_reviews"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_reviews.talent_profile_id) AND (tp.user_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_reviews.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [146] talent_reviews.talent_reviews_subject_select (SELECT)
DROP POLICY IF EXISTS "talent_reviews_subject_select" ON public."talent_reviews";
CREATE POLICY "talent_reviews_subject_select" ON public."talent_reviews"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_reviews.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [147] talent_service_areas.talent_service_areas_select_own (SELECT)
DROP POLICY IF EXISTS "talent_service_areas_select_own" ON public."talent_service_areas";
CREATE POLICY "talent_service_areas_select_own" ON public."talent_service_areas"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_service_areas.talent_profile_id) AND (tp.user_id = (select auth.uid()))))));

-- [148] talent_service_areas.talent_service_areas_write_own_or_staff (ALL)
DROP POLICY IF EXISTS "talent_service_areas_write_own_or_staff" ON public."talent_service_areas";
CREATE POLICY "talent_service_areas_write_own_or_staff" ON public."talent_service_areas"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((((tenant_id IS NOT NULL) AND is_staff_of_tenant(tenant_id)) OR (EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_service_areas.talent_profile_id) AND (tp.user_id = (select auth.uid())))))))
  WITH CHECK ((((tenant_id IS NOT NULL) AND is_staff_of_tenant(tenant_id)) OR (EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_service_areas.talent_profile_id) AND (tp.user_id = (select auth.uid())))))));

-- [149] talent_stripe_customers.talent_stripe_customers_self_read (SELECT)
DROP POLICY IF EXISTS "talent_stripe_customers_self_read" ON public."talent_stripe_customers";
CREATE POLICY "talent_stripe_customers_self_read" ON public."talent_stripe_customers"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((user_id = (select auth.uid())));

-- [150] talent_submission_consents.talent_submission_consents_talent_insert_own (INSERT)
DROP POLICY IF EXISTS "talent_submission_consents_talent_insert_own" ON public."talent_submission_consents";
CREATE POLICY "talent_submission_consents_talent_insert_own" ON public."talent_submission_consents"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = talent_submission_consents.talent_profile_id) AND (t.user_id = (select auth.uid())))))));

-- [151] talent_submission_consents.talent_submission_consents_talent_select_own (SELECT)
DROP POLICY IF EXISTS "talent_submission_consents_talent_select_own" ON public."talent_submission_consents";
CREATE POLICY "talent_submission_consents_talent_select_own" ON public."talent_submission_consents"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = talent_submission_consents.talent_profile_id) AND (t.user_id = (select auth.uid()))))));

-- [152] talent_submission_history.talent_submission_history_talent_select_own (SELECT)
DROP POLICY IF EXISTS "talent_submission_history_talent_select_own" ON public."talent_submission_history";
CREATE POLICY "talent_submission_history_talent_select_own" ON public."talent_submission_history"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = talent_submission_history.talent_profile_id) AND (t.user_id = (select auth.uid()))))));

-- [153] talent_submission_snapshots.talent_submission_snapshots_talent_select_own (SELECT)
DROP POLICY IF EXISTS "talent_submission_snapshots_talent_select_own" ON public."talent_submission_snapshots";
CREATE POLICY "talent_submission_snapshots_talent_select_own" ON public."talent_submission_snapshots"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = talent_submission_snapshots.talent_profile_id) AND (t.user_id = (select auth.uid()))))));

-- [154] talent_subscriptions.talent_subscriptions_self_read (SELECT)
DROP POLICY IF EXISTS "talent_subscriptions_self_read" ON public."talent_subscriptions";
CREATE POLICY "talent_subscriptions_self_read" ON public."talent_subscriptions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((user_id = (select auth.uid())));

-- [155] talent_workflow_events.talent_workflow_events_talent_select_own (SELECT)
DROP POLICY IF EXISTS "talent_workflow_events_talent_select_own" ON public."talent_workflow_events";
CREATE POLICY "talent_workflow_events_talent_select_own" ON public."talent_workflow_events"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM talent_profiles t
  WHERE ((t.id = talent_workflow_events.talent_profile_id) AND (t.user_id = (select auth.uid()))))));

-- [156] taxonomy_term_requests.ttr_insert_authenticated (INSERT)
DROP POLICY IF EXISTS "ttr_insert_authenticated" ON public."taxonomy_term_requests";
CREATE POLICY "ttr_insert_authenticated" ON public."taxonomy_term_requests"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((((select auth.uid()) IS NOT NULL) AND ((requested_by_user_id IS NULL) OR (requested_by_user_id = (select auth.uid())))));

-- [157] taxonomy_term_requests.ttr_select_own_submitter (SELECT)
DROP POLICY IF EXISTS "ttr_select_own_submitter" ON public."taxonomy_term_requests";
CREATE POLICY "ttr_select_own_submitter" ON public."taxonomy_term_requests"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((requested_by_user_id = (select auth.uid())));

-- [158] team_invite_tokens.team_invite_tokens_email_self_select (SELECT)
DROP POLICY IF EXISTS "team_invite_tokens_email_self_select" ON public."team_invite_tokens";
CREATE POLICY "team_invite_tokens_email_self_select" ON public."team_invite_tokens"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((lower(invited_email) = lower(COALESCE(((select auth.jwt()) ->> 'email'::text), ''::text))) AND (redeemed_at IS NULL) AND (revoked_at IS NULL) AND (expires_at > now())));

-- [159] translation_audit_events.translation_audit_talent_own_insert (INSERT)
DROP POLICY IF EXISTS "translation_audit_talent_own_insert" ON public."translation_audit_events";
CREATE POLICY "translation_audit_talent_own_insert" ON public."translation_audit_events"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((entity_type = 'talent_profile'::text) AND (EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = translation_audit_events.entity_id) AND (tp.user_id = (select auth.uid())))))));

-- [160] user_admin_notes.super_admin_delete (DELETE)
DROP POLICY IF EXISTS "super_admin_delete" ON public."user_admin_notes";
CREATE POLICY "super_admin_delete" ON public."user_admin_notes"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((select auth.uid()) IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.app_role = 'super_admin'::app_role))));

-- [161] user_admin_notes.super_admin_insert (INSERT)
DROP POLICY IF EXISTS "super_admin_insert" ON public."user_admin_notes";
CREATE POLICY "super_admin_insert" ON public."user_admin_notes"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((select auth.uid()) IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.app_role = 'super_admin'::app_role))));

-- [162] user_admin_notes.super_admin_select (SELECT)
DROP POLICY IF EXISTS "super_admin_select" ON public."user_admin_notes";
CREATE POLICY "super_admin_select" ON public."user_admin_notes"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((select auth.uid()) IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.app_role = 'super_admin'::app_role))));

-- [163] user_admin_notes.super_admin_update (UPDATE)
DROP POLICY IF EXISTS "super_admin_update" ON public."user_admin_notes";
CREATE POLICY "super_admin_update" ON public."user_admin_notes"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((select auth.uid()) IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.app_role = 'super_admin'::app_role))))
  WITH CHECK (((select auth.uid()) IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.app_role = 'super_admin'::app_role))));

-- [164] user_blocks.user_blocks_self (SELECT)
DROP POLICY IF EXISTS "user_blocks_self" ON public."user_blocks";
CREATE POLICY "user_blocks_self" ON public."user_blocks"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((blocker_user_id = (select auth.uid())));

-- [165] user_notifications.user_notifications_select_self (SELECT)
DROP POLICY IF EXISTS "user_notifications_select_self" ON public."user_notifications";
CREATE POLICY "user_notifications_select_self" ON public."user_notifications"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = (select auth.uid())));

-- [166] user_notifications.user_notifications_update_self (UPDATE)
DROP POLICY IF EXISTS "user_notifications_update_self" ON public."user_notifications";
CREATE POLICY "user_notifications_update_self" ON public."user_notifications"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((user_id = (select auth.uid())))
  WITH CHECK ((user_id = (select auth.uid())));

-- [167] user_prefs.user_prefs_self_insert (INSERT)
DROP POLICY IF EXISTS "user_prefs_self_insert" ON public."user_prefs";
CREATE POLICY "user_prefs_self_insert" ON public."user_prefs"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((select auth.uid()) = user_id));

-- [168] user_prefs.user_prefs_self_select (SELECT)
DROP POLICY IF EXISTS "user_prefs_self_select" ON public."user_prefs";
CREATE POLICY "user_prefs_self_select" ON public."user_prefs"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((select auth.uid()) = user_id));

-- [169] user_prefs.user_prefs_self_update (UPDATE)
DROP POLICY IF EXISTS "user_prefs_self_update" ON public."user_prefs";
CREATE POLICY "user_prefs_self_update" ON public."user_prefs"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((select auth.uid()) = user_id))
  WITH CHECK (((select auth.uid()) = user_id));

COMMIT;
