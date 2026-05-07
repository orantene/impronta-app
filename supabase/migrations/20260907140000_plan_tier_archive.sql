-- ============================================================================
-- Phase 8 prep — plan-tier downgrade archive (Oran 2026-05-07)
-- ============================================================================
--
-- Business rule: when an agency downgrades their plan tier, any roster /
-- team / inquiry resources that exceed the new plan's caps must NOT be
-- destroyed. They should be ARCHIVED — hidden from active workflows but
-- recoverable when the agency upgrades back.
--
-- Concrete trigger: an Agency-tier tenant with 27 talent downgrades to
-- Free (5-talent cap). The owner must select 5 to keep visible; the
-- other 22 archive into a "frozen for plan downgrade" state. They:
--   - don't show in roster lists, inquiry talent search, public storefront
--   - don't count against the new plan's 5-seat cap
--   - keep all data (talent_profiles untouched; auth.users untouched)
--   - can be restored individually OR auto-restored on plan upgrade
--
-- Implementation: we add an explicit 'archived_for_downgrade' value to
-- the agency_talent_roster.status check constraint, plus tracking columns
-- to remember WHICH downgrade event archived each row + when, so
-- subsequent upgrades can do batch-restores per-event without colliding
-- with manual removes.
--
-- Same pattern can extend to agency_memberships (team seats) and
-- inquiry workflows in subsequent migrations. This first slice is talent
-- only because that's the user's stated concern.

-- ─── New status value ────────────────────────────────────────────────────────
-- agency_talent_roster.status currently allows: pending, active, inactive,
-- removed (per migration 20260601100500). Adding 'archived_for_downgrade'
-- via constraint replacement (drop + recreate; idempotent).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_talent_roster_status_check'
  ) THEN
    ALTER TABLE public.agency_talent_roster
      DROP CONSTRAINT agency_talent_roster_status_check;
  END IF;
  ALTER TABLE public.agency_talent_roster
    ADD CONSTRAINT agency_talent_roster_status_check
    CHECK (status IN (
      'pending',
      'active',
      'inactive',
      'removed',
      'archived_for_downgrade'
    ));
END
$$;

-- ─── Audit columns for the archive event ─────────────────────────────────────

ALTER TABLE public.agency_talent_roster
  ADD COLUMN IF NOT EXISTS archived_for_downgrade_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_for_downgrade_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Stable id grouping all rows archived in the same downgrade event.
  -- Future bulk-restore on upgrade: "restore everything with this id".
  ADD COLUMN IF NOT EXISTS archived_for_downgrade_event UUID;

CREATE INDEX IF NOT EXISTS idx_agency_talent_roster_archive_event
  ON public.agency_talent_roster (tenant_id, archived_for_downgrade_event)
  WHERE status = 'archived_for_downgrade';

COMMENT ON COLUMN public.agency_talent_roster.archived_for_downgrade_at IS
  'Timestamp the row was archived during a plan-tier downgrade. NULL on every other status.';
COMMENT ON COLUMN public.agency_talent_roster.archived_for_downgrade_by IS
  'profiles.id of the operator who confirmed the downgrade preflight. NULL otherwise.';
COMMENT ON COLUMN public.agency_talent_roster.archived_for_downgrade_event IS
  'UUID grouping every roster row archived in the same downgrade event, so a subsequent upgrade can restore the whole batch in one action without colliding with manual removes/adds in between.';

-- ─── Plan-tier seat caps reference table (data, not enforcement) ─────────────
--
-- Caps are still resolved in code per `lib/saas/roster-seat-limit.ts`
-- and similar — this table is a documented source of truth, queryable
-- from the downgrade-preflight UI to display "you have N, plan X allows M".

CREATE TABLE IF NOT EXISTS public.plan_tier_caps (
  plan_tier            TEXT PRIMARY KEY,
  talent_seats         INT NOT NULL,
  team_seats           INT NOT NULL,
  inquiry_throughput   INT NOT NULL,  -- per month
  custom_domain        BOOLEAN NOT NULL DEFAULT false,
  embed_widgets        BOOLEAN NOT NULL DEFAULT false,
  api_access           BOOLEAN NOT NULL DEFAULT false,
  exclusivity_eligible BOOLEAN NOT NULL DEFAULT false,
  description          TEXT,
  CONSTRAINT plan_tier_caps_plan_chk CHECK (plan_tier IN ('free','studio','agency','network'))
);

INSERT INTO public.plan_tier_caps (plan_tier, talent_seats, team_seats, inquiry_throughput, custom_domain, embed_widgets, api_access, exclusivity_eligible, description)
VALUES
  ('free',    5,   1, 5,       false, false, false, false, 'Free — first roster, single coordinator, listed on Tulala directory.'),
  ('studio',  25,  3, 50,      false, false, false, true,  'Studio $79/mo — private inbox, custom client list, room for a few teammates.'),
  ('agency',  200, 12, 9999,   true,  true,  true,  true,  'Agency $149/mo — branded site, team workflows, exclusivity, API + embed widgets.'),
  ('network', 9999, 9999, 9999, true,  true,  true,  true,  'Network $899/mo — multi-brand hubs, network distribution, partner API access.')
ON CONFLICT (plan_tier) DO UPDATE SET
  talent_seats = EXCLUDED.talent_seats,
  team_seats = EXCLUDED.team_seats,
  inquiry_throughput = EXCLUDED.inquiry_throughput,
  custom_domain = EXCLUDED.custom_domain,
  embed_widgets = EXCLUDED.embed_widgets,
  api_access = EXCLUDED.api_access,
  exclusivity_eligible = EXCLUDED.exclusivity_eligible,
  description = EXCLUDED.description;

ALTER TABLE public.plan_tier_caps ENABLE ROW LEVEL SECURITY;

-- Read-only for everyone; mutations via service role (or admin migration).
DROP POLICY IF EXISTS plan_tier_caps_select ON public.plan_tier_caps;
CREATE POLICY plan_tier_caps_select ON public.plan_tier_caps
  FOR SELECT
  USING (true);
