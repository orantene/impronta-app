-- P0 2026-10-07 — cross-talent offer writes.
--
-- inquiry_offers has no talent/owner column (only created_by_user_id), and the
-- coordinator write policies (latest: 20261032000000_tenant_scope_rls_isagencystaff)
-- let ANY active coordinator on an inquiry INSERT/UPDATE every offer of that
-- inquiry, and write every line item under it. When two self-coordinating
-- talents shared one hub inquiry, talent A could edit talent B's offer.
--
-- Tightening (same policy names, idempotent): the COORDINATOR branch may not
-- touch an offer authored by a DIFFERENT talent participant of the same inquiry,
-- and a coordinator INSERT may not claim someone else as author. Agency staff
-- (is_staff_of_tenant), agency coordinators and the platform officer keep their
-- paths: they are never blocked on offers they or a non-talent authored.
-- SELECT policies are unchanged (reads are fixed by one inquiry per independent
-- talent in the Discover route).

BEGIN;

-- inquiry_offers UPDATE -----------------------------------------------------------
DROP POLICY IF EXISTS inquiry_offers_coordinator_update ON public.inquiry_offers;

CREATE POLICY inquiry_offers_coordinator_update ON public.inquiry_offers
  FOR UPDATE
  TO public
  USING (
    public.is_staff_of_tenant(tenant_id)
    OR (
      EXISTS (
        SELECT 1
        FROM inquiry_participants p
        WHERE p.inquiry_id = inquiry_offers.inquiry_id
          AND p.user_id = (SELECT auth.uid())
          AND p.role = 'coordinator'::inquiry_participant_role
          AND p.status = 'active'::inquiry_participant_status
      )
      AND NOT EXISTS (
        SELECT 1
        FROM inquiry_participants other_talent
        WHERE other_talent.inquiry_id = inquiry_offers.inquiry_id
          AND other_talent.role = 'talent'::inquiry_participant_role
          AND other_talent.user_id = inquiry_offers.created_by_user_id
          AND other_talent.user_id IS DISTINCT FROM (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    public.is_staff_of_tenant(tenant_id)
    OR (
      EXISTS (
        SELECT 1
        FROM inquiry_participants p
        WHERE p.inquiry_id = inquiry_offers.inquiry_id
          AND p.user_id = (SELECT auth.uid())
          AND p.role = 'coordinator'::inquiry_participant_role
          AND p.status = 'active'::inquiry_participant_status
      )
      AND NOT EXISTS (
        SELECT 1
        FROM inquiry_participants other_talent
        WHERE other_talent.inquiry_id = inquiry_offers.inquiry_id
          AND other_talent.role = 'talent'::inquiry_participant_role
          AND other_talent.user_id = inquiry_offers.created_by_user_id
          AND other_talent.user_id IS DISTINCT FROM (SELECT auth.uid())
      )
    )
  );

-- inquiry_offers INSERT -----------------------------------------------------------
DROP POLICY IF EXISTS inquiry_offers_coordinator_write ON public.inquiry_offers;

CREATE POLICY inquiry_offers_coordinator_write ON public.inquiry_offers
  FOR INSERT
  TO public
  WITH CHECK (
    public.is_staff_of_tenant(tenant_id)
    OR (
      EXISTS (
        SELECT 1
        FROM inquiry_participants p
        WHERE p.inquiry_id = inquiry_offers.inquiry_id
          AND p.user_id = (SELECT auth.uid())
          AND p.role = 'coordinator'::inquiry_participant_role
          AND p.status = 'active'::inquiry_participant_status
      )
      -- a coordinator authors as themselves, never on behalf of another user
      AND (
        inquiry_offers.created_by_user_id IS NULL
        OR inquiry_offers.created_by_user_id = (SELECT auth.uid())
      )
    )
  );

-- inquiry_offer_line_items ALL ----------------------------------------------------
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
        AND NOT EXISTS (
          SELECT 1
          FROM inquiry_participants other_talent
          WHERE other_talent.inquiry_id = o.inquiry_id
            AND other_talent.role = 'talent'::inquiry_participant_role
            AND other_talent.user_id = o.created_by_user_id
            AND other_talent.user_id IS DISTINCT FROM (SELECT auth.uid())
        )
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
        AND NOT EXISTS (
          SELECT 1
          FROM inquiry_participants other_talent
          WHERE other_talent.inquiry_id = o.inquiry_id
            AND other_talent.role = 'talent'::inquiry_participant_role
            AND other_talent.user_id = o.created_by_user_id
            AND other_talent.user_id IS DISTINCT FROM (SELECT auth.uid())
        )
    ))
    OR public.is_staff_of_tenant(tenant_id)
  );

COMMIT;
