-- The original `20260913010000_media_v2_foundations.sql` failed mid-run on
-- this DB (it referenced `public.tenants` which doesn't exist here). The
-- corrected re-run `20260914020000_media_v2_tables_corrected.sql` only
-- restored the tables — the column-adds on `media_assets` were silently
-- skipped. This re-runs just those column-adds, idempotently.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'tags'
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS media_assets_tags_gin ON public.media_assets USING gin (tags);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'original_filename'
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN original_filename text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'mime_type'
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN mime_type text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'file_size_bytes'
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN file_size_bytes bigint;
    -- Backfill: existing rows have `file_size` (legacy column from init.sql).
    -- Copy it forward so analytics doesn't show "—" for the entire historical archive.
    UPDATE public.media_assets SET file_size_bytes = file_size WHERE file_size IS NOT NULL;
  END IF;
END $$;
