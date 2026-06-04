-- Talent Integrations — talent-owned connection consent + controls.
--
-- This is the talent-side counterpart to tenant_integrations:
--   talent_integrations         — one row per talent + provider, with consent
--                                 switches for agency sharing, public profile,
--                                 personal-site/page-builder use, badges, and
--                                 calendar read/write.
--   talent_integration_secrets  — encrypted OAuth/API secrets only. RLS denies
--                                 authenticated/anon access; service role owns
--                                 encryption/decryption through repository.ts.
--   talent_integration_items    — normalized provider items selected for a
--                                 public profile or personal site.
--
-- Manual links may be "connected" but are not verification evidence by
-- themselves. OAuth/API callbacks can mark metadata_cache.verification_status
-- and sync talent_profile_trust_badges later.

BEGIN;

-- ---------------------------------------------------------------------------
-- talent_integrations: provider account + consent switches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.talent_integrations (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id               UUID        NOT NULL
                                                REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  provider_key                    TEXT        NOT NULL,
  provider_account_id             TEXT,
  provider_account_label          TEXT,
  connection_method               TEXT        NOT NULL DEFAULT 'manual'
                                                CHECK (connection_method IN ('manual','oauth','embed','calendar_feed')),
  status                          TEXT        NOT NULL DEFAULT 'not_connected'
                                                CHECK (status IN ('not_connected','pending','connected','needs_reauth','error','disabled')),
  scopes                          TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  consent_version                 TEXT        NOT NULL DEFAULT 'talent-connections-v1',
  public_badge_enabled            BOOLEAN     NOT NULL DEFAULT false,
  agency_visible                  BOOLEAN     NOT NULL DEFAULT true,
  public_profile_enabled          BOOLEAN     NOT NULL DEFAULT false,
  personal_site_enabled           BOOLEAN     NOT NULL DEFAULT false,
  auto_refresh_enabled            BOOLEAN     NOT NULL DEFAULT false,
  calendar_availability_enabled   BOOLEAN     NOT NULL DEFAULT false,
  calendar_write_enabled          BOOLEAN     NOT NULL DEFAULT false,
  settings_json                   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  metadata_cache                  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at                    TIMESTAMPTZ,
  last_verified_at                TIMESTAMPTZ,
  last_error                      TEXT,
  created_by_user_id              UUID,
  updated_by_user_id              UUID,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (talent_profile_id, provider_key)
);

COMMENT ON TABLE public.talent_integrations IS
  'Talent-owned external account connections and per-use consent switches. Secrets are stored encrypted in talent_integration_secrets; public profile/page-builder selections are explicit opt-ins.';

CREATE INDEX IF NOT EXISTS idx_talent_integrations_talent_status
  ON public.talent_integrations (talent_profile_id, status);

CREATE INDEX IF NOT EXISTS idx_talent_integrations_provider
  ON public.talent_integrations (provider_key, status);

CREATE INDEX IF NOT EXISTS idx_talent_integrations_agency_visible
  ON public.talent_integrations (talent_profile_id, agency_visible)
  WHERE agency_visible = true;

ALTER TABLE public.talent_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_integrations_own_all ON public.talent_integrations;
CREATE POLICY talent_integrations_own_all ON public.talent_integrations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_integrations.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_integrations.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS talent_integrations_staff_select ON public.talent_integrations;
CREATE POLICY talent_integrations_staff_select ON public.talent_integrations
  FOR SELECT
  USING (
    agency_visible = true
    AND EXISTS (
      SELECT 1 FROM public.agency_talent_roster atr
       WHERE atr.talent_profile_id = talent_integrations.talent_profile_id
         AND atr.status = 'active'
         AND public.is_staff_of_tenant(atr.tenant_id)
    )
  );

DROP POLICY IF EXISTS talent_integrations_platform_admin_all ON public.talent_integrations;
CREATE POLICY talent_integrations_platform_admin_all ON public.talent_integrations
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.talent_integrations_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_integrations_touch_updated_at ON public.talent_integrations;
CREATE TRIGGER trg_talent_integrations_touch_updated_at
  BEFORE UPDATE ON public.talent_integrations
  FOR EACH ROW EXECUTE FUNCTION public.talent_integrations_touch_updated_at();

