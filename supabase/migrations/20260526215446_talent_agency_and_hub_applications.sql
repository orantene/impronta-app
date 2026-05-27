-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Talent apply flow — agency + hub applications  (PR-F)           ║
-- ║  Decision: 2026-05-26 (see decision-log L47)                      ║
-- ║                                                                    ║
-- ║  Adds the two persistence layers behind a talent's "Apply to      ║
-- ║  this agency" / "Apply to this hub" intent, plus the per-agency   ║
-- ║  opt-in toggle (accepts_open_applications) that gates whether    ║
-- ║  the apply CTA renders at all.                                    ║
-- ║                                                                    ║
-- ║  Status lifecycle (both tables):                                  ║
-- ║    pending  → approved | rejected | withdrawn                     ║
-- ║                                                                    ║
-- ║  RLS:                                                              ║
-- ║    talent: SELECT own rows; INSERT own pending; UPDATE own to    ║
-- ║            'withdrawn' only.                                      ║
-- ║    staff:  SELECT/UPDATE all rows for their tenant_id.            ║
-- ║                                                                    ║
-- ║  Tenant autofill: tenant_id is REQUIRED on insert (no autofill   ║
-- ║  trigger — the application target is the tenant, not derived).   ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ────────────────────────────────────────────────────────────────────
-- 1) agencies: per-agency opt-in flag for receiving open applications
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS accepts_open_applications BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.agencies.accepts_open_applications IS
  'When TRUE, talent can submit talent_agency_applications targeting this tenant. Default FALSE — agencies must explicitly opt in. Does NOT control hub kind=hub apply (that uses agency_domains.kind=''hub'').';

-- ────────────────────────────────────────────────────────────────────
-- 2) application_status enum (shared by both apply tables)
-- ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.talent_application_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'withdrawn'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 3) talent_agency_applications
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.talent_agency_applications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  status           public.talent_application_status NOT NULL DEFAULT 'pending',
  message          TEXT,
  submitted_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at       TIMESTAMPTZ,
  decision_note    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One pending application per (tenant, talent) pair. Re-applying after
-- a rejected/withdrawn row is allowed by inserting a new pending row.
CREATE UNIQUE INDEX IF NOT EXISTS talent_agency_applications_one_pending_idx
  ON public.talent_agency_applications (tenant_id, talent_profile_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS talent_agency_applications_tenant_status_idx
  ON public.talent_agency_applications (tenant_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS talent_agency_applications_talent_idx
  ON public.talent_agency_applications (talent_profile_id, submitted_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at_talent_agency_applications()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_taa_updated_at ON public.talent_agency_applications;
CREATE TRIGGER trg_taa_updated_at
  BEFORE UPDATE ON public.talent_agency_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_talent_agency_applications();

ALTER TABLE public.talent_agency_applications ENABLE ROW LEVEL SECURITY;

-- Talent: SELECT own
DROP POLICY IF EXISTS taa_talent_select ON public.talent_agency_applications;
CREATE POLICY taa_talent_select ON public.talent_agency_applications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_agency_applications.talent_profile_id
        AND tp.user_id = auth.uid()
    )
  );

-- Talent: INSERT own (pending only, and only when the target accepts
-- open applications AND the talent isn't currently under an exclusive
-- relationship). We re-check both gates here so any client-side bypass
-- still fails closed.
DROP POLICY IF EXISTS taa_talent_insert ON public.talent_agency_applications;
CREATE POLICY taa_talent_insert ON public.talent_agency_applications
  FOR INSERT WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_agency_applications.talent_profile_id
        AND tp.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.agencies a
      WHERE a.id = talent_agency_applications.tenant_id
        AND a.accepts_open_applications = TRUE
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.agency_talent_roster r
      WHERE r.talent_profile_id = talent_agency_applications.talent_profile_id
        AND r.exclusivity_status IN ('confirmed', 'auto_assigned')
        AND r.status NOT IN ('removed', 'rejected')
    )
  );

-- Talent: UPDATE own to 'withdrawn' only
DROP POLICY IF EXISTS taa_talent_withdraw ON public.talent_agency_applications;
CREATE POLICY taa_talent_withdraw ON public.talent_agency_applications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_agency_applications.talent_profile_id
        AND tp.user_id = auth.uid()
    )
    AND status = 'pending'
  )
  WITH CHECK (
    status = 'withdrawn'
  );

