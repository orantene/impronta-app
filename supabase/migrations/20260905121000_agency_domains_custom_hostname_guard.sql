-- Phase 4 — custom-domain guardrail:
-- prevent custom rows from claiming Tulala-managed platform hosts.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_reserved_platform_hostname(p_hostname TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_hostname IS NOT NULL
    AND (
      lower(trim(p_hostname)) IN (
        'tulala.digital',
        'www.tulala.digital',
        'app.tulala.digital',
        'staging.tulala.digital'
      )
      OR lower(trim(p_hostname)) LIKE '%.tulala.digital'
      OR lower(trim(p_hostname)) LIKE '%.studiobooking.io'
    );
$$;

ALTER TABLE public.agency_domains
  DROP CONSTRAINT IF EXISTS agency_domains_custom_hostname_guard;

ALTER TABLE public.agency_domains
  ADD CONSTRAINT agency_domains_custom_hostname_guard
  CHECK (
    kind <> 'custom'
    OR NOT public.is_reserved_platform_hostname(hostname)
  );

COMMENT ON FUNCTION public.is_reserved_platform_hostname(TEXT) IS
  'Returns true when a hostname is reserved for Tulala-managed platform domains.';

COMMENT ON CONSTRAINT agency_domains_custom_hostname_guard ON public.agency_domains IS
  'Blocks custom-domain rows from claiming Tulala-managed platform hosts.';

COMMIT;
