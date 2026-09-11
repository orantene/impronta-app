-- P5 — reserve the `visit` slug (layer 2) now that /visit/<token> resolves
-- on a tenant host.
--
-- `reserved-routes.collisions.static.test.ts` named the gap: a CMS page
-- slugged "visit" would be unreachable because the occupancy route wins.
-- Layer 1 is PLATFORM_RESERVED_SLUGS; this table is the database half.
--
-- THE TUPLE MUST START A LINE — the static guard reads
-- `/^\s*\('([^']+)',/gm`. Formatting is load-bearing.

BEGIN;

INSERT INTO public.platform_reserved_slugs (slug, reason)
VALUES
  ('visit', 'P5 occupancy guest view: /visit/<public_token> resolves on every tenant host, so a CMS page at this slug could never open.')
ON CONFLICT (slug) DO NOTHING;

COMMIT;
