-- HELD MIGRATION (TUL-1603): each person's own answer on a project assignment.
--
-- One row per assignment seat (booking_talent.id): the person confirmed or
-- declined. The Event board on Projects > Team reads it; the guarded server
-- action writes it, and only for the signed-in person's OWN seat.
--
-- ADDITIVE and IDEMPOTENT: one new table, IF NOT EXISTS everywhere. No existing
-- table or column changes. The code reads fail-closed: a missing table or
-- column (42P01 / 42703 / PGRST205) means "no state" and nobody shows as
-- confirmed; any other read error means unknown, also not confirmed. So the
-- code is safe to ship BEFORE this runs.
--
-- Writes go through the service role only (RLS on, no write policy). Staff of
-- the tenant can read.
--
-- NEEDS Production Migration Manager + Oran's OK. NOT APPLIED.
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.project_assignment_confirmations;
-- (No other object depends on it.)

CREATE TABLE IF NOT EXISTS public.project_assignment_confirmations (
  booking_talent_id  uuid        PRIMARY KEY REFERENCES public.booking_talent(id) ON DELETE CASCADE,
  tenant_id          uuid        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  booking_id         uuid        NOT NULL REFERENCES public.agency_bookings(id) ON DELETE CASCADE,
  talent_profile_id  uuid        NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  status             text        NOT NULL CHECK (status IN ('confirmed','declined')),
  responded_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_assignment_confirmations_booking
  ON public.project_assignment_confirmations (tenant_id, booking_id);

ALTER TABLE public.project_assignment_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_assignment_confirmations_staff_read ON public.project_assignment_confirmations;
CREATE POLICY project_assignment_confirmations_staff_read ON public.project_assignment_confirmations
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR public.is_staff_of_tenant(tenant_id));

REVOKE ALL ON public.project_assignment_confirmations FROM anon;
