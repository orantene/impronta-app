-- TUL-1924: exclusivity binds only through the talent's PRIMARY roster row.
-- agency_talent_roster.exclusivity_status is the lifecycle of the is_primary flag, but it defaults to
-- 'confirmed' on every row, so any non-primary row (hub, secondary studio) wrongly blocked applying.
-- Only the exclusivity predicate changes: it now requires is_primary and a different tenant.
-- Every other clause is identical to the definition in 20260615200003_rls_initplan_optimize.sql.
-- The same fix is applied to tha_talent_insert on talent_hub_applications (same predicate, hub clause kept).
-- No data is changed.
DROP POLICY IF EXISTS "taa_talent_insert" ON public."talent_agency_applications";
CREATE POLICY "taa_talent_insert" ON public."talent_agency_applications"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((status = 'pending'::talent_application_status) AND (EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_agency_applications.talent_profile_id) AND (tp.user_id = (select auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM agencies a
  WHERE ((a.id = talent_agency_applications.tenant_id) AND (a.accepts_open_applications = true)))) AND (NOT (EXISTS ( SELECT 1
   FROM agency_talent_roster r
  WHERE ((r.talent_profile_id = talent_agency_applications.talent_profile_id) AND (r.is_primary = true) AND (r.tenant_id <> talent_agency_applications.tenant_id) AND (r.exclusivity_status = ANY (ARRAY['confirmed'::exclusivity_status, 'auto_assigned'::exclusivity_status])) AND (r.status <> ALL (ARRAY['removed'::text, 'rejected'::text]))))))));

DROP POLICY IF EXISTS "tha_talent_insert" ON public."talent_hub_applications";
CREATE POLICY "tha_talent_insert" ON public."talent_hub_applications"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((status = 'pending'::talent_application_status) AND (EXISTS ( SELECT 1
   FROM talent_profiles tp
  WHERE ((tp.id = talent_hub_applications.talent_profile_id) AND (tp.user_id = (select auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM agency_domains ad
  WHERE ((ad.tenant_id = talent_hub_applications.tenant_id) AND (ad.kind = 'hub'::text)))) AND (NOT (EXISTS ( SELECT 1
   FROM agency_talent_roster r
  WHERE ((r.talent_profile_id = talent_hub_applications.talent_profile_id) AND (r.is_primary = true) AND (r.tenant_id <> talent_hub_applications.tenant_id) AND (r.exclusivity_status = ANY (ARRAY['confirmed'::exclusivity_status, 'auto_assigned'::exclusivity_status])) AND (r.status <> ALL (ARRAY['removed'::text, 'rejected'::text]))))))));
