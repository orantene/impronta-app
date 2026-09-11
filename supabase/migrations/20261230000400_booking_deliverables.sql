-- P7-01 — booking deliverables (approval, revision limit, passthrough vs fee).
--
-- Service charges stay on booking_transactions / orders. A deliverable with
-- kind = 'passthrough_budget' is advertising or similar funds that must not be
-- mistaken for a service fee.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.
-- This file is not applied from this environment (no credentials).

BEGIN;

CREATE TABLE IF NOT EXISTS public.booking_deliverables (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  booking_id      uuid NOT NULL REFERENCES public.agency_bookings(id) ON DELETE CASCADE,
  title           text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('service', 'passthrough_budget')),
  status          text NOT NULL CHECK (status IN (
                    'draft', 'submitted', 'approved', 'revision_requested', 'cancelled'
                  )),
  revision        integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  revision_limit  integer NOT NULL DEFAULT 1 CHECK (revision_limit >= 0),
  due_at          timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_deliverables_booking_idx
  ON public.booking_deliverables (booking_id, status);

CREATE INDEX IF NOT EXISTS booking_deliverables_tenant_idx
  ON public.booking_deliverables (tenant_id, due_at);

COMMENT ON TABLE public.booking_deliverables IS
  'Work the client accepts. Revision rounds are counted here. passthrough_budget is not a service fee.';

ALTER TABLE public.booking_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_deliverables FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_deliverables_select_staff ON public.booking_deliverables;
CREATE POLICY booking_deliverables_select_staff ON public.booking_deliverables
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.booking_deliverables FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.booking_deliverables FROM anon;

GRANT SELECT ON TABLE public.booking_deliverables TO authenticated;
GRANT ALL ON TABLE public.booking_deliverables TO service_role;

COMMIT;
