-- Phase 2 follow-up — fixes two related engine-write blockers surfaced by
-- 2026-05-12 live audit:
--
--   S0.1: "Start drafting offer" hangs forever in admin workspace.
--         Root cause hypothesis: insert into inquiry_offers under user-auth
--         supabase client gets silently RLS-blocked when the actor (staff)
--         is not yet recorded as an active coordinator participant. The
--         tenant_staff bypass policy exists but relies on is_staff_of_tenant
--         which requires an active agency_memberships row that may be
--         missing for some seeded admins. This adds an explicit
--         is_agency_staff() fallback on the coordinator policies so legacy
--         is_agency_staff admins still pass.
--
--   S0.4: Notification insert blocked by RLS when admin adds a talent.
--         notifyUsers() ran a raw INSERT under admin auth, but the
--         notifications policy only permits user_id = auth.uid() OR the
--         recipient being staff. Admin inserting for talent fails both.
--         Fix: new SECURITY DEFINER RPC engine_emit_notification() that
--         performs the insert with elevated privileges, callable only by
--         authenticated users. notifyUsers() will switch to using it.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. SECURITY DEFINER RPC for notification inserts.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.engine_emit_notification(
  p_user_id UUID,
  p_title   TEXT,
  p_body    TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'engine_emit_notification: p_user_id is required';
  END IF;
  IF p_title IS NULL OR length(p_title) = 0 THEN
    RAISE EXCEPTION 'engine_emit_notification: p_title is required';
  END IF;

  INSERT INTO public.notifications (user_id, title, body)
  VALUES (p_user_id, p_title, p_body)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.engine_emit_notification(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_emit_notification(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.engine_emit_notification(UUID, TEXT, TEXT) IS
  'Engine write path for notifications. SECURITY DEFINER bypasses notifications_own RLS so staff/coordinator code can ping recipients. Callable by any authenticated user — gate at the calling action layer.';

-- ---------------------------------------------------------------------------
-- 2. Defensive: add is_agency_staff() bypass to coordinator-only RLS on
--    inquiry_offers + inquiry_offer_line_items + inquiry_approvals.
--    The newer is_staff_of_tenant() policy ALREADY exists for these tables
--    (per 20260602100100_saas_p2_rls_tenant_scoped.sql) — this just adds an
--    OR-bypass when the helper exists, so admins with the legacy app_role
--    but no agency_memberships row are not blocked.
--
--    Permissive policies are OR'd, so this strictly EXPANDS access for
--    staff and never restricts existing coordinator/client paths.
-- ---------------------------------------------------------------------------

-- inquiry_offers: replace coordinator policies with staff-OR-coordinator
DROP POLICY IF EXISTS inquiry_offers_coordinator_select ON public.inquiry_offers;
CREATE POLICY inquiry_offers_coordinator_select ON public.inquiry_offers
  FOR SELECT USING (
    public.is_agency_staff()
    OR EXISTS (
      SELECT 1 FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_offers.inquiry_id
        AND p.user_id = auth.uid()
        AND p.role = 'coordinator'
        AND p.status = 'active'
    )
  );

DROP POLICY IF EXISTS inquiry_offers_coordinator_write ON public.inquiry_offers;
CREATE POLICY inquiry_offers_coordinator_write ON public.inquiry_offers
  FOR INSERT WITH CHECK (
    public.is_agency_staff()
    OR EXISTS (
      SELECT 1 FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_offers.inquiry_id
        AND p.user_id = auth.uid()
        AND p.role = 'coordinator'
        AND p.status = 'active'
    )
  );

DROP POLICY IF EXISTS inquiry_offers_coordinator_update ON public.inquiry_offers;
CREATE POLICY inquiry_offers_coordinator_update ON public.inquiry_offers
  FOR UPDATE USING (
    public.is_agency_staff()
    OR EXISTS (
      SELECT 1 FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_offers.inquiry_id
        AND p.user_id = auth.uid()
        AND p.role = 'coordinator'
        AND p.status = 'active'
    )
  )
  WITH CHECK (
    public.is_agency_staff()
    OR EXISTS (
      SELECT 1 FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_offers.inquiry_id
        AND p.user_id = auth.uid()
        AND p.role = 'coordinator'
        AND p.status = 'active'
    )
  );

-- inquiry_offer_line_items: same bypass on coordinator policies
DROP POLICY IF EXISTS inquiry_offer_line_items_coordinator_select ON public.inquiry_offer_line_items;
CREATE POLICY inquiry_offer_line_items_coordinator_select ON public.inquiry_offer_line_items
  FOR SELECT USING (
    public.is_agency_staff()
    OR EXISTS (
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
    public.is_agency_staff()
    OR EXISTS (
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
    public.is_agency_staff()
    OR EXISTS (
      SELECT 1
      FROM public.inquiry_offers o
      JOIN public.inquiry_participants p ON p.inquiry_id = o.inquiry_id
      WHERE o.id = inquiry_offer_line_items.offer_id
        AND p.user_id = auth.uid()
        AND p.role = 'coordinator'
        AND p.status = 'active'
    )
  );

-- inquiry_approvals: coordinator read bypass for staff
DROP POLICY IF EXISTS inquiry_approvals_coordinator_select ON public.inquiry_approvals;
CREATE POLICY inquiry_approvals_coordinator_select ON public.inquiry_approvals
  FOR SELECT USING (
    public.is_agency_staff()
    OR EXISTS (
      SELECT 1 FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_approvals.inquiry_id
        AND p.user_id = auth.uid()
        AND p.role = 'coordinator'
        AND p.status = 'active'
    )
  );

COMMIT;
