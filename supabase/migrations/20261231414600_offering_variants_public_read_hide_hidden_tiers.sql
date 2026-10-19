-- Hidden / comp ticket tiers must not be readable anonymously.
--
-- 20261229000364 added talent_offering_variants.is_hidden ("not listed on the
-- public page; reachable by link ... a comp is a hidden tier at zero") but
-- offering_variants_public_read (20260709051219) was never given the predicate.
-- Any anon / signed-in PostgREST caller could therefore
--   GET /rest/v1/talent_offering_variants?is_hidden=eq.true
-- and read every guest-list / comp tier of a published public offering.
--
-- Fix: the public policy now requires NOT is_hidden, unless the caller is staff
-- of the offering's tenant (is_staff_of_tenant reads auth.uid(), so it is false
-- for anon). Staff keep the read they relied on in loadWorkspaceEvents, which
-- uses the session client. Server paths for the buyer flow, door, POS, catalog
-- grid and order pricing use the service role and are unaffected. The owner
-- policy (offering_variants_owner_read) is untouched.
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE. APPLIED to staging and production 2026-10-18 (Oran: do all DB security fixes tonight).

BEGIN;

DROP POLICY IF EXISTS offering_variants_public_read ON public.talent_offering_variants;
CREATE POLICY offering_variants_public_read ON public.talent_offering_variants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.talent_offerings o
      WHERE o.id = offering_id
        AND o.status = 'published'
        AND o.visibility IN ('public','on_request')
        AND o.moderation_state = 'approved'
        AND (
          NOT talent_offering_variants.is_hidden
          OR public.is_staff_of_tenant(o.tenant_id)
        )
    )
  );

COMMIT;
