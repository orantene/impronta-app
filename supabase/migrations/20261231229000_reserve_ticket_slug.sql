-- Package 3: reserve the `ticket` slug so /ticket/<code> cannot be shadowed.

BEGIN;

INSERT INTO public.platform_reserved_slugs (slug, reason)
VALUES
  ('ticket', 'Package 3: /ticket/<signed-code> is ticket self-service and resolves on agency and hub hosts, so a CMS page at this slug could never open.')
ON CONFLICT (slug) DO NOTHING;

COMMIT;
