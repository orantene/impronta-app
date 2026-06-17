-- P1 cross-tenant leak: re-scope is_agency_staff() inside inquiry-table RLS policies.
--
-- public.is_agency_staff() is GLOBAL — it returns true for ANY user whose profile
-- app_role is in ('super_admin','agency_staff'), with no tenant argument:
--   SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
--                  AND app_role IN ('super_admin','agency_staff'))
-- Several RLS policies OR-in is_agency_staff(), so an agency_staff user of ANY
-- tenant could read (and on the *_all / *_update / *_write policies, WRITE) rows
-- belonging to OTHER tenants' inquiries — a confidentiality + integrity breach
-- across the multi-tenant boundary.
--
-- Fix: inside these policies replace is_agency_staff() with
-- is_staff_of_tenant(<table>.tenant_id), the tenant-scoped helper already used by
-- the *_tenant_staff policies on these same tables and by the inquiry_events margin
-- fix (20261028000000_inquiry_events_margin_confidentiality). is_staff_of_tenant
-- returns true only for a platform admin OR a member (active/pending_acceptance) of
-- that specific tenant. The other branches (client / coordinator / participant) are
-- preserved verbatim. auth.uid() is wrapped as (SELECT auth.uid()) to keep the RLS
-- initplan optimization (20260615200003).
--
-- SCOPE: only the three inquiry tables carry a tenant_id column
--   (inquiry_approvals, inquiry_offer_line_items, inquiry_offers), so they are the
-- only ones rewritten here. The other tables that reference is_agency_staff() in
-- their policies have NO tenant_id column — they are global reference/config tables
-- (app_locales, countries, taxonomy_terms, locations), platform-staff tooling
-- (staff_permissions, talent_embeddings, talent_skill_metrics, profile_revisions),
-- or rows whose tenancy is derived through joins rather than a local column
-- (profiles, client_profiles, talent_profiles, guest_sessions). For those, a global
-- staff check is intentional/correct and a tenant_id substitution would reference a
-- nonexistent column. is_agency_staff()'s own definition is left untouched (non-RLS
-- callers depend on it).

BEGIN;

-- inquiry_approvals --------------------------------------------------------------
DROP POLICY IF EXISTS inquiry_approvals_merged_select_public ON public.inquiry_approvals;

CREATE POLICY inquiry_approvals_merged_select_public ON public.inquiry_approvals
  FOR SELECT
  TO public
  USING (
    public.is_staff_of_tenant(tenant_id)
    OR (EXISTS (
      SELECT 1
      FROM inquiry_participants p
      WHERE p.inquiry_id = inquiry_approvals.inquiry_id
        AND p.user_id = (SELECT auth.uid())
        AND p.role = 'coordinator'::inquiry_participant_role
        AND p.status = 'active'::inquiry_participant_status
    ))
    OR (EXISTS (
      SELECT 1
      FROM inquiry_participants p
      WHERE p.id = inquiry_approvals.participant_id
        AND p.user_id = (SELECT auth.uid())
        AND p.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status])
    ))
  );

-- inquiry_offer_line_items -------------------------------------------------------
-- The merged_all_public policy already ORed BOTH is_agency_staff() AND
-- is_staff_of_tenant(tenant_id); replacing the former dedupes to a single
-- tenant-scoped branch.
DROP POLICY IF EXISTS inquiry_offer_line_items_merged_all_public ON public.inquiry_offer_line_items;

CREATE POLICY inquiry_offer_line_items_merged_all_public ON public.inquiry_offer_line_items
  FOR ALL
  TO public
  USING (
    (EXISTS (
      SELECT 1
      FROM inquiry_offers o
        JOIN inquiry_participants p ON p.inquiry_id = o.inquiry_id
      WHERE o.id = inquiry_offer_line_items.offer_id
        AND p.user_id = (SELECT auth.uid())
        AND p.role = 'coordinator'::inquiry_participant_role
        AND p.status = 'active'::inquiry_participant_status
    ))
    OR public.is_staff_of_tenant(tenant_id)
  )
  WITH CHECK (
    (EXISTS (
      SELECT 1
      FROM inquiry_offers o
        JOIN inquiry_participants p ON p.inquiry_id = o.inquiry_id
      WHERE o.id = inquiry_offer_line_items.offer_id
        AND p.user_id = (SELECT auth.uid())
        AND p.role = 'coordinator'::inquiry_participant_role
        AND p.status = 'active'::inquiry_participant_status
    ))
    OR public.is_staff_of_tenant(tenant_id)
  );

