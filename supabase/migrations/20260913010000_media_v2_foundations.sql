-- Phase 3 — Media manager v2 foundations
--
-- 1. media_folders — virtual cross-talent collections (Editorial campaign, Vogue pitch, etc.)
-- 2. media_folder_items — junction table (many-to-many assets ↔ folders)
-- 3. tags text[] on media_assets — workspace-managed labels
-- 4. file metadata on media_assets (original_filename, mime_type, file_size_bytes, width, height already exist? guard with IF NOT EXISTS)
-- 5. media_asset_activity — immutable audit trail per asset
-- 6. Indexes and RLS policies

-- ─── 1. media_folders ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_folders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  color           text,                         -- hex color for UI (e.g. "#6B7280")
  is_private      boolean NOT NULL DEFAULT false, -- admin-only vs visible to talent
  share_token     text UNIQUE,                  -- null = not shared; set = shareable
  share_expires_at timestamptz,                 -- null = no expiry
  share_view_count int NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_folders_tenant_idx ON public.media_folders (tenant_id);
CREATE INDEX IF NOT EXISTS media_folders_share_token_idx ON public.media_folders (share_token) WHERE share_token IS NOT NULL;

-- ─── 2. media_folder_items ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_folder_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id     uuid NOT NULL REFERENCES public.media_folders(id) ON DELETE CASCADE,
  asset_id      uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  added_at      timestamptz NOT NULL DEFAULT now(),
  added_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (folder_id, asset_id)
);

CREATE INDEX IF NOT EXISTS media_folder_items_folder_idx ON public.media_folder_items (folder_id);
CREATE INDEX IF NOT EXISTS media_folder_items_asset_idx  ON public.media_folder_items (asset_id);

-- ─── 3. tags on media_assets ──────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'tags'
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- GIN index makes @> / && operators fast for tag filtering
CREATE INDEX IF NOT EXISTS media_assets_tags_gin ON public.media_assets USING gin (tags);

-- ─── 4. File metadata columns ─────────────────────────────────────────────────
-- original_filename — preserves the user's file name
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'original_filename'
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN original_filename text;
  END IF;
END $$;

-- mime_type — e.g. image/jpeg, video/mp4
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'mime_type'
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN mime_type text;
  END IF;
END $$;

-- file_size_bytes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'file_size_bytes'
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN file_size_bytes bigint;
  END IF;
END $$;

-- width / height (may already exist — guard)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'width'
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN width int;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'height'
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN height int;
  END IF;
END $$;

-- ─── 5. media_asset_activity ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_asset_activity (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id   uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind       text NOT NULL,  -- 'uploaded' | 'approved' | 'rejected' | 'reassigned' | 'watermarked' | 'tagged' | 'deleted' | 'restored' | 'moved_to_folder'
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_asset_activity_asset_idx  ON public.media_asset_activity (asset_id);
CREATE INDEX IF NOT EXISTS media_asset_activity_tenant_idx ON public.media_asset_activity (tenant_id, created_at DESC);

-- ─── 6. RLS policies ──────────────────────────────────────────────────────────
-- media_folders: staff of the tenant can CRUD; anonymous can read shared folders (via share_token).
ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_folder_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_asset_activity ENABLE ROW LEVEL SECURITY;

-- Tenant isolation for folders (service-role bypasses RLS for server actions)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='media_folders' AND policyname='media_folders_tenant_isolation') THEN
    CREATE POLICY media_folders_tenant_isolation ON public.media_folders
      USING (tenant_id IN (
        SELECT tenant_id FROM public.agency_staff WHERE user_id = auth.uid()
      ));
  END IF;
END $$;

-- Public read of shared folders (anon can read if share_token is not null and not expired)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='media_folders' AND policyname='media_folders_public_share_read') THEN
    CREATE POLICY media_folders_public_share_read ON public.media_folders
      FOR SELECT USING (
        share_token IS NOT NULL
        AND (share_expires_at IS NULL OR share_expires_at > now())
      );
  END IF;
END $$;

-- Folder items: same tenant scope
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='media_folder_items' AND policyname='media_folder_items_tenant_isolation') THEN
    CREATE POLICY media_folder_items_tenant_isolation ON public.media_folder_items
      USING (folder_id IN (
        SELECT id FROM public.media_folders WHERE tenant_id IN (
          SELECT tenant_id FROM public.agency_staff WHERE user_id = auth.uid()
        )
      ));
  END IF;
END $$;

-- Activity: tenant staff can read
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='media_asset_activity' AND policyname='media_asset_activity_tenant_read') THEN
    CREATE POLICY media_asset_activity_tenant_read ON public.media_asset_activity
      FOR SELECT USING (
        tenant_id IN (
          SELECT tenant_id FROM public.agency_staff WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
