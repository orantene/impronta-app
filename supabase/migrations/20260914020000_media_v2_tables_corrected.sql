-- Corrected re-run of media_v2_foundations tables.
-- The original 20260913010000 migration referenced public.tenants + agency_staff
-- which don't exist on this schema (uses agencies + agency_memberships).
-- All statements are idempotent (IF NOT EXISTS / DO-guards).

-- ─── media_folders ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_folders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  color           text,
  is_private      boolean NOT NULL DEFAULT false,
  share_token     text UNIQUE,
  share_expires_at timestamptz,
  share_view_count int NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_folders_tenant_idx
  ON public.media_folders (tenant_id);
CREATE INDEX IF NOT EXISTS media_folders_share_token_idx
  ON public.media_folders (share_token) WHERE share_token IS NOT NULL;

-- ─── media_folder_items ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_folder_items (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.media_folders(id) ON DELETE CASCADE,
  asset_id  uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  added_at  timestamptz NOT NULL DEFAULT now(),
  added_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (folder_id, asset_id)
);

CREATE INDEX IF NOT EXISTS media_folder_items_folder_idx
  ON public.media_folder_items (folder_id);
CREATE INDEX IF NOT EXISTS media_folder_items_asset_idx
  ON public.media_folder_items (asset_id);

-- ─── media_asset_activity ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_asset_activity (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id   uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind       text NOT NULL,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_asset_activity_asset_idx
  ON public.media_asset_activity (asset_id);
CREATE INDEX IF NOT EXISTS media_asset_activity_tenant_idx
  ON public.media_asset_activity (tenant_id, created_at DESC);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_folder_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_asset_activity ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='media_folders' AND policyname='media_folders_tenant_isolation') THEN
    CREATE POLICY media_folders_tenant_isolation ON public.media_folders
      USING (tenant_id IN (
        SELECT tenant_id FROM public.agency_memberships WHERE profile_id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='media_folders' AND policyname='media_folders_public_share_read') THEN
    CREATE POLICY media_folders_public_share_read ON public.media_folders
      FOR SELECT USING (
        share_token IS NOT NULL
        AND (share_expires_at IS NULL OR share_expires_at > now())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='media_folder_items' AND policyname='media_folder_items_tenant_isolation') THEN
    CREATE POLICY media_folder_items_tenant_isolation ON public.media_folder_items
      USING (folder_id IN (
        SELECT id FROM public.media_folders WHERE tenant_id IN (
          SELECT tenant_id FROM public.agency_memberships WHERE profile_id = auth.uid()
        )
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='media_asset_activity' AND policyname='media_asset_activity_tenant_read') THEN
    CREATE POLICY media_asset_activity_tenant_read ON public.media_asset_activity
      FOR SELECT USING (
        tenant_id IN (
          SELECT tenant_id FROM public.agency_memberships WHERE profile_id = auth.uid()
        )
      );
  END IF;
END $$;
