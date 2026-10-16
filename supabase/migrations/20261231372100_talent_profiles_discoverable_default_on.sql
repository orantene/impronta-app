-- Directory: discoverable is ON for every approved profile (Oran, 2026-10-13).
-- Each Profesional can still switch it off (Discover page, "Show me in the
-- directory"). New profiles default to ON; the listing gates (approved,
-- public listing) still decide what actually appears.
-- NOT applied by the author: run `npm run db:push` after review.

ALTER TABLE public.talent_profiles
  ALTER COLUMN is_discoverable SET DEFAULT TRUE;

UPDATE public.talent_profiles
   SET is_discoverable = TRUE
 WHERE workflow_status = 'approved'
   AND is_discoverable = FALSE;

COMMENT ON COLUMN public.talent_profiles.is_discoverable IS
  'Talent master switch for the public directory / Discover. Default true; approved profiles were backfilled to true 2026-10-13. The Profesional can turn it off from the Discover page.';
