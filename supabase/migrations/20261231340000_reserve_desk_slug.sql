-- Support Desk: reserve the `desk` slug so /desk cannot be shadowed by a CMS page.
-- Code half: PLATFORM_RESERVED_SLUGS in web/src/lib/site-admin/reserved-routes.ts.

BEGIN;

INSERT INTO public.platform_reserved_slugs (slug, reason)
VALUES
  ('desk', 'Support Desk: /desk is the product shell on app + support hosts, so a CMS page at this slug could never open.')
ON CONFLICT (slug) DO NOTHING;

COMMIT;
