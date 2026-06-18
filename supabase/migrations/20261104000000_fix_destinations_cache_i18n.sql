-- Fix refresh_talent_profile_destinations_cache() after the WS4 i18n migration.
--
-- WS4 dropped locations.display_name_en (replaced by display_name_i18n JSONB),
-- but this trigger function — fired AFTER INSERT/UPDATE/DELETE on
-- talent_service_areas by trg_talent_service_areas_refresh_cache — still
-- referenced loc.display_name_en. So EVERY service-area / home-base write threw
-- "column loc.display_name_en does not exist", which the app surfaced as
-- "Location: Could not save service areas." Saving a talent's location has been
-- broken since the WS4 column drop.
--
-- Repoint to display_name_i18n->>'en' (fallback 'es'), dropping NULL names so the
-- destinations TEXT[] cache stays clean. Idempotent (CREATE OR REPLACE).
-- Already applied to the live DB via execute_sql; this file records it.

CREATE OR REPLACE FUNCTION public.refresh_talent_profile_destinations_cache()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  affected_profile UUID;
BEGIN
  affected_profile := COALESCE(NEW.talent_profile_id, OLD.talent_profile_id);

  UPDATE public.talent_profiles AS tp
     SET destinations = COALESCE((
           SELECT array_agg(nm ORDER BY ord, nm)
             FROM (
               SELECT COALESCE(loc.display_name_i18n->>'en', loc.display_name_i18n->>'es') AS nm,
                      tsa.display_order AS ord
                 FROM public.talent_service_areas tsa
                 JOIN public.locations loc ON loc.id = tsa.location_id
                WHERE tsa.talent_profile_id = affected_profile
                  AND tsa.service_kind IN ('home_base','travel_to')
             ) q
            WHERE nm IS NOT NULL
         ), ARRAY[]::TEXT[])
   WHERE tp.id = affected_profile;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
