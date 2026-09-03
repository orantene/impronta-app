-- Reserve the `me` slug (layer 2 of 2) now that /me resolves on a tenant host.
--
-- F5 adds `/me`, the customer's view of one tenant, to
-- AGENCY_STOREFRONT_PREFIXES. Once a root segment resolves on a tenant host, a
-- CMS page authored at that slug can never open, so it must be reserved on both
-- layers or the page is silently unreachable. Layer 1 is
-- web/src/lib/site-admin/reserved-routes.ts; layer 2 is this table plus
-- cms_pages_reserved_slug_guard. Same shape as 20261215000100 for `book`.
--
-- Verified before writing this: zero rows in public.cms_pages hold slug 'me',
-- so no tenant page is grandfathered or disturbed. System-owned rows bypass the
-- guard, and existing pages are blocked only if someone renames onto the word.

BEGIN;

INSERT INTO public.platform_reserved_slugs (slug, reason) VALUES
  ('me', 'customer home (/me), a platform route on every tenant host, not tenant-authored')
ON CONFLICT (slug) DO NOTHING;

COMMIT;
