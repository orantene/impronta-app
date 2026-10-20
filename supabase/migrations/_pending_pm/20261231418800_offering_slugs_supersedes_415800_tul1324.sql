-- TUL-1324 (b): service content fields with PER-LOCALE slugs in an offering_slugs table.
--
-- SUPERSEDES 20261231415800_service_content_fields.sql. Apply THIS file and not 415800:
-- 415800 has one `slug` column plus `slug_history`, which cannot hold per-locale slugs.
-- 415800 is deliberately left in place for the PM to remove before any apply.
-- Nothing writes the old columns yet and the reader probes for missing columns, so the
-- amendment is safe. Everything else 415800 adds (summary, SEO, OG image, presentation,
-- page_id, service_type, tags) is kept identically below, so applying this file alone
-- gives the same content columns minus `slug` / `slug_history`.
--
-- HELD in _pending_pm. Additive and idempotent only: IF NOT EXISTS everywhere, NO backfill,
-- NO UPDATE of existing rows.
--
-- offering_slugs (decision: Option A, approved 2026-10-19)
--   owner_scope  't:<talent_profile_id>' or 'w:<tenant_id>'  (who the slug is unique within)
--   locale       the language of this slug
--   slug         lower-case letters, numbers, dashes
--   is_current   the slug the page uses now; false rows are history and 301 to the current one
--   UNIQUE (owner_scope, locale, slug)           current slugs and history in ONE index
--   UNIQUE (offering_id, locale) WHERE is_current  one current slug per language
-- Reusing an old slug for another service MOVES the row (the writer deletes/updates it first),
-- the current slug always wins.
-- Same posture as 415800: RLS on, NO policies, anon/authenticated revoked. Reads and writes
-- are service role only.
--
-- talent_sites.catalog_path_word: the owner's word in the address (closed list, null = services).
-- The workspace's word lives in agencies.settings (jsonb) and needs no DDL.
--
-- Rollback (only if nothing has written these yet):
--   DROP TABLE IF EXISTS public.offering_slugs;
--   ALTER TABLE public.talent_sites DROP COLUMN IF EXISTS catalog_path_word;
--   DROP INDEX IF EXISTS public.idx_talent_offerings_og_media;
--   ALTER TABLE public.talent_offerings
--     DROP COLUMN IF EXISTS summary, DROP COLUMN IF EXISTS seo_title,
--     DROP COLUMN IF EXISTS seo_description, DROP COLUMN IF EXISTS og_media_id,
--     DROP COLUMN IF EXISTS presentation, DROP COLUMN IF EXISTS page_id,
--     DROP COLUMN IF EXISTS service_type, DROP COLUMN IF EXISTS tags;

BEGIN;

ALTER TABLE public.talent_offerings
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
      AND conname = 'talent_offerings_content_lengths_check'
  ) THEN
    ALTER TABLE public.talent_offerings
      ADD CONSTRAINT talent_offerings_content_lengths_check
      CHECK (
        (summary IS NULL OR length(summary) <= 600)
        AND (seo_title IS NULL OR length(seo_title) <= 140)
        AND (seo_description IS NULL OR length(seo_description) <= 320)
        AND (service_type IS NULL OR length(service_type) <= 64)
        AND cardinality(tags) <= 30
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_talent_offerings_og_media
  ON public.talent_offerings (og_media_id)
  WHERE og_media_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.offering_slugs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.talent_offerings(id) ON DELETE CASCADE,
  owner_scope text NOT NULL,
  locale      text NOT NULL,
  slug        text NOT NULL,
  is_current  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offering_slugs_owner_scope_check
    CHECK (owner_scope ~ '^(t|w):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  CONSTRAINT offering_slugs_locale_check
    CHECK (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  CONSTRAINT offering_slugs_slug_shape_check
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 96)
);

CREATE UNIQUE INDEX IF NOT EXISTS offering_slugs_scope_locale_slug_uniq
  ON public.offering_slugs (owner_scope, locale, slug);

CREATE UNIQUE INDEX IF NOT EXISTS offering_slugs_one_current_per_locale_uniq
  ON public.offering_slugs (offering_id, locale)
  WHERE is_current;

CREATE INDEX IF NOT EXISTS idx_offering_slugs_offering
  ON public.offering_slugs (offering_id);

ALTER TABLE public.offering_slugs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offering_slugs FROM anon, authenticated;

ALTER TABLE public.talent_sites
  ADD COLUMN IF NOT EXISTS catalog_path_word text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.talent_sites'::regclass
      AND conname = 'talent_sites_catalog_path_word_check'
  ) THEN
    ALTER TABLE public.talent_sites
      ADD CONSTRAINT talent_sites_catalog_path_word_check
      CHECK (catalog_path_word IS NULL
             OR catalog_path_word IN ('services', 'tours', 'menu', 'classes', 'spaces'));
  END IF;
END $$;

COMMENT ON TABLE public.offering_slugs IS
  'TUL-1324: per-locale service page slugs. is_current = the page address; false rows are history and 301 to the current one. Service role only.';
COMMENT ON COLUMN public.talent_sites.catalog_path_word IS
  'TUL-1324: the word in service page addresses (closed list). Null = services.';
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
