-- SaaS Phase 1 / P1.A.2 — public.agency_memberships (staff ↔ tenant link).
--
-- Ref: docs/saas/phase-0/01-entity-ownership-map.md §4,
--      docs/saas/phase-0/02-capabilities-and-roles.md §3–§4,
--      docs/saas/phase-0/03-state-machines.md §2–§3 (membership + invitation),
--      docs/saas/phase-1/o1-o7-resolutions.md O7 (one person can be both
--          talent and agency staff — multiple rows per profile allowed).
--
-- Phase 1 adds the table; Phase 2 migrates capability resolution to read
-- from here instead of profiles.app_role. profiles.app_role stays in place
-- during the transition (O4 deferred).

BEGIN;

CREATE TABLE IF NOT EXISTS public.agency_memberships (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL REFERENCES public.agencies(id)     ON DELETE CASCADE,
  profile_id           UUID        NOT NULL REFERENCES public.profiles(id)     ON DELETE CASCADE,
  role                 TEXT        NOT NULL
                                     CHECK (role IN ('owner','admin','coordinator','editor','viewer')),
  status               TEXT        NOT NULL DEFAULT 'active'
                                     CHECK (status IN (
                                       'invited','pending_acceptance','active',
                                       'suspended','removed','expired_invite'
                                     )),
  invited_by           UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_at           TIMESTAMPTZ,
  invite_expires_at    TIMESTAMPTZ,
  accepted_at          TIMESTAMPTZ,
  removed_at           TIMESTAMPTZ,
  removed_by           UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agency_memberships IS
  'Membership of a profile in an agency, with role + lifecycle status. O7: a profile may have multiple rows across tenants, and may also own a talent_profiles row. Phase 2 makes this the capability source of truth for agency scope.';

-- One active/invited row per (tenant, profile). Multiple historical 'removed' rows allowed.
CREATE UNIQUE INDEX IF NOT EXISTS agency_memberships_tenant_profile_live_uniq
  ON public.agency_memberships (tenant_id, profile_id)
  WHERE status IN ('invited','pending_acceptance','active','suspended','expired_invite');

CREATE INDEX IF NOT EXISTS agency_memberships_profile_idx
  ON public.agency_memberships (profile_id);

CREATE INDEX IF NOT EXISTS agency_memberships_tenant_role_idx
  ON public.agency_memberships (tenant_id, role)
  WHERE status = 'active';

-- Exactly-one owner guarantee: at most one active owner per tenant.
-- Plan §18 "Ownership transfer is a controlled action" is enforced here at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS agency_memberships_tenant_owner_uniq
  ON public.agency_memberships (tenant_id)
  WHERE role = 'owner' AND status = 'active';

-- Seed tenant #1 owner row.
--
-- Strategy: pick the oldest super_admin profile as the owner placeholder.
-- If none exists (fresh DB), skip the seed — Phase 2/3 admin provisioning will
-- fill it in. Safe because an empty agency_memberships table is a valid state
-- during transition (profiles.app_role still carries permissions in Phase 1).
INSERT INTO public.agency_memberships (
  tenant_id, profile_id, role, status, accepted_at
)
SELECT '00000000-0000-0000-0000-000000000001'::UUID,
       p.id,
       'owner',
       'active',
       now()
FROM public.profiles p
WHERE p.app_role = 'super_admin'
ORDER BY p.created_at ASC
LIMIT 1
ON CONFLICT DO NOTHING;

ALTER TABLE public.agency_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_memberships_staff_all ON public.agency_memberships;
CREATE POLICY agency_memberships_staff_all ON public.agency_memberships
  FOR ALL
  USING       (public.is_agency_staff())
  WITH CHECK  (public.is_agency_staff());

DROP POLICY IF EXISTS agency_memberships_self_select ON public.agency_memberships;
CREATE POLICY agency_memberships_self_select ON public.agency_memberships
  FOR SELECT
  USING (profile_id = auth.uid());

CREATE OR REPLACE FUNCTION public.agency_memberships_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_memberships_touch_updated_at ON public.agency_memberships;
CREATE TRIGGER trg_agency_memberships_touch_updated_at
  BEFORE UPDATE ON public.agency_memberships
  FOR EACH ROW EXECUTE FUNCTION public.agency_memberships_touch_updated_at();

COMMIT;
