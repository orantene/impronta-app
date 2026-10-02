-- Support Desk Phase 1a: register support.tulala.digital (and local mirror)
-- as a platform `app` host so the proxy can resolve it. The host stays DEAD
-- at the edge while SUPPORT_DESK_ENABLED is off (see web/src/lib/support/desk-host.ts)
-- even after this row is active. `support` is already a reserved platform
-- subdomain label (platform_subdomain_label_taken). Idempotent.

BEGIN;

INSERT INTO public.agency_domains
  (tenant_id, hostname, kind, is_primary, status, verified_at, ssl_provisioned_at)
VALUES
  (NULL, 'support.tulala.digital', 'app', FALSE, 'active', now(), now()),
  (NULL, 'support.local', 'app', FALSE, 'active', now(), NULL)
ON CONFLICT (hostname) DO UPDATE
  SET kind = EXCLUDED.kind,
      tenant_id = EXCLUDED.tenant_id,
      status = EXCLUDED.status,
      verified_at = COALESCE(public.agency_domains.verified_at, EXCLUDED.verified_at),
      ssl_provisioned_at = COALESCE(
        public.agency_domains.ssl_provisioned_at,
        EXCLUDED.ssl_provisioned_at
      ),
      updated_at = now();

COMMIT;
