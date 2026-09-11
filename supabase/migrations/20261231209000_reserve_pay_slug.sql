-- Package 1: reserve the `pay` slug so /pay/<code> cannot be shadowed by a CMS page.

BEGIN;

INSERT INTO public.platform_reserved_slugs (slug, reason)
VALUES
  ('pay', 'POS: /pay/<code> is the public payment link and resolves on agency and hub hosts, so a CMS page at this slug could never open.')
ON CONFLICT (slug) DO NOTHING;

COMMIT;
