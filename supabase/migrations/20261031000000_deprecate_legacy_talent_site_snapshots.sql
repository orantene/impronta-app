-- Deprecate (do NOT drop) the legacy talent_sites PROFILE-snapshot columns.
--
-- CONTEXT (Talent Max Site repoint, #493): `talent_sites.draft_snapshot` and
-- `published_snapshot` (jsonb) used to render the slot-based Max PROFILE at
-- `/t/<code>`. That render path is GONE — `/t/<code>` now always renders the
-- discovery profile, and the multi-page Max website renders from `talent_pages`
-- + the shell columns (`talent_sites.shell_tree` / `shell_published`). The
-- snapshot columns are NO LONGER read by any public render. They are still
-- WRITTEN by the legacy slot editor (`server/actions.ts` + the
-- `TalentSiteDashboard*` UI) pending that editor's removal.
--
-- SAFE + REVERSIBLE: this migration only attaches deprecation COMMENTs. It does
-- NOT drop columns, indexes, RLS, or the public RPC, and it does not touch any
-- row data. Rolling this back is a no-op (re-running COMMENT ON is idempotent).
--
-- Before any FUTURE `drop column` on these:
--   1. retire the legacy slot editor (the only remaining writer), and
--   2. run `web/scripts/migrate-legacy-talent-snapshots.ts` to migrate any
--      talent-authored snapshot content into the talent_pages Max-site model.
-- The raw snapshot jsonb stays in these columns as the lossless backup until
-- then.

comment on column public.talent_sites.draft_snapshot is
  'DEPRECATED (repoint #493): legacy slot-based PROFILE snapshot. No longer rendered as the public profile (/t/<code> renders the discovery profile; the Max site renders from talent_pages + shell_tree). Still written by the legacy slot editor. Kept, NOT dropped — see scripts/migrate-legacy-talent-snapshots.ts before removing.';

comment on column public.talent_sites.published_snapshot is
  'DEPRECATED (repoint #493): legacy slot-based PUBLISHED profile snapshot. No longer rendered as the public profile. Still written by the legacy slot editor and used by the sitemap as a has-published-site proxy. Kept, NOT dropped — see scripts/migrate-legacy-talent-snapshots.ts before removing.';
