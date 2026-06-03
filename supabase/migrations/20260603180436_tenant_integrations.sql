-- Tenant Integrations — Phase 0 (backend + data only; NO UI yet).
--
-- Per-tenant BYO integration credentials + config, mirroring the AI subsystem's
-- inherit|custom credential-vault pattern. Phase 0 ships ONE integration
-- (google_maps) so a tenant can supply their own referer-restricted Google Maps
-- JS + Places key on their own custom domain, with graceful fallback to the
-- platform env key when credential_mode='inherit' (or no secret is stored).
--
-- Two tables:
--   tenant_integrations         — one row per (tenant, integration_key): the
--                                 mode/status/config. PUBLIC identifiers
--                                 (GA4 measurement IDs, pixel IDs, GTM IDs, map
--                                 IDs) live in config_json — never secret.
--   tenant_integration_secrets  — encrypted secrets ONLY (e.g. API keys), one
--                                 row per (tenant, integration_key, secret_field).
--                                 ciphertext is AES-256-GCM (credential-vault).
--                                 NO anon/public SELECT policy — staff-of-tenant
--                                 only. The service-role resolver bypasses RLS.
--
-- RLS predicate + updated_at trigger pattern copied verbatim from
-- 20261011073000_tenant_registration_settings.sql.

BEGIN;

-- ---------------------------------------------------------------------------
-- tenant_integrations: mode + status + PUBLIC config (jsonb)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_integrations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL
                                  REFERENCES public.agencies(id) ON DELETE CASCADE,
  integration_key   TEXT        NOT NULL,
  credential_mode   TEXT        NOT NULL DEFAULT 'inherit'
                                  CHECK (credential_mode IN ('inherit','custom')),
  status            TEXT        NOT NULL DEFAULT 'not_configured'
                                  CHECK (status IN ('not_configured','inherited','connected','error','disabled')),
  config_json       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  connection_method TEXT        NOT NULL DEFAULT 'manual'
                                  CHECK (connection_method IN ('inherit','manual','oauth')),
  last_verified_at  TIMESTAMPTZ,
  last_error        TEXT,
  created_by        UUID,
  updated_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, integration_key)
);

COMMENT ON TABLE public.tenant_integrations IS
  'Per-tenant integration config (one row per tenant+integration_key). credential_mode inherit|custom mirrors the AI credential-vault pattern. PUBLIC identifiers (GA4/pixel/GTM/map IDs) live in config_json; true secrets live encrypted in tenant_integration_secrets.';

ALTER TABLE public.tenant_integrations ENABLE ROW LEVEL SECURITY;

-- Workspace staff manage their own tenant's rows (same predicate the rest of the
-- per-tenant tables use).
DROP POLICY IF EXISTS tenant_integrations_staff_all ON public.tenant_integrations;
CREATE POLICY tenant_integrations_staff_all ON public.tenant_integrations
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

CREATE OR REPLACE FUNCTION public.tenant_integrations_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_integrations_touch_updated_at ON public.tenant_integrations;
CREATE TRIGGER trg_tenant_integrations_touch_updated_at
  BEFORE UPDATE ON public.tenant_integrations
  FOR EACH ROW EXECUTE FUNCTION public.tenant_integrations_touch_updated_at();

-- ---------------------------------------------------------------------------
-- tenant_integration_secrets: encrypted secrets ONLY
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_integration_secrets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL
                                REFERENCES public.agencies(id) ON DELETE CASCADE,
  integration_key TEXT        NOT NULL,
  secret_field    TEXT        NOT NULL,
  ciphertext      TEXT        NOT NULL,
  last4           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, integration_key, secret_field)
);

COMMENT ON TABLE public.tenant_integration_secrets IS
  'Encrypted per-tenant integration secrets (AES-256-GCM ciphertext from credential-vault). One row per tenant+integration_key+secret_field. NO public/anon SELECT — staff-of-tenant only; the service-role resolver bypasses RLS for runtime key resolution.';

ALTER TABLE public.tenant_integration_secrets ENABLE ROW LEVEL SECURITY;

-- Staff-of-tenant only. Deliberately NO public/anon SELECT policy: secrets must
-- never be readable without a privileged session. Runtime resolution runs under
-- the service role (createServiceRoleClient), which bypasses RLS.
DROP POLICY IF EXISTS tenant_integration_secrets_staff_all ON public.tenant_integration_secrets;
CREATE POLICY tenant_integration_secrets_staff_all ON public.tenant_integration_secrets
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

CREATE OR REPLACE FUNCTION public.tenant_integration_secrets_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_integration_secrets_touch_updated_at ON public.tenant_integration_secrets;
CREATE TRIGGER trg_tenant_integration_secrets_touch_updated_at
  BEFORE UPDATE ON public.tenant_integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.tenant_integration_secrets_touch_updated_at();

COMMIT;
