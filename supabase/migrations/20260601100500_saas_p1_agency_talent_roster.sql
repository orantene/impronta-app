-- SaaS Phase 1 / P1.A.6 — public.agency_talent_roster (tenant ↔ talent link)
--                          + backfill existing approved talent onto tenant #1.
--
-- Ref: docs/saas/phase-0/01-entity-ownership-map.md §4,
--      docs/saas/phase-0/03-state-machines.md §5 (roster lifecycle),
--      Plan §4, §11–11.5, L6, L7, L9, L42, L44.
--
-- This is the **relationship** row. The canonical profile stays in
-- talent_profiles (global). Presentation overrides live in agency_talent_overlays
-- (next migration). Hub visibility is a separate third dimension fed by the
-- unified talent_representation_requests workflow (L44, Phase 7).

BEGIN;

CREATE TABLE IF NOT EXISTS public.agency_talent_roster (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID        NOT NULL REFERENCES public.agencies(id)        ON DELETE CASCADE,
  talent_profile_id      UUID        NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  source_type            TEXT        NOT NULL
                                       CHECK (source_type IN (
                                         'legacy','agency_added','agency_created',
                                         'freelancer_claimed','platform_assigned','imported'
                                       )),
  status                 TEXT        NOT NULL DEFAULT 'active'
                                       CHECK (status IN ('pending','active','inactive','removed')),
  agency_visibility      TEXT        NOT NULL DEFAULT 'roster_only'
                                       CHECK (agency_visibility IN ('roster_only','site_visible','featured')),
  hub_visibility_status  TEXT        NOT NULL DEFAULT 'not_submitted'
                                       CHECK (hub_visibility_status IN (
                                         'not_submitted','pending_review','approved','rejected'
                                       )),
  is_primary             BOOLEAN     NOT NULL DEFAULT FALSE,
  added_by               UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at             TIMESTAMPTZ,
  removed_by             UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agency_talent_roster IS
  'Relationship row between tenant and canonical talent. Roster status + agency_visibility + hub_visibility_status are three orthogonal dimensions (deliverable 3 §5). L7: this row governs presentation, not identity.';

-- One live row per (tenant, talent). Historical 'removed' rows allowed alongside for audit.
CREATE UNIQUE INDEX IF NOT EXISTS agency_talent_roster_tenant_talent_live_uniq
  ON public.agency_talent_roster (tenant_id, talent_profile_id)
  WHERE status IN ('pending','active','inactive');

-- At most one primary agency per talent (L7 — canonical is elsewhere, but
-- primary agency is a routing/ownership concept used by hub referrals and
-- default inquiry routing — Plan §16).
CREATE UNIQUE INDEX IF NOT EXISTS agency_talent_roster_talent_primary_uniq
  ON public.agency_talent_roster (talent_profile_id)
  WHERE is_primary = TRUE AND status IN ('pending','active');

CREATE INDEX IF NOT EXISTS agency_talent_roster_tenant_idx
  ON public.agency_talent_roster (tenant_id);

CREATE INDEX IF NOT EXISTS agency_talent_roster_talent_idx
  ON public.agency_talent_roster (talent_profile_id);

CREATE INDEX IF NOT EXISTS agency_talent_roster_site_visible_idx
  ON public.agency_talent_roster (tenant_id, agency_visibility)
  WHERE status = 'active' AND agency_visibility IN ('site_visible','featured');

ALTER TABLE public.agency_talent_roster ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_talent_roster_staff_all ON public.agency_talent_roster;
CREATE POLICY agency_talent_roster_staff_all ON public.agency_talent_roster
  FOR ALL
  USING       (public.is_agency_staff())
  WITH CHECK  (public.is_agency_staff());

-- Public read of site-visible rows so storefront directory queries can build
-- card lists without a privileged session. Tenant scoping at the hostname
-- layer is Phase 4; in Phase 1 all rows belong to tenant #1 anyway.
DROP POLICY IF EXISTS agency_talent_roster_public_site_visible ON public.agency_talent_roster;
CREATE POLICY agency_talent_roster_public_site_visible ON public.agency_talent_roster
  FOR SELECT
  USING (status = 'active' AND agency_visibility IN ('site_visible','featured'));

CREATE OR REPLACE FUNCTION public.agency_talent_roster_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_talent_roster_touch_updated_at ON public.agency_talent_roster;
CREATE TRIGGER trg_agency_talent_roster_touch_updated_at
  BEFORE UPDATE ON public.agency_talent_roster
  FOR EACH ROW EXECUTE FUNCTION public.agency_talent_roster_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Backfill: every existing talent_profiles row becomes a tenant #1 roster row.
--
-- Rationale: in single-tenant history, every talent_profiles row is implicitly
-- rostered with Impronta. Keeping them unrostered post-Phase-1 would make them
-- invisible to the upcoming tenant-scoped storefront queries.
--
-- Visibility mapping:
--   approved + visibility=public    → agency_visibility='site_visible'
--   approved + visibility=hidden    → agency_visibility='roster_only'
--   other statuses                  → agency_visibility='roster_only',
--                                     status='active'
--
-- Everyone becomes is_primary=TRUE for tenant #1 (this is the only tenant).
-- source_type='legacy' flags that the row came from the pre-SaaS schema.
-- hub_visibility_status stays 'not_submitted' — hub workflow is Phase 7.
-- ---------------------------------------------------------------------------

INSERT INTO public.agency_talent_roster (
  tenant_id, talent_profile_id,
  source_type, status, agency_visibility, hub_visibility_status,
  is_primary, added_at
)
SELECT
  '00000000-0000-0000-0000-000000000001'::UUID,
  tp.id,
  'legacy',
  CASE
    WHEN tp.workflow_status = 'archived' THEN 'inactive'
    ELSE 'active'
  END,
  CASE
    WHEN tp.workflow_status = 'approved' AND tp.visibility = 'public' THEN 'site_visible'
    ELSE 'roster_only'
  END,
  'not_submitted',
  TRUE,
  COALESCE(tp.created_at, now())
FROM public.talent_profiles tp
ON CONFLICT DO NOTHING;

COMMIT;
