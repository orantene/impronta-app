-- ─────────────────────────────────────────────────────────────────────────────
-- tenant_guest_chat_settings — per-agency control over the public guest-chat
-- launcher ("Message {…}" floating chat on public pages).
--
-- Lets a tenant admin (from the workspace Settings → Guest chat drawer) turn the
-- chat on/off and choose WHERE it appears: individual talent profile pages,
-- and/or the agency directory + home pages. Optional custom greeting overrides
-- the default opener.
--
-- DEFAULTS PRESERVE CURRENT BEHAVIOR: a tenant with NO row is treated as
-- "all on" by the public reader (loadGuestChatSettings) — the launcher keeps
-- showing on talent profiles AND now also on the directory/home pages, matching
-- the product decision that it should be live everywhere by default. A tenant
-- opts OUT by saving a row with the relevant flag false.
--
-- RLS: SELECT is public (config is non-sensitive and the launcher is rendered on
-- public, unauthenticated pages — the reader must see enabled=false too, so the
-- policy is permissive read, NOT "read only when enabled"). Writes are staff-only.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_guest_chat_settings (
  tenant_id          UUID        PRIMARY KEY
                                   REFERENCES public.agencies(id) ON DELETE CASCADE,
  enabled            BOOLEAN     NOT NULL DEFAULT TRUE,
  show_on_talent     BOOLEAN     NOT NULL DEFAULT TRUE,
  show_on_directory  BOOLEAN     NOT NULL DEFAULT TRUE,
  greeting           TEXT        CHECK (greeting IS NULL OR char_length(greeting) <= 280),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID        REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.tenant_guest_chat_settings ENABLE ROW LEVEL SECURITY;

-- Public read: the launcher is server-rendered on public pages; the reader must
-- be able to see the row regardless of `enabled` so it can honor an opt-OUT.
DROP POLICY IF EXISTS guest_chat_settings_public_read ON public.tenant_guest_chat_settings;
CREATE POLICY guest_chat_settings_public_read
  ON public.tenant_guest_chat_settings
  FOR SELECT
  USING (true);

-- Staff-only writes (insert/update/delete) — scoped to the caller's tenant.
DROP POLICY IF EXISTS guest_chat_settings_staff_write ON public.tenant_guest_chat_settings;
CREATE POLICY guest_chat_settings_staff_write
  ON public.tenant_guest_chat_settings
  FOR ALL
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- touch updated_at
CREATE OR REPLACE FUNCTION public.tenant_guest_chat_settings_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_guest_chat_settings_touch ON public.tenant_guest_chat_settings;
CREATE TRIGGER trg_tenant_guest_chat_settings_touch
  BEFORE UPDATE ON public.tenant_guest_chat_settings
  FOR EACH ROW EXECUTE FUNCTION public.tenant_guest_chat_settings_touch_updated_at();

COMMIT;
