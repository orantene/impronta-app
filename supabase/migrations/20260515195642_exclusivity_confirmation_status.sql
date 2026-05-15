-- Agency exclusivity confirmation flow — per project_agency_exclusivity_model.md.
--
-- Today (post commit 094d69790): when an admin on a Studio/Agency/Network
-- plan adds talent to their roster, exclusivity_resolver flags is_primary=
-- TRUE automatically. The talent never gets a confirmation prompt — the
-- relationship just lands as "exclusive" silently.
--
-- The spec says: "The talent receives the relationship in their inbox to
-- confirm rights granted; if rejected within N days, the relationship is
-- downgraded to non-exclusive."
--
-- This migration adds the `exclusivity_status` lifecycle column on
-- agency_talent_roster, plus an `exclusivity_auto_assigned_at` timestamp
-- the UI uses to compute "N days remaining to decline" copy.
--
-- States:
--   confirmed       — back-compat default + talent explicitly accepted
--   auto_assigned   — admin auto-flagged, talent hasn't responded yet
--   declined        — talent declined; is_primary reverted to false
--                     (kept in column for audit; row's is_primary=false)
--   notice_period   — talent confirmed earlier + later requested to leave
--                     (out of scope for this migration but documented)
--
-- Back-compat:
--   * Existing roster rows backfill to 'confirmed' (talent + admin have
--     been operating together; no retroactive prompt).
--   * New admin-added rows get 'auto_assigned' when is_primary=TRUE
--     (talent gets the prompt).
--   * Direct selfSetPrimaryAgency calls (talent picking their primary)
--     get 'confirmed' immediately — talent IS the actor.

BEGIN;

DO $$ BEGIN
  CREATE TYPE public.exclusivity_status AS ENUM (
    'confirmed',
    'auto_assigned',
    'declined',
    'notice_period'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.agency_talent_roster
  ADD COLUMN IF NOT EXISTS exclusivity_status public.exclusivity_status
    NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS exclusivity_auto_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exclusivity_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exclusivity_declined_at TIMESTAMPTZ;

-- Index for the "show me pending exclusivity prompts" query (talent inbox).
CREATE INDEX IF NOT EXISTS idx_agency_talent_roster_pending_exclusivity
  ON public.agency_talent_roster (talent_profile_id, exclusivity_status)
  WHERE exclusivity_status = 'auto_assigned';

COMMENT ON COLUMN public.agency_talent_roster.exclusivity_status IS
  'Per spec project_agency_exclusivity_model.md: lifecycle for the is_primary flag. confirmed = talent accepted (or back-compat default); auto_assigned = admin auto-flagged, talent pending decision; declined = talent rejected (is_primary should be false); notice_period = future state for talent-initiated departure.';

COMMENT ON COLUMN public.agency_talent_roster.exclusivity_auto_assigned_at IS
  'Timestamp when admin auto-exclusived this row. Used by UI to compute "N days remaining to decline" countdown. NULL when status never went through auto_assigned (back-compat rows + selfSetPrimaryAgency rows).';

-- Helper: pending_exclusivity_prompts_for_talent(talent_profile_id).
-- Returns one row per pending confirmation with enough context for the
-- talent-side UI to render the prompt (agency name + plan tier +
-- commission rate hint + when it was auto-assigned).

CREATE OR REPLACE FUNCTION public.pending_exclusivity_prompts_for_talent(p_talent_profile_id UUID)
RETURNS TABLE (
  roster_id UUID,
  tenant_id UUID,
  agency_name TEXT,
  agency_plan_tier TEXT,
  auto_assigned_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id AS roster_id,
    r.tenant_id,
    a.display_name AS agency_name,
    a.plan_tier::TEXT AS agency_plan_tier,
    r.exclusivity_auto_assigned_at AS auto_assigned_at
  FROM public.agency_talent_roster r
  JOIN public.agencies a ON a.id = r.tenant_id
  WHERE r.talent_profile_id = p_talent_profile_id
    AND r.exclusivity_status = 'auto_assigned'
    AND r.status IN ('active', 'pending')
  ORDER BY r.exclusivity_auto_assigned_at DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.pending_exclusivity_prompts_for_talent IS
  'Returns pending exclusivity confirmation prompts for a talent. Used by talent inbox + TalentAgencyRelationshipDrawer to surface the "Acme Agency has added you as their exclusive talent — confirm or decline" prompt.';

GRANT EXECUTE ON FUNCTION public.pending_exclusivity_prompts_for_talent(UUID) TO authenticated;

COMMIT;
