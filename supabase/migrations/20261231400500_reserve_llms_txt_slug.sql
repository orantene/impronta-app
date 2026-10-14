-- Posts v1: reserve `llms.txt` so the AI-crawler index can never be shadowed by a CMS page.
-- Code half: PLATFORM_RESERVED_SLUGS in web/src/lib/site-admin/reserved-routes.ts.

BEGIN;

INSERT INTO public.platform_reserved_slugs (slug, reason)
VALUES
  ('llms.txt', 'Posts v1: /llms.txt is the AI-crawler index on tenant hosts, so a CMS page at this slug could never open.')
ON CONFLICT (slug) DO NOTHING;

COMMIT;
