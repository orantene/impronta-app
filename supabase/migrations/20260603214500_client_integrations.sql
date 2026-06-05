-- Client Integrations - client-owned social/professional trust proof.
--
-- Client connections complement the existing client_trust_state table. They
-- store account ownership proof and per-surface consent, while client_trust_state
-- remains the tenant-scoped trust level used by inquiries, bookings, and staff.
--
-- Manual links may be shared as context but are not verification evidence by
-- themselves. OAuth/API callbacks can mark metadata_cache.verification_status
-- and then feed tenant-specific trust evaluation later.

BEGIN;

-- ---------------------------------------------------------------------------
-- client_integrations: provider account + consent switches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_integrations (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_key             TEXT        NOT NULL,
  provider_account_id      TEXT,
  provider_account_label   TEXT,
  connection_method        TEXT        NOT NULL DEFAULT 'manual'
                                      CHECK (connection_method IN ('manual','oauth')),
  status                   TEXT        NOT NULL DEFAULT 'not_connected'
                                      CHECK (status IN ('not_connected','pending','connected','needs_reauth','error','disabled')),
  scopes                   TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  consent_version          TEXT        NOT NULL DEFAULT 'client-connections-v1',
  trust_signal_enabled     BOOLEAN     NOT NULL DEFAULT false,
  agency_visible           BOOLEAN     NOT NULL DEFAULT true,
  talent_visible           BOOLEAN     NOT NULL DEFAULT true,
  public_profile_enabled   BOOLEAN     NOT NULL DEFAULT false,
  auto_refresh_enabled     BOOLEAN     NOT NULL DEFAULT false,
  settings_json            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  metadata_cache           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at             TIMESTAMPTZ,
  last_verified_at         TIMESTAMPTZ,
  last_error               TEXT,
  created_by_user_id       UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by_user_id       UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider_key)
);

COMMENT ON TABLE public.client_integrations IS
  'Client-owned external account connections and consent switches for trust proof. Secrets live encrypted in client_integration_secrets.';

CREATE INDEX IF NOT EXISTS idx_client_integrations_user_status
  ON public.client_integrations (user_id, status);

CREATE INDEX IF NOT EXISTS idx_client_integrations_provider
  ON public.client_integrations (provider_key, status);

CREATE INDEX IF NOT EXISTS idx_client_integrations_staff_visible
  ON public.client_integrations (user_id)
  WHERE agency_visible = true;

ALTER TABLE public.client_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_integrations_own_all ON public.client_integrations;
CREATE POLICY client_integrations_own_all ON public.client_integrations
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS client_integrations_staff_select ON public.client_integrations;
CREATE POLICY client_integrations_staff_select ON public.client_integrations
  FOR SELECT
  USING (
    agency_visible = true
    AND EXISTS (
      SELECT 1 FROM public.client_trust_state cts
       WHERE cts.user_id = client_integrations.user_id
         AND public.is_staff_of_tenant(cts.tenant_id)
    )
  );

DROP POLICY IF EXISTS client_integrations_platform_admin_all ON public.client_integrations;
CREATE POLICY client_integrations_platform_admin_all ON public.client_integrations
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.client_integrations_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_integrations_touch_updated_at ON public.client_integrations;
CREATE TRIGGER trg_client_integrations_touch_updated_at
  BEFORE UPDATE ON public.client_integrations
  FOR EACH ROW EXECUTE FUNCTION public.client_integrations_touch_updated_at();

-- ---------------------------------------------------------------------------
-- client_integration_secrets: encrypted secrets only
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_integration_secrets (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_key      TEXT        NOT NULL,
  secret_field      TEXT        NOT NULL,
  ciphertext        TEXT        NOT NULL,
  last4             TEXT,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider_key, secret_field)
);

COMMENT ON TABLE public.client_integration_secrets IS
  'Encrypted per-client integration secrets (OAuth/API tokens). RLS denies authenticated/anon access; only service-role server code reads/writes ciphertext.';

ALTER TABLE public.client_integration_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_integration_secrets_deny_authenticated ON public.client_integration_secrets;
CREATE POLICY client_integration_secrets_deny_authenticated ON public.client_integration_secrets
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.client_integration_secrets_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_integration_secrets_touch_updated_at ON public.client_integration_secrets;
CREATE TRIGGER trg_client_integration_secrets_touch_updated_at
  BEFORE UPDATE ON public.client_integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.client_integration_secrets_touch_updated_at();

COMMIT;
