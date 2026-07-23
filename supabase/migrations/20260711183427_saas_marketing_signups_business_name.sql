-- Capture the business/project display name (and an optional short
-- description) on marketing leads.
--
-- Why: the /get-started form now leads with "Name your business", which both
-- (a) live-generates the workspace link slug and (b) is the human name the
-- workspace should be born with. Previously only the slug (subdomain_wanted)
-- and the PERSON's name were captured — the business's own name was lost, and
-- onboarding fell back to naming the tenant after the person.
--
-- `business_name`        — the display name the user typed (e.g. "Riviera Maya
--                          Work"). Nullable so legacy leads and the API stay
--                          backward-compatible. Onboarding prefers it over the
--                          person name when present (workspace-signup.server.ts).
-- `business_description` — optional short blurb from the collapsed disclosure;
--                          enriches the founder digest and seeds the page-builder
--                          AI "describe your page" front door during onboarding.
--
-- Additive, nullable, no backfill, no RLS change (table stays service-role
-- only). Idempotent via IF NOT EXISTS.

BEGIN;

ALTER TABLE public.saas_marketing_signups
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS business_description TEXT;

COMMENT ON COLUMN public.saas_marketing_signups.business_name IS
  'Business/project display name typed on /get-started. Onboarding names the '
  'tenant after this when present; also the source of the auto-generated slug.';
COMMENT ON COLUMN public.saas_marketing_signups.business_description IS
  'Optional short description from the /get-started disclosure. Enriches the '
  'founder digest and seeds the builder AI front door during onboarding.';

COMMIT;
