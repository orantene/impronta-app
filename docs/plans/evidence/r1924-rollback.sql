-- r1924 rollback: restores taa_talent_insert and tha_talent_insert to their definitions in
-- 20260615200003_rls_initplan_optimize.sql (latest earlier definitions). NOT in supabase/migrations; apply only by hand with a GO.

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
  WHERE ((r.talent_profile_id = talent_agency_applications.talent_profile_id) AND (r.exclusivity_status = ANY (ARRAY['confirmed'::exclusivity_status, 'auto_assigned'::exclusivity_status])) AND (r.status <> ALL (ARRAY['removed'::text, 'rejected'::text]))))))));

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
  WHERE ((r.talent_profile_id = talent_hub_applications.talent_profile_id) AND (r.exclusivity_status = ANY (ARRAY['confirmed'::exclusivity_status, 'auto_assigned'::exclusivity_status])) AND (r.status <> ALL (ARRAY['removed'::text, 'rejected'::text]))))))));
