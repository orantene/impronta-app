-- 20261231417900_changelog_entries.sql
--
-- HELD FILE (supabase/migrations/_pending_pm/). NOT applied by the author.
-- For the Production Migration Manager (TUL-1390, release notes program WIKI-34).
-- Renumber above the newest applied version if needed before applying.
--
-- WHAT (additive only, nothing existing changes)
--  1. public.changelog_entries: the published copy of Notion "Releases" entries.
--     Written ONLY by the service role (cron /api/cron/changelog-sync). Every row
--     is public by construction: the sync copies only Status = Published or
--     Paused entries and deletes rows whose Notion entry left those statuses.
--     anon + authenticated may SELECT; nobody but the service role writes.
--  2. storage bucket "changelog" (public read): cover and body images copied
--     out of Notion, because Notion file URLs expire after about an hour.
--
-- Readers (later tickets): tulala.digital/changelog, the dashboard What's new
-- card, AI support grounding. No reader exists yet, so applying early is safe.
--
-- VERIFY after apply:
--   select relrowsecurity from pg_class where oid = 'public.changelog_entries'::regclass;  -- t
--   select has_table_privilege('anon', 'public.changelog_entries', 'INSERT');              -- f
--   select id, public from storage.buckets where id = 'changelog';                           -- changelog, t

BEGIN;

CREATE TABLE IF NOT EXISTS public.changelog_entries (
  notion_page_id        text PRIMARY KEY,
  status                text NOT NULL CHECK (status IN ('published', 'paused')),
  kind                  text NOT NULL DEFAULT 'Weekly changelog',
  release_id            text,
  release_date          date,
  tier                  smallint CHECK (tier BETWEEN 0 AND 3),
  badge                 text,
  title_en              text NOT NULL DEFAULT '',
  title_es              text NOT NULL DEFAULT '',
  summary_en            text NOT NULL DEFAULT '',
  summary_es            text NOT NULL DEFAULT '',
  body_en_html          text NOT NULL DEFAULT '',
  body_es_html          text NOT NULL DEFAULT '',
  audience              text[] NOT NULL DEFAULT '{}',
  plans                 text[] NOT NULL DEFAULT '{}',
  categories            text[] NOT NULL DEFAULT '{}',
  help_url              text,
  cover_image_url       text,
  published_at          timestamptz,
  notion_last_edited_at timestamptz,
  synced_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.changelog_entries IS
  'Published copy of Notion Releases entries (TUL-1390). Service-role writes only, via /api/cron/changelog-sync.';

CREATE INDEX IF NOT EXISTS changelog_entries_published_at_idx
  ON public.changelog_entries (published_at DESC NULLS LAST);

ALTER TABLE public.changelog_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS changelog_entries_public_read ON public.changelog_entries;
CREATE POLICY changelog_entries_public_read
  ON public.changelog_entries
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON public.changelog_entries FROM anon, authenticated;
GRANT SELECT ON public.changelog_entries TO anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'changelog',
  'changelog',
  true,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
