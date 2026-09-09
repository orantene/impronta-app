-- Journeys remaining holes: bar tab vs table check (C07), gallery
-- selection on a deliverable (C37), lesson-package drawdown (C39).
--
-- Timestamp sorts after 20261230000500. Do not use calendar 20260908.

BEGIN;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS service_kind text NOT NULL DEFAULT 'table';

ALTER TABLE public.visits
  DROP CONSTRAINT IF EXISTS visits_service_kind_check;

ALTER TABLE public.visits
  ADD CONSTRAINT visits_service_kind_check
  CHECK (service_kind IN ('table', 'tab'));

COMMENT ON COLUMN public.visits.service_kind IS
  'C07: a tab is occupancy that is not a table check. Booth/table stays table; the bar rail uses tab.';

ALTER TABLE public.booking_deliverables
  ADD COLUMN IF NOT EXISTS selected_asset_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.booking_deliverables.selected_asset_ids IS
  'C37: client gallery picks. Print add-ons stay extra lines on the same order.';

CREATE TABLE IF NOT EXISTS public.lesson_packages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  booking_id       uuid NOT NULL REFERENCES public.agency_bookings(id) ON DELETE CASCADE,
  original_units   integer NOT NULL CHECK (original_units >= 1),
  remaining_units  integer NOT NULL CHECK (remaining_units >= 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_packages_remaining_lte_original CHECK (remaining_units <= original_units),
  CONSTRAINT lesson_packages_one_per_booking UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS lesson_packages_tenant_idx
  ON public.lesson_packages (tenant_id);

COMMENT ON TABLE public.lesson_packages IS
  'C39: lesson package drawdown. Unused remaining_units is the refundable balance. Not a second commercial order.';

ALTER TABLE public.lesson_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_packages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lesson_packages_select_staff ON public.lesson_packages;
CREATE POLICY lesson_packages_select_staff ON public.lesson_packages
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.lesson_packages FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.lesson_packages FROM anon;

GRANT SELECT ON TABLE public.lesson_packages TO authenticated;
GRANT ALL ON TABLE public.lesson_packages TO service_role;

COMMIT;
