-- Reserve the `eventos` slug (layer 2 of 2) now that /eventos resolves on a
-- tenant host.
--
-- The Spanish canonical of an event page is `/es/eventos/<slug>` (owner ask,
-- 2026-09-17). The proxy 301s the bare `/eventos/<slug>` onto it and rewrites
-- it internally to the `/events/<slug>` route, so a CMS page authored at the
-- slug `eventos` could never open. Layer 1 is
-- web/src/lib/site-admin/reserved-routes.ts; layer 2 is this table plus
-- cms_pages_reserved_slug_guard. Same shape as 20261229000500 for `me`.
--
-- Additive only: one row, ON CONFLICT DO NOTHING. System-owned rows bypass the
-- guard, and existing pages are blocked only if someone renames onto the word.

BEGIN;

INSERT INTO public.platform_reserved_slugs (slug, reason) VALUES
  ('eventos', 'Spanish canonical of /events (/es/eventos/<slug>), a platform route on every tenant host, not tenant-authored')
ON CONFLICT (slug) DO NOTHING;

COMMIT;