-- ---------------------------------------------------------------------------
-- talent_integration_secrets: encrypted secrets only
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.talent_integration_secrets (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID        NOT NULL
                                  REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  provider_key      TEXT        NOT NULL,
  secret_field      TEXT        NOT NULL,
  ciphertext        TEXT        NOT NULL,
  last4             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (talent_profile_id, provider_key, secret_field)
);

COMMENT ON TABLE public.talent_integration_secrets IS
  'Encrypted per-talent integration secrets (OAuth/API tokens). RLS denies authenticated/anon access; only service-role server code reads/writes ciphertext.';

ALTER TABLE public.talent_integration_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_integration_secrets_deny_authenticated ON public.talent_integration_secrets;
CREATE POLICY talent_integration_secrets_deny_authenticated ON public.talent_integration_secrets
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.talent_integration_secrets_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_integration_secrets_touch_updated_at ON public.talent_integration_secrets;
CREATE TRIGGER trg_talent_integration_secrets_touch_updated_at
  BEFORE UPDATE ON public.talent_integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.talent_integration_secrets_touch_updated_at();

-- ---------------------------------------------------------------------------
-- talent_integration_items: provider items selected for display
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.talent_integration_items (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_integration_id    UUID        NOT NULL
                                       REFERENCES public.talent_integrations(id) ON DELETE CASCADE,
  talent_profile_id        UUID        NOT NULL
                                       REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  provider_key             TEXT        NOT NULL,
  external_item_id         TEXT        NOT NULL,
  item_kind                TEXT        NOT NULL
                                       CHECK (item_kind IN ('profile','post','video','track','playlist','album','calendar','media','other')),
  title                    TEXT,
  url                      TEXT,
  thumbnail_url            TEXT,
  embed_url                TEXT,
  captured_at              TIMESTAMPTZ,
  item_metadata            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  public_profile_enabled   BOOLEAN     NOT NULL DEFAULT false,
  personal_site_enabled    BOOLEAN     NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (talent_integration_id, external_item_id)
);

COMMENT ON TABLE public.talent_integration_items IS
  'External provider items imported or selected by talent for profile/page-builder display. Every public surface switch is explicit and independent.';

CREATE INDEX IF NOT EXISTS idx_talent_integration_items_talent
  ON public.talent_integration_items (talent_profile_id, provider_key);

CREATE INDEX IF NOT EXISTS idx_talent_integration_items_public_profile
  ON public.talent_integration_items (talent_profile_id)
  WHERE public_profile_enabled = true;

CREATE INDEX IF NOT EXISTS idx_talent_integration_items_personal_site
  ON public.talent_integration_items (talent_profile_id)
  WHERE personal_site_enabled = true;

ALTER TABLE public.talent_integration_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_integration_items_own_all ON public.talent_integration_items;
CREATE POLICY talent_integration_items_own_all ON public.talent_integration_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_integration_items.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_integration_items.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS talent_integration_items_staff_select ON public.talent_integration_items;
CREATE POLICY talent_integration_items_staff_select ON public.talent_integration_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.talent_integrations ti
        JOIN public.agency_talent_roster atr
          ON atr.talent_profile_id = ti.talent_profile_id
       WHERE ti.id = talent_integration_items.talent_integration_id
         AND ti.agency_visible = true
         AND atr.status = 'active'
         AND public.is_staff_of_tenant(atr.tenant_id)
    )
  );

DROP POLICY IF EXISTS talent_integration_items_platform_admin_all ON public.talent_integration_items;
CREATE POLICY talent_integration_items_platform_admin_all ON public.talent_integration_items
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.talent_integration_items_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_integration_items_touch_updated_at ON public.talent_integration_items;
CREATE TRIGGER trg_talent_integration_items_touch_updated_at
  BEFORE UPDATE ON public.talent_integration_items
  FOR EACH ROW EXECUTE FUNCTION public.talent_integration_items_touch_updated_at();

COMMIT;
