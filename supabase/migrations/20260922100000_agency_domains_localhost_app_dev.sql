-- Local dev + Playwright: register loopback hosts as kind='app' so middleware
-- resolves them the same as `app.local` (see 20260605100000). Without these
-- rows, `Host: localhost:3000` hits `not_found` before path-based tenant
-- dispatch (`/impronta?edit=1`) can run — see `web/src/proxy.ts`
-- `canResolvePathBasedTenant` + `isLocalhostHost`.

BEGIN;

INSERT INTO public.agency_domains
  (tenant_id, hostname, kind, is_primary, status, verified_at, ssl_provisioned_at)
VALUES
  (NULL, 'localhost', 'app', FALSE, 'active', now(), now()),
  (NULL, '127.0.0.1', 'app', FALSE, 'active', now(), now())
ON CONFLICT (hostname) DO UPDATE
  SET kind = EXCLUDED.kind,
      tenant_id = EXCLUDED.tenant_id,
      is_primary = EXCLUDED.is_primary,
      status = EXCLUDED.status,
      verified_at = COALESCE(public.agency_domains.verified_at, EXCLUDED.verified_at),
      ssl_provisioned_at = COALESCE(
        public.agency_domains.ssl_provisioned_at,
        EXCLUDED.ssl_provisioned_at
      ),
      updated_at = now();

COMMIT;
