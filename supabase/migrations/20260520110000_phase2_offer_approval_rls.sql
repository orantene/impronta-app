-- Phase 2: role-based RLS for offers + approvals + talent view filtering

BEGIN;

-- ---------------------------------------------------------------------------
-- Offer line items: talent view filtered to auth.uid() (Contract 5)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.inquiry_offer_line_items_talent_view AS
SELECT
  li.id,
  li.offer_id,
  li.talent_profile_id,
  li.label,
  li.pricing_unit,
  li.units,
  li.talent_cost,
  li.notes,
  li.sort_order,
  li.created_at
FROM public.inquiry_offer_line_items li
WHERE EXISTS (
  SELECT 1
  FROM public.talent_profiles tp
  WHERE tp.id = li.talent_profile_id
    AND tp.user_id = auth.uid()
);

-- ---------------------------------------------------------------------------
-- inquiry_offers RLS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS inquiry_offers_coordinator_select ON public.inquiry_offers;
CREATE POLICY inquiry_offers_coordinator_select ON public.inquiry_offers
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_offers.inquiry_id
        AND p.user_id = auth.uid()
        AND p.role = 'coordinator'
        AND p.status = 'active'
    )
  );

DROP POLICY IF EXISTS inquiry_offers_coordinator_write ON public.inquiry_offers;
CREATE POLICY inquiry_offers_coordinator_write ON public.inquiry_offers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_offers.inquiry_id
        AND p.user_id = auth.uid()
        AND p.role = 'coordinator'
        AND p.status = 'active'
    )
  );

DROP POLICY IF EXISTS inquiry_offers_coordinator_update ON public.inquiry_offers;
CREATE POLICY inquiry_offers_coordinator_update ON public.inquiry_offers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_offers.inquiry_id
        AND p.user_id = auth.uid()
        AND p.role = 'coordinator'
        AND p.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_offers.inquiry_id
        AND p.user_id = auth.uid()
        AND p.role = 'coordinator'
        AND p.status = 'active'
    )
  );

DROP POLICY IF EXISTS inquiry_offers_client_select ON public.inquiry_offers;
CREATE POLICY inquiry_offers_client_select ON public.inquiry_offers
  FOR SELECT USING (
    inquiry_offers.status IN ('sent', 'accepted')
    AND EXISTS (
      SELECT 1
      FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_offers.inquiry_id
        AND p.user_id = auth.uid()
        AND p.role = 'client'
        AND p.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- inquiry_offer_line_items RLS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS inquiry_offer_line_items_coordinator_select ON public.inquiry_offer_line_items;
CREATE POLICY inquiry_offer_line_items_coordinator_select ON public.inquiry_offer_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.inquiry_offers o
      JOIN public.inquiry_participants p ON p.inquiry_id = o.inquiry_id
      WHERE o.id = inquiry_offer_line_items.offer_id
        AND p.user_id = auth.uid()
        AND p.role = 'coordinator'
        AND p.status = 'active'
    )
  );

DROP POLICY IF EXISTS inquiry_offer_line_items_coordinator_write ON public.inquiry_offer_line_items;
CREATE POLICY inquiry_offer_line_items_coordinator_write ON public.inquiry_offer_line_items
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.inquiry_offers o
      JOIN public.inquiry_participants p ON p.inquiry_id = o.inquiry_id
      WHERE o.id = inquiry_offer_line_items.offer_id
        AND p.user_id = auth.uid()
        AND p.role = 'coordinator'
        AND p.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.inquiry_offers o
      JOIN public.inquiry_participants p ON p.inquiry_id = o.inquiry_id
      WHERE o.id = inquiry_offer_line_items.offer_id
        AND p.user_id = auth.uid()
        AND p.role = 'coordinator'
        AND p.status = 'active'
    )
  );

DROP POLICY IF EXISTS inquiry_offer_line_items_client_select ON public.inquiry_offer_line_items;
CREATE POLICY inquiry_offer_line_items_client_select ON public.inquiry_offer_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.inquiry_offers o
      JOIN public.inquiry_participants p ON p.inquiry_id = o.inquiry_id
      WHERE o.id = inquiry_offer_line_items.offer_id
        AND o.status IN ('sent', 'accepted')
        AND p.user_id = auth.uid()
        AND p.role = 'client'
        AND p.status = 'active'
    )
  );

-- Note: talents do NOT get direct SELECT on inquiry_offer_line_items.
-- They must use inquiry_offer_line_items_talent_view (Contract 5).

-- ---------------------------------------------------------------------------
-- inquiry_approvals RLS (Contract 4)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS inquiry_approvals_coordinator_select ON public.inquiry_approvals;
CREATE POLICY inquiry_approvals_coordinator_select ON public.inquiry_approvals
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_approvals.inquiry_id
        AND p.user_id = auth.uid()
        AND p.role = 'coordinator'
        AND p.status = 'active'
    )
  );

DROP POLICY IF EXISTS inquiry_approvals_participant_select_own ON public.inquiry_approvals;
CREATE POLICY inquiry_approvals_participant_select_own ON public.inquiry_approvals
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.inquiry_participants p
      WHERE p.id = inquiry_approvals.participant_id
        AND p.user_id = auth.uid()
        AND p.status IN ('invited', 'active')
    )
  );

DROP POLICY IF EXISTS inquiry_approvals_participant_update_own ON public.inquiry_approvals;
CREATE POLICY inquiry_approvals_participant_update_own ON public.inquiry_approvals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.inquiry_participants p
      WHERE p.id = inquiry_approvals.participant_id
        AND p.user_id = auth.uid()
        AND p.status IN ('invited', 'active')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.inquiry_participants p
      WHERE p.id = inquiry_approvals.participant_id
        AND p.user_id = auth.uid()
        AND p.status IN ('invited', 'active')
    )
  );

-- ---------------------------------------------------------------------------
-- Approval aggregate summary (SECURITY DEFINER)
-- - Returns counts without revealing participant identities.
-- - Caller must be staff OR a participant on the inquiry.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inquiry_approval_summary(
  p_inquiry_id UUID,
  p_offer_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_staff BOOLEAN;
  is_participant BOOLEAN;
  accepted_count INT;
  pending_count INT;
  rejected_count INT;
BEGIN
  SELECT public.is_agency_staff() INTO is_staff;
  SELECT EXISTS (
    SELECT 1 FROM public.inquiry_participants p
    WHERE p.inquiry_id = p_inquiry_id
      AND p.user_id = auth.uid()
      AND p.status IN ('invited', 'active')
  ) INTO is_participant;

  IF NOT is_staff AND NOT is_participant THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COUNT(*) FILTER (WHERE a.status = 'accepted'),
         COUNT(*) FILTER (WHERE a.status = 'pending'),
         COUNT(*) FILTER (WHERE a.status = 'rejected')
  INTO accepted_count, pending_count, rejected_count
  FROM public.inquiry_approvals a
  WHERE a.inquiry_id = p_inquiry_id
    AND a.offer_id = p_offer_id;

  RETURN jsonb_build_object(
    'total', accepted_count + pending_count + rejected_count,
    'accepted', accepted_count,
    'pending', pending_count,
    'rejected', rejected_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inquiry_approval_summary(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inquiry_approval_summary(UUID, UUID) TO authenticated;

COMMIT;

