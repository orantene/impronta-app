-- Reserve the `link` slug (layer 2 of 2) now that /link/<code> resolves on a
-- tenant host: platform pay-host fallback (PICK: P / pay.tulala.digital).
-- Layer 1 is web/src/lib/site-admin/reserved-routes.ts.
-- Same shape as 20261231209000_reserve_pay_slug.sql. Additive only.
-- Distinct from QR `/q` (CANONICAL_LINK_PREFIX).

BEGIN;

INSERT INTO public.platform_reserved_slugs (slug, reason)
VALUES
  ('link', 'Platform payment-link fallback: /link/<code> is the public pay URL on pay.tulala.digital and resolves on agency and hub hosts, so a CMS page at this slug could never open.')
ON CONFLICT (slug) DO NOTHING;

COMMIT;

-- Applied remotely 2026-09-26 (schema_migrations version aligned).
