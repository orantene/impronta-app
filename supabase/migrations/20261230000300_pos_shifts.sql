-- P5-05 — POS shift cash-up.
--
-- One open shift per tenant. Cash still collects with no shift (counter sale).
-- Tenders stamp booking_transactions.metadata.shift_id when a shift is open.
-- Expected drawer cash is opening + sum of cash allocations on this shift
-- (change leaves the drawer; expected rises by the allocation, not the tender).
-- Navigating away from POS does not close a shift — closing is an explicit command.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.
-- This file is not applied from this environment (no credentials).

BEGIN;

CREATE TABLE IF NOT EXISTS public.pos_shifts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  status               text NOT NULL CHECK (status IN ('open', 'closed')),
  version              integer NOT NULL DEFAULT 1,
  opened_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at            timestamptz NOT NULL DEFAULT now(),
  closed_at            timestamptz,
  opening_cash_cents   integer NOT NULL DEFAULT 0 CHECK (opening_cash_cents >= 0),
  closing_cash_cents   integer CHECK (closing_cash_cents IS NULL OR closing_cash_cents >= 0),
  expected_cash_cents  integer CHECK (expected_cash_cents IS NULL OR expected_cash_cents >= 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_shifts_closed_when_closed CHECK (
    (status = 'open' AND closed_at IS NULL AND closing_cash_cents IS NULL AND expected_cash_cents IS NULL)
    OR (status = 'closed' AND closed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_shifts_one_open_per_tenant
  ON public.pos_shifts (tenant_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS pos_shifts_tenant_status_idx
  ON public.pos_shifts (tenant_id, status, opened_at DESC);

COMMENT ON TABLE public.pos_shifts IS
  'POS cash-up period. One open shift per tenant. Leaving the POS page does not close it.';
COMMENT ON COLUMN public.pos_shifts.expected_cash_cents IS
  'opening_cash_cents plus cash allocations stamped with this shift_id. Change is not added; the allocation is the drawer net.';
COMMENT ON COLUMN public.pos_shifts.version IS
  'Optimistic concurrency for close. Updates use WHERE version = :expected.';

ALTER TABLE public.pos_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_shifts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_shifts_select_staff ON public.pos_shifts;
CREATE POLICY pos_shifts_select_staff ON public.pos_shifts
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pos_shifts FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.pos_shifts FROM anon;

GRANT SELECT ON TABLE public.pos_shifts TO authenticated;
GRANT ALL ON TABLE public.pos_shifts TO service_role;

COMMIT;