-- Staff: SELECT all rows targeting their tenant
DROP POLICY IF EXISTS taa_staff_select ON public.talent_agency_applications;
CREATE POLICY taa_staff_select ON public.talent_agency_applications
  FOR SELECT USING (
    public.is_staff_of_tenant(tenant_id)
  );

-- Staff: UPDATE (approve / reject) rows targeting their tenant
DROP POLICY IF EXISTS taa_staff_update ON public.talent_agency_applications;
CREATE POLICY taa_staff_update ON public.talent_agency_applications
  FOR UPDATE USING (
    public.is_staff_of_tenant(tenant_id)
  )
  WITH CHECK (
    public.is_staff_of_tenant(tenant_id)
  );

COMMENT ON TABLE public.talent_agency_applications IS
  'Talent-initiated applications to join an agency roster. Gate: agencies.accepts_open_applications=TRUE AND no active exclusivity. Decision-log L47 (2026-05-26).';

-- ────────────────────────────────────────────────────────────────────
-- 4) talent_hub_applications
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.talent_hub_applications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  status           public.talent_application_status NOT NULL DEFAULT 'pending',
  message          TEXT,
  submitted_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at       TIMESTAMPTZ,
  decision_note    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS talent_hub_applications_one_pending_idx
  ON public.talent_hub_applications (tenant_id, talent_profile_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS talent_hub_applications_tenant_status_idx
  ON public.talent_hub_applications (tenant_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS talent_hub_applications_talent_idx
  ON public.talent_hub_applications (talent_profile_id, submitted_at DESC);

DROP TRIGGER IF EXISTS trg_tha_updated_at ON public.talent_hub_applications;
CREATE TRIGGER trg_tha_updated_at
  BEFORE UPDATE ON public.talent_hub_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_talent_agency_applications();

ALTER TABLE public.talent_hub_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tha_talent_select ON public.talent_hub_applications;
CREATE POLICY tha_talent_select ON public.talent_hub_applications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_hub_applications.talent_profile_id
        AND tp.user_id = auth.uid()
    )
  );

-- Hub apply: target tenant must be a hub (agency_domains.kind='hub')
-- AND the talent must not be under an active exclusive relationship.
DROP POLICY IF EXISTS tha_talent_insert ON public.talent_hub_applications;
CREATE POLICY tha_talent_insert ON public.talent_hub_applications
  FOR INSERT WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_hub_applications.talent_profile_id
        AND tp.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.agency_domains ad
      WHERE ad.tenant_id = talent_hub_applications.tenant_id
        AND ad.kind = 'hub'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.agency_talent_roster r
      WHERE r.talent_profile_id = talent_hub_applications.talent_profile_id
        AND r.exclusivity_status IN ('confirmed', 'auto_assigned')
        AND r.status NOT IN ('removed', 'rejected')
    )
  );

DROP POLICY IF EXISTS tha_talent_withdraw ON public.talent_hub_applications;
CREATE POLICY tha_talent_withdraw ON public.talent_hub_applications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_hub_applications.talent_profile_id
        AND tp.user_id = auth.uid()
    )
    AND status = 'pending'
  )
  WITH CHECK (
    status = 'withdrawn'
  );

DROP POLICY IF EXISTS tha_staff_select ON public.talent_hub_applications;
CREATE POLICY tha_staff_select ON public.talent_hub_applications
  FOR SELECT USING (
    public.is_staff_of_tenant(tenant_id)
  );

DROP POLICY IF EXISTS tha_staff_update ON public.talent_hub_applications;
CREATE POLICY tha_staff_update ON public.talent_hub_applications
  FOR UPDATE USING (
    public.is_staff_of_tenant(tenant_id)
  )
  WITH CHECK (
    public.is_staff_of_tenant(tenant_id)
  );

COMMENT ON TABLE public.talent_hub_applications IS
  'Talent-initiated applications to a hub tenant (agency_domains.kind=hub). Decision-log L47 (2026-05-26).';