DROP POLICY IF EXISTS inquiry_offer_line_items_merged_select_public ON public.inquiry_offer_line_items;

CREATE POLICY inquiry_offer_line_items_merged_select_public ON public.inquiry_offer_line_items
  FOR SELECT
  TO public
  USING (
    (EXISTS (
      SELECT 1
      FROM inquiry_offers o
        JOIN inquiry_participants p ON p.inquiry_id = o.inquiry_id
      WHERE o.id = inquiry_offer_line_items.offer_id
        AND o.status = ANY (ARRAY['sent'::inquiry_offer_status, 'accepted'::inquiry_offer_status])
        AND p.user_id = (SELECT auth.uid())
        AND p.role = 'client'::inquiry_participant_role
        AND p.status = 'active'::inquiry_participant_status
    ))
    OR (
      public.is_staff_of_tenant(tenant_id)
      OR (EXISTS (
        SELECT 1
        FROM inquiry_offers o
          JOIN inquiry_participants p ON p.inquiry_id = o.inquiry_id
        WHERE o.id = inquiry_offer_line_items.offer_id
          AND p.user_id = (SELECT auth.uid())
          AND p.role = 'coordinator'::inquiry_participant_role
          AND p.status = 'active'::inquiry_participant_status
      ))
    )
  );

-- inquiry_offers -----------------------------------------------------------------
DROP POLICY IF EXISTS inquiry_offers_coordinator_update ON public.inquiry_offers;

CREATE POLICY inquiry_offers_coordinator_update ON public.inquiry_offers
  FOR UPDATE
  TO public
  USING (
    public.is_staff_of_tenant(tenant_id)
    OR (EXISTS (
      SELECT 1
      FROM inquiry_participants p
      WHERE p.inquiry_id = inquiry_offers.inquiry_id
        AND p.user_id = (SELECT auth.uid())
        AND p.role = 'coordinator'::inquiry_participant_role
        AND p.status = 'active'::inquiry_participant_status
    ))
  )
  WITH CHECK (
    public.is_staff_of_tenant(tenant_id)
    OR (EXISTS (
      SELECT 1
      FROM inquiry_participants p
      WHERE p.inquiry_id = inquiry_offers.inquiry_id
        AND p.user_id = (SELECT auth.uid())
        AND p.role = 'coordinator'::inquiry_participant_role
        AND p.status = 'active'::inquiry_participant_status
    ))
  );

DROP POLICY IF EXISTS inquiry_offers_coordinator_write ON public.inquiry_offers;

CREATE POLICY inquiry_offers_coordinator_write ON public.inquiry_offers
  FOR INSERT
  TO public
  WITH CHECK (
    public.is_staff_of_tenant(tenant_id)
    OR (EXISTS (
      SELECT 1
      FROM inquiry_participants p
      WHERE p.inquiry_id = inquiry_offers.inquiry_id
        AND p.user_id = (SELECT auth.uid())
        AND p.role = 'coordinator'::inquiry_participant_role
        AND p.status = 'active'::inquiry_participant_status
    ))
  );

DROP POLICY IF EXISTS inquiry_offers_merged_select_public ON public.inquiry_offers;

CREATE POLICY inquiry_offers_merged_select_public ON public.inquiry_offers
  FOR SELECT
  TO public
  USING (
    (
      (status = ANY (ARRAY['sent'::inquiry_offer_status, 'accepted'::inquiry_offer_status]))
      AND (EXISTS (
        SELECT 1
        FROM inquiry_participants p
        WHERE p.inquiry_id = inquiry_offers.inquiry_id
          AND p.user_id = (SELECT auth.uid())
          AND p.role = 'client'::inquiry_participant_role
          AND p.status = 'active'::inquiry_participant_status
      ))
    )
    OR (
      public.is_staff_of_tenant(tenant_id)
      OR (EXISTS (
        SELECT 1
        FROM inquiry_participants p
        WHERE p.inquiry_id = inquiry_offers.inquiry_id
          AND p.user_id = (SELECT auth.uid())
          AND p.role = 'coordinator'::inquiry_participant_role
          AND p.status = 'active'::inquiry_participant_status
      ))
    )
  );

COMMIT;
