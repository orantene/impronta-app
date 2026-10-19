-- TUL-1272 #1 (Batch 3 C1): service content fields on public.talent_offerings.
--
-- HELD: lives in _pending_pm until the PM applies it. The code that reads these
-- columns works with or without them (web/src/lib/talent-site/service-content-*.ts),
-- so applying this migration changes nothing visible until a row sets a value.
--
-- Additive and idempotent only:
--   * every column is nullable or has a constant default (no table rewrite, PG 11+);
--   * NO backfill, NO UPDATE, NO RLS or grant change (public reads stay service-role);
--   * checks are added only when missing, so a second run is a no-op.
--
-- Slug scope follows offering ownership (20261226000003_offering_owner_kind.sql):
--   owner_kind = 'talent'    -> unique per talent_profile_id (the talent site loads the
--                               talent's catalog across tenants, so a tenant-scoped
--                               index would allow two rows with one URL on one site);
--   owner_kind = 'workspace' -> unique per tenant_id (talent_profile_id is null there).
-- Old slugs live in slug_history; the resolver answers a history hit with a 301 to the
-- current slug. A current slug always wins over another row's history entry.
--
-- og_media_id references media_assets (the table talent_offering_media already uses);
-- page_id has no FK on purpose: it can point at talent_pages, workspace_pages or
-- cms_pages depending on the owner, and the presentation resolver (C2) validates it.
--
-- Rollback (only if no row has written these yet):
--   DROP INDEX IF EXISTS public.talent_offerings_talent_slug_uniq;
--   DROP INDEX IF EXISTS public.talent_offerings_workspace_slug_uniq;
--   DROP INDEX IF EXISTS public.idx_talent_offerings_og_media;
--   ALTER TABLE public.talent_offerings
--     DROP COLUMN IF EXISTS slug, DROP COLUMN IF EXISTS slug_history,
--     DROP COLUMN IF EXISTS summary, DROP COLUMN IF EXISTS seo_title,
--     DROP COLUMN IF EXISTS seo_description, DROP COLUMN IF EXISTS og_media_id,
--     DROP COLUMN IF EXISTS presentation, DROP COLUMN IF EXISTS page_id,
--     DROP COLUMN IF EXISTS service_type, DROP COLUMN IF EXISTS tags;

BEGIN;

ALTER TABLE public.talent_offerings
  ADD COLUMN IF NOT EXISTS slug            text,
  ADD COLUMN IF NOT EXISTS slug_history    text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS summary         text,
  ADD COLUMN IF NOT EXISTS seo_title       text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS og_media_id     uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS presentation    text,
  ADD COLUMN IF NOT EXISTS page_id         uuid,
  ADD COLUMN IF NOT EXISTS service_type    text,
  ADD COLUMN IF NOT EXISTS tags            text[] NOT NULL DEFAULT '{}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.talent_offerings'::regclass
      AND conname = 'talent_offerings_presentation_check'
  ) THEN
    ALTER TABLE public.talent_offerings
      ADD CONSTRAINT talent_offerings_presentation_check
      CHECK (presentation IS NULL
             OR presentation IN ('own_page', 'quick_view', 'expand', 'book_direct'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.talent_offerings'::regclass
      AND conname = 'talent_offerings_slug_shape_check'
  ) THEN
    ALTER TABLE public.talent_offerings
      ADD CONSTRAINT talent_offerings_slug_shape_check
      CHECK (slug IS NULL
             OR (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 96));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.talent_offerings'::regclass
      AND conname = 'talent_offerings_content_lengths_check'
  ) THEN
    ALTER TABLE public.talent_offerings
      ADD CONSTRAINT talent_offerings_content_lengths_check
      CHECK (
        (summary IS NULL OR length(summary) <= 600)
        AND (seo_title IS NULL OR length(seo_title) <= 140)
        AND (seo_description IS NULL OR length(seo_description) <= 320)
        AND (service_type IS NULL OR length(service_type) <= 64)
        AND cardinality(slug_history) <= 50
        AND cardinality(tags) <= 30
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS talent_offerings_talent_slug_uniq
  ON public.talent_offerings (talent_profile_id, slug)
  WHERE owner_kind = 'talent' AND slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS talent_offerings_workspace_slug_uniq
  ON public.talent_offerings (tenant_id, slug)
  WHERE owner_kind = 'workspace' AND slug IS NOT NULL;

-- FK delete path: deleting a media asset looks up offerings that use it as OG image.
CREATE INDEX IF NOT EXISTS idx_talent_offerings_og_media
  ON public.talent_offerings (og_media_id)
  WHERE og_media_id IS NOT NULL;

COMMENT ON COLUMN public.talent_offerings.slug IS
  'TUL-1272 C1: custom URL slug. Null = derived servicio-<title>-<id8> slug. Unique per owner scope.';
COMMENT ON COLUMN public.talent_offerings.slug_history IS
  'TUL-1272 C1: previous slugs; a request for one answers 301 to the current slug.';
COMMENT ON COLUMN public.talent_offerings.summary IS
  'TUL-1272 C1: short card/list summary. Null = derived from description in code.';
COMMENT ON COLUMN public.talent_offerings.seo_title IS
  'TUL-1272 C1: <title> override. Null = "<service> | <talent>" in code.';
COMMENT ON COLUMN public.talent_offerings.seo_description IS
  'TUL-1272 C1: meta description override. Null = derived in code (max 160).';
COMMENT ON COLUMN public.talent_offerings.og_media_id IS
  'TUL-1272 C1: share image (media_assets). Null = first service photo.';
COMMENT ON COLUMN public.talent_offerings.presentation IS
  'TUL-1272 C1: own_page | quick_view | expand | book_direct. Null = presentation resolver decides (C2).';
COMMENT ON COLUMN public.talent_offerings.page_id IS
  'TUL-1272 C1: optional custom CMS page for this service (talent_pages / workspace_pages / cms_pages by owner). No FK.';
COMMENT ON COLUMN public.talent_offerings.service_type IS
  'TUL-1272 C1: free-form service type key (schema.org serviceType). Null = none.';
COMMENT ON COLUMN public.talent_offerings.tags IS
  'TUL-1272 C1: lower-case tags for search and grouping.';

COMMIT;
