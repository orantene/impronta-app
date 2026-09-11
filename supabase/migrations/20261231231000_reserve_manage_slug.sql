-- Reserve the `manage` slug (layer 2 of 2) now that /manage/<token> resolves
-- on a tenant host: the customer's own booking page (A07 / R04, Package 2's
-- signed manage token). Layer 1 is web/src/lib/site-admin/reserved-routes.ts.
-- Same shape as 20261231209000_reserve_pay_slug.sql. Additive only.

BEGIN;

INSERT INTO public.platform_reserved_slugs (slug, reason) VALUES
  ('manage', 'Customer self-manage: /manage/<token> is the public cancel or reschedule page and resolves on agency and hub hosts, so a CMS page at this slug could never open.')
ON CONFLICT (slug) DO NOTHING;

COMMIT;
