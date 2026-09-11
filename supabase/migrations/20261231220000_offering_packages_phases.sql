-- Package 2 task 5: package composition and dated price phases.
-- A phase never rewrites a line that already carries price_phase_id.

BEGIN;

CREATE TABLE IF NOT EXISTS public.offering_components (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  offering_id           uuid NOT NULL REFERENCES public.talent_offerings(id) ON DELETE CASCADE,
  component_offering_id uuid NOT NULL REFERENCES public.talent_offerings(id) ON DELETE RESTRICT,
  qty                   integer NOT NULL,
  required              boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offering_components_qty_pos CHECK (qty >= 1),
  CONSTRAINT offering_components_not_self CHECK (offering_id IS DISTINCT FROM component_offering_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS offering_components_pair_uniq
  ON public.offering_components (offering_id, component_offering_id);

CREATE INDEX IF NOT EXISTS offering_components_tenant_idx
  ON public.offering_components (tenant_id, offering_id);

ALTER TABLE public.offering_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offering_components FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offering_components_select_staff ON public.offering_components;
CREATE POLICY offering_components_select_staff ON public.offering_components
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.offering_components FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.offering_components TO authenticated;
GRANT ALL ON public.offering_components TO service_role;

CREATE TABLE IF NOT EXISTS public.offering_price_phases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.talent_offerings(id) ON DELETE CASCADE,
  variant_id  uuid,
  label       text NOT NULL,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz,
  price_cents bigint NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offering_price_phases_label_shape CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  CONSTRAINT offering_price_phases_price_nonneg CHECK (price_cents >= 0),
  CONSTRAINT offering_price_phases_window CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS offering_price_phases_live_idx
  ON public.offering_price_phases (offering_id, variant_id, starts_at);

ALTER TABLE public.offering_price_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offering_price_phases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offering_price_phases_select_staff ON public.offering_price_phases;
CREATE POLICY offering_price_phases_select_staff ON public.offering_price_phases
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.offering_price_phases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.offering_price_phases TO authenticated;
GRANT ALL ON public.offering_price_phases TO service_role;

ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS price_phase_id uuid;

COMMENT ON COLUMN public.order_lines.price_phase_id IS
  'Phase that priced this line. Once set, reprice must not change unit_cents from a later phase.';

DO $proof$
BEGIN
  IF to_regclass('public.offering_components') IS NULL THEN
    RAISE EXCEPTION 'offering_components missing';
  END IF;
  IF to_regclass('public.offering_price_phases') IS NULL THEN
    RAISE EXCEPTION 'offering_price_phases missing';
  END IF;
END
$proof$;

COMMIT;
