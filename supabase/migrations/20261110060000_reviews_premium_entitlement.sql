-- STANDING reviews — premium entitlement gate.
--
-- Reviews are a PREMIUM capability. `agency_entitlements.reviews_enabled` gates
-- the STANDING review surfaces per tenant (public profile reviews + testimonials,
-- directory-card standing, the talent Reviews page, and the client Reviews area).
-- Platform-write only (agency_entitlements is a platform-managed table). Default
-- FALSE so reviews are off until a tenant is on a review-enabled plan; a hub
-- controls its own surfaces independently via its own row.

BEGIN;

ALTER TABLE public.agency_entitlements
  ADD COLUMN IF NOT EXISTS reviews_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.agency_entitlements.reviews_enabled IS
  'Premium gate for the STANDING review surfaces (profile reviews + testimonials, card standing, talent Reviews page, client Reviews area). Gated on the SURFACE tenant, so hubs control independently. Platform-write only.';

COMMIT;
