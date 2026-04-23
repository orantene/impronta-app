-- ---------------------------------------------------------------------------
-- agency_business_identity — unrestricted public SELECT
-- ---------------------------------------------------------------------------
-- The previous policy USING (tenant_id = public.current_tenant_id()) required
-- the GUC to be set on the request. The public Supabase client
-- (createPublicSupabaseClient) uses the anon key and never sets that GUC, so
-- every anon read returned zero rows and the storefront fell back to the
-- platform default brand ("IMPRONTA"), leaking across tenants.
--
-- The fields in this table (public_name, tagline, contact email, socials,
-- SEO defaults) are rendered on every public storefront page by design —
-- they are the opposite of secret. Mirror agency_branding_public_select,
-- which is already USING (TRUE) for the same reason.

DROP POLICY IF EXISTS agency_business_identity_public_select
  ON public.agency_business_identity;
CREATE POLICY agency_business_identity_public_select
  ON public.agency_business_identity
  FOR SELECT
  USING (TRUE);
