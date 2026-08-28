-- Reserve the `book` slug (layer 2 of 3) before any tenant can seed a /book page.
--
-- Layer 1 is web/src/lib/site-admin/reserved-routes.ts. Layer 2 is this table
-- plus cms_pages_reserved_slug_guard. System-owned rows (is_system_owned)
-- bypass the guard, so PR-6 can seed the platform /book page after this lands.
-- Grandfathered tenant pages that already hold the word keep serving; they
-- are blocked only if someone renames onto it.

BEGIN;

INSERT INTO public.platform_reserved_slugs (slug, reason) VALUES
  ('book', 'appointments booking page, seeded by onboard-booking-page, not tenant-authored')
ON CONFLICT (slug) DO NOTHING;

COMMIT;
