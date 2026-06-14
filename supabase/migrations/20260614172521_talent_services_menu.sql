-- Talent Rate → Services Menu (foundation, S1/S2).
-- A talent publishes a MENU of services priced by different units; a selected
-- service later pre-fills an offer line item (the money rail is unchanged).

-- 1) Extend the offer pricing_unit enum so a service's pricingType is a valid
--    offer line unit (the services-menu→offer mapper is then the identity).
--    ADD VALUE IF NOT EXISTS is idempotent; each value is additive + safe.
ALTER TYPE public.pricing_unit ADD VALUE IF NOT EXISTS 'half_day';
ALTER TYPE public.pricing_unit ADD VALUE IF NOT EXISTS 'per_person';
ALTER TYPE public.pricing_unit ADD VALUE IF NOT EXISTS 'per_contact';
ALTER TYPE public.pricing_unit ADD VALUE IF NOT EXISTS 'flat_package';
ALTER TYPE public.pricing_unit ADD VALUE IF NOT EXISTS 'custom';

-- 2) The services-menu store: a JSONB array of ServiceMenuItem
--    (see web/src/lib/talent/services-menu-types.ts).
ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS services_menu jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.talent_profiles.services_menu IS
  'Talent menu of services (ServiceMenuItem[]). A selected service pre-fills an offer line item / instant-book; no money math stored here.';
