-- Tenant Registration Engine — per-workspace "Open for registration" settings.
--
-- One row per tenant governs whether talent can join that workspace's roster
-- directly from its public storefront, and under what policy:
--   closed     — invite-only (default; behaves like today)
--   open       — anyone registers and joins immediately (roster status='active')
--   approval   — applicant creates a pending roster row; a Manager+ approves
--   exclusive  — joining grants exclusive representation; ALWAYS routed through
--                approval (never auto-accept). Exclusivity is enforced by the
--                existing single-exclusive-agency constraint on
--                agency_talent_roster (is_primary partial unique) + the
--                resolveExclusivityForRosterAdd() resolver at approve time.
--
-- Reuses agency_talent_roster for the actual join-requests (status='pending' /
-- 'active') — NO parallel request table. This row is policy/config only.
--
-- Plan gating (which modes a plan may SELECT) lives in code
-- (web/src/lib/access/registration-modes.ts), not in the DB, so it stays in
-- step with the plan catalog. Seat caps stay enforced by
-- checkRosterSeatAvailability() reading agencies.talent_seat_limit.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_registration_settings (
  tenant_id                 UUID        PRIMARY KEY
                                          REFERENCES public.agencies(id) ON DELETE CASCADE,
  enabled                   BOOLEAN     NOT NULL DEFAULT FALSE,
  mode                      TEXT        NOT NULL DEFAULT 'closed'
                                          CHECK (mode IN ('closed','open','approval','exclusive')),
  default_roster_visibility TEXT        NOT NULL DEFAULT 'roster_only'
                                          CHECK (default_roster_visibility IN ('roster_only','site_visible')),
  cta_label                 TEXT        NOT NULL DEFAULT 'Join the team'
                                          CHECK (char_length(cta_label) BETWEEN 1 AND 60),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by                UUID        REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.tenant_registration_settings IS
  'Per-workspace "Open for registration" policy. mode governs how a public-site registrant lands on agency_talent_roster (closed=no public join; open=active; approval/exclusive=pending until a Manager+ approves). Config only — join-requests reuse agency_talent_roster.';

ALTER TABLE public.tenant_registration_settings ENABLE ROW LEVEL SECURITY;

-- Workspace staff manage their own row (tenant-scoped, same predicate the rest
-- of the per-tenant tables use post-Phase-2).
DROP POLICY IF EXISTS tenant_registration_settings_staff_all ON public.tenant_registration_settings;
CREATE POLICY tenant_registration_settings_staff_all ON public.tenant_registration_settings
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- Public read of the CTA config only when registration is actually enabled, so
-- the storefront can render the "Join the team" button / decide modal entry
-- paths without a privileged session. Closed workspaces leak nothing. The
-- policy resolver runs under the service role and bypasses RLS regardless.
DROP POLICY IF EXISTS tenant_registration_settings_public_enabled ON public.tenant_registration_settings;
CREATE POLICY tenant_registration_settings_public_enabled ON public.tenant_registration_settings
  FOR SELECT
  USING (enabled = TRUE);

CREATE OR REPLACE FUNCTION public.tenant_registration_settings_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_registration_settings_touch_updated_at ON public.tenant_registration_settings;
CREATE TRIGGER trg_tenant_registration_settings_touch_updated_at
  BEFORE UPDATE ON public.tenant_registration_settings
  FOR EACH ROW EXECUTE FUNCTION public.tenant_registration_settings_touch_updated_at();

COMMIT;
