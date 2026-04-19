-- SaaS Phase 7 follow-up — let talent read their own agency_talent_roster rows.
--
-- Ref: docs/saas/phase-7/talent-self-service-ui.md,
--      docs/saas/phase-0/03-state-machines.md §5 (roster lifecycle).
--
-- Why: the talent self-service "Where I appear" screen queries
-- agency_talent_roster by talent_profile_id so the talent can see which
-- tenants represent them and what their hub-visibility status is. Existing
-- RLS only grants SELECT to agency staff and the public (for site-visible
-- rows). Without this policy the talent sees nothing when their roster row
-- is not yet site_visible (pending / roster_only), which is the normal state
-- right after a fresh application.
--
-- The policy limits SELECT to the talent whose talent_profiles.user_id equals
-- auth.uid(). Writes are still staff-only.

BEGIN;

DROP POLICY IF EXISTS agency_talent_roster_talent_self_read ON public.agency_talent_roster;
CREATE POLICY agency_talent_roster_talent_self_read
  ON public.agency_talent_roster
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = agency_talent_roster.talent_profile_id
        AND tp.user_id = auth.uid()
    )
  );

COMMIT;
