-- 20261231417000_folio_draft_releases_archive_tul1180.sql
--
-- HELD FILE (supabase/migrations/_pending_pm/). NOT applied by the author.
-- PROPOSAL for the Production Migration Manager (TUL-1180). No deletes.
--
-- ─── WHY ─────────────────────────────────────────────────────────────────────
-- Production has Folio releases v17..v22 still in status 'draft' although all
-- 9 Folio sites are on v23. Draft rows that can never ship clutter the release
-- manager (`release-manager.server.ts` lists every non-archived release) and
-- the stale-draft checks (`theme-template/stale-drafts.server.ts`).
-- 'archived' is the app's own end state for a release: the manager hides it and
-- refuses actions on it (release-manager.server.ts:372). Nothing is deleted;
-- talent_site_theme_updates rows (FK, ON DELETE CASCADE) are untouched.
-- Staging fxlank has 0 Folio release rows (checked 2026-10-19), so this is a
-- production-only change.
--
-- ─── DRY RUN (read-only) ─────────────────────────────────────────────────────
--   select r.to_version, r.status, r.channel, r.created_at::date,
--          (select count(*) from public.talent_site_theme_updates u
--            where u.release_id = r.id)                                   as updates,
--          (select count(*) from public.talent_site_theme_updates u
--            where u.release_id = r.id and u.state in ('available','previewed')) as open_updates
--     from public.talent_theme_releases r
--    where r.design_slug = 'folio'
--    order by r.to_version;
--   select count(*) as folio_sites_not_on_v23 from public.talent_sites s
--    where s.theme_design_slug = 'folio' and coalesce(s.theme_design_version, 0) < 23;
-- Apply ONLY if: v17..v22 are exactly 6 rows in status 'draft', none has an
-- open update, and no Folio site is below v23. Post the counts on TUL-1180.
--
-- ─── ROLLBACK (puts the same rows back to draft) ─────────────────────────────
--   update public.talent_theme_releases
--      set status = 'draft',
--          notes = notes - 'archived_by' - 'archived_reason' - 'archived_at',
--          updated_at = now()
--    where design_slug = 'folio' and to_version between 17 and 22
--      and status = 'archived' and notes->>'archived_by' = 'TUL-1180';

do $$
declare
  n_open bigint;
  n_changed bigint;
begin
  select count(*) into n_open
    from public.talent_site_theme_updates u
    join public.talent_theme_releases r on r.id = u.release_id
   where r.design_slug = 'folio' and r.to_version between 17 and 22 and r.status = 'draft'
     and u.state in ('available', 'previewed');
  if n_open > 0 then
    raise exception 'TUL-1180: % open update rows still point at Folio v17-v22 drafts; not archiving', n_open;
  end if;

  update public.talent_theme_releases
     set status = 'archived',
         notes = notes || jsonb_build_object(
           'archived_by', 'TUL-1180',
           'archived_reason', 'superseded: every Folio site is on v23',
           'archived_at', now()),
         updated_at = now()
   where design_slug = 'folio'
     and to_version between 17 and 22
     and status = 'draft';
  get diagnostics n_changed = row_count;

  raise notice 'TUL-1180: % Folio draft releases archived (expect 6)', n_changed;
  if n_changed > 6 then
    raise exception 'TUL-1180: % rows matched, more than the 6 expected; rolling back', n_changed;
  end if;
end $$;
