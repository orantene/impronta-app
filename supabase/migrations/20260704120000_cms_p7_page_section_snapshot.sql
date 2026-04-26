-- Phase 7 — section-composed non-homepage pages.
--
-- Today, only the homepage row carries a `published_homepage_snapshot`
-- JSONB column that the storefront renders as section composition.
-- This migration adds a parallel `published_page_snapshot` column to
-- ALL cms_pages rows so any page (not just the homepage) can be
-- section-composed.
--
-- The two columns coexist:
--   - `published_homepage_snapshot` stays the source of truth for the
--     homepage row (no breaking change for existing readers).
--   - `published_page_snapshot` is consulted for non-homepage pages by
--     the new `loadPublicPage` reader. Snapshot SHAPE is identical to
--     the homepage one (HomepageSnapshot type) — the page just isn't
--     the home.
--
-- Header/footer globals deliberately NOT added in this migration —
-- those need a separate site_shell concept that's out of scope for
-- this iteration.

alter table public.cms_pages
  add column if not exists published_page_snapshot jsonb null;

comment on column public.cms_pages.published_page_snapshot is
  'Phase 7 — frozen section composition for any non-homepage page. Same shape as published_homepage_snapshot. Populated at publish time; consulted by /p/<slug> public reader.';
