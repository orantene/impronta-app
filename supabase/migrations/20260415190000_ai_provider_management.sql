-- Multi-tenant-ready AI provider registry, encrypted secrets (app-layer), tenant controls, audit.
-- Runtime reads secrets via service role only; masked hints live on instances for staff UI.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE public.ai_provider_registry_kind AS ENUM ('none', 'openai', 'anthropic', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.ai_credential_mode AS ENUM ('platform', 'agency', 'inherit');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.ai_credential_ui_state AS ENUM (
    'unset',
    'active',
    'disabled',
    'invalid',
    'needs_billing'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.ai_provider_unavailable_behavior AS ENUM ('graceful', 'strict');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE public.ai_provider_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  kind public.ai_provider_registry_kind NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT false,
  disabled BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  credential_source public.ai_credential_mode NOT NULL DEFAULT 'inherit',
  credential_ui_state public.ai_credential_ui_state NOT NULL DEFAULT 'unset',
  credential_masked_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ai_provider_instances_one_default_per_tenant
  ON public.ai_provider_instances (tenant_id)
  WHERE is_default = true;

CREATE INDEX ai_provider_instances_tenant_kind
  ON public.ai_provider_instances (tenant_id, kind);

CREATE TABLE public.ai_provider_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_instance_id UUID NOT NULL REFERENCES public.ai_provider_instances (id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  key_version SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_instance_id)
);

CREATE TABLE public.ai_tenant_controls (
  tenant_id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  credential_mode public.ai_credential_mode NOT NULL DEFAULT 'inherit',
  monthly_spend_cap_cents INT,
  warn_threshold_percent INT CHECK (
    warn_threshold_percent IS NULL
    OR (warn_threshold_percent >= 0 AND warn_threshold_percent <= 100)
  ),
  hard_stop_on_cap BOOLEAN NOT NULL DEFAULT true,
  max_requests_per_minute INT CHECK (max_requests_per_minute IS NULL OR max_requests_per_minute > 0),
  max_requests_per_month INT CHECK (max_requests_per_month IS NULL OR max_requests_per_month > 0),
  provider_unavailable_behavior public.ai_provider_unavailable_behavior NOT NULL DEFAULT 'graceful',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_usage_monthly (
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  month_key TEXT NOT NULL,
  spend_cents INT NOT NULL DEFAULT 0,
  request_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, month_key)
);

CREATE TABLE public.ai_provider_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  actor_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_provider_audit_tenant_created ON public.ai_provider_audit (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.increment_ai_usage_monthly(
  p_tenant_id UUID,
  p_month_key TEXT,
  p_spend_delta_cents INT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ai_usage_monthly (tenant_id, month_key, spend_cents, request_count, updated_at)
  VALUES (p_tenant_id, p_month_key, GREATEST(p_spend_delta_cents, 0), 1, now())
  ON CONFLICT (tenant_id, month_key)
  DO UPDATE SET
    spend_cents = public.ai_usage_monthly.spend_cents + GREATEST(p_spend_delta_cents, 0),
    request_count = public.ai_usage_monthly.request_count + 1,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.increment_ai_usage_monthly(UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage_monthly(UUID, TEXT, INT) TO service_role;

-- Seed registry + controls (single-tenant default)
INSERT INTO public.ai_tenant_controls (tenant_id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO public.ai_provider_instances (tenant_id, kind, label, is_default, disabled, sort_order, credential_source)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'openai'::public.ai_provider_registry_kind,
    'OpenAI',
    true,
    false,
    0,
    'inherit'::public.ai_credential_mode
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'anthropic'::public.ai_provider_registry_kind,
    'Anthropic',
    false,
    false,
    1,
    'inherit'::public.ai_credential_mode
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'none'::public.ai_provider_registry_kind,
    'None (disable chat)',
    false,
    true,
    2,
    'inherit'::public.ai_credential_mode
  );

-- Align default provider with legacy settings.ai_provider when present
DO $$
DECLARE
  pref TEXT;
  openai_id UUID;
  anth_id UUID;
BEGIN
  SELECT (value #>> '{}')::text INTO pref FROM public.settings WHERE key = 'ai_provider';
  SELECT id INTO openai_id
  FROM public.ai_provider_instances
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND kind = 'openai'
  LIMIT 1;
  SELECT id INTO anth_id
  FROM public.ai_provider_instances
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND kind = 'anthropic'
  LIMIT 1;

  IF pref IS NOT NULL AND lower(trim(pref)) = 'anthropic' AND anth_id IS NOT NULL THEN
    UPDATE public.ai_provider_instances
    SET is_default = false, updated_at = now()
    WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
    UPDATE public.ai_provider_instances
    SET is_default = true, disabled = false, updated_at = now()
    WHERE id = anth_id;
  ELSIF openai_id IS NOT NULL THEN
    UPDATE public.ai_provider_instances
    SET is_default = false, updated_at = now()
    WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
    UPDATE public.ai_provider_instances
    SET is_default = true, disabled = false, updated_at = now()
    WHERE id = openai_id;
  END IF;
END
$$;

INSERT INTO public.settings (key, value, updated_at)
VALUES ('ai_translations_enabled', to_jsonb(false), now())
ON CONFLICT (key) DO NOTHING;

-- Preserve semantic search behavior for agencies that already enabled AI search.
INSERT INTO public.settings (key, value, updated_at)
VALUES ('ai_embeddings_semantic_enabled', to_jsonb(false), now())
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.settings
    WHERE key = 'ai_search_enabled'
      AND (value = to_jsonb(true) OR value = 'true'::jsonb OR value #>> '{}' = 'true')
  ) THEN
    UPDATE public.settings
    SET value = to_jsonb(true), updated_at = now()
    WHERE key = 'ai_embeddings_semantic_enabled';
  END IF;
END
$$;

ALTER TABLE public.ai_provider_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tenant_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_provider_instances_staff ON public.ai_provider_instances
  FOR ALL
  TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

-- Secrets: deny authenticated reads/writes — only service role (bypasses RLS)
CREATE POLICY ai_provider_secrets_deny_authenticated ON public.ai_provider_secrets
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY ai_tenant_controls_staff ON public.ai_tenant_controls
  FOR ALL
  TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

CREATE POLICY ai_usage_monthly_staff ON public.ai_usage_monthly
  FOR ALL
  TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

CREATE POLICY ai_provider_audit_select_staff ON public.ai_provider_audit
  FOR SELECT
  TO authenticated
  USING (public.is_agency_staff());

CREATE POLICY ai_provider_audit_insert_staff ON public.ai_provider_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_agency_staff());

COMMIT;
