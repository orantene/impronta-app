# Page Builder + Package Audit - 2026-05-06

## Scope

Audited the local page-builder path for the Free workspace `freeflow-760905`, with package-level behavior in mind:

- Free storefront URL: `/freeflow-760905`
- Builder surface: logged-in edit chrome on the storefront
- Publish target: `cms_pages.published_homepage_snapshot`
- Free starter promise: one landing page, one template, up to five real roster profiles

## Verified Working

- Free path-based storefronts resolve and render locally.
- The edit chrome can open on the Free storefront homepage.
- The Free starter can create a one-page composition with hero, services, featured talent, and CTA.
- Publish from edit chrome writes the homepage snapshot and updates the public page.
- Public SSR for `/freeflow-760905` now returns the one-page Free template with five real profile cards.
- Free package cap is represented in public roster display through `talent_seat_limit = 5`.

## Fixes Landed In This Pass

- Fixed edit-mode page-slug resolution for path-based Free URLs. The builder now treats `/freeflow-760905` as the homepage instead of looking for a CMS page slug named `freeflow-760905`.
- Added a focused regression test for path-based homepage and nested page slug resolution.
- Linked five existing approved public profiles to the Free test workspace as visible roster data for QA.
- Hardened `featured_talent` auto modes with a direct tenant-roster fallback when the cached directory first page is stale-empty.

## Errors And Gaps Found

- Free starter state sync: after applying a starter, Navigator can temporarily show stale section counts until reload.
- Empty roster edge: the builder template can promise "5 live profiles" while the tenant has no visible roster rows. The app should either seed/import starter profiles during onboarding or show a stronger admin task state.
- Package gates are scattered. Free page count, starter access, workspace templates, domains, and roster caps are implemented in different places instead of one package-capability matrix.
- Live-page sync is snapshot-based only. Pages without `published_homepage_snapshot` or `published_page_snapshot` can still fall back to legacy rendering, so "all live pages are builder-owned" is not fully true yet.
- Builder drawers can stack at once. Publish, settings, revisions, and add-section drawers can coexist, which makes QA and operator focus messy.
- Publish drawer wording says "sections live" before publish; it should probably say "sections ready" or "sections in this publish" until success.
- Current builder is section-level, not a 2027 Wix/Shogun builder. It lacks a nested component tree, true drag/drop inside sections, resize handles, per-component spacing controls, responsive overrides per node, and a template/block marketplace model.

## Recommended Next Execution Chunk

1. Convert package rules into one canonical capability module for Free, Studio, Agency, and Network.
2. Backfill/migrate all tenant pages so public pages are builder snapshot-owned by default.
3. Fix starter apply refresh so Navigator and canvas update together without reload.
4. Add onboarding/import flow for Free workspaces to create or attach up to five visible profiles before the one-page template is published.
5. Make builder drawers mutually exclusive and clean up publish drawer copy.
6. Begin Builder 2.0 foundation: nested section schema, component registry, drag/drop ordering inside sections, and responsive style tokens per component.

## Phase 3 Status (Builder Ownership + Snapshot Consistency)

This phase now has explicit route ownership classification in edit-chrome path
resolution:

- `builder_page` — homepage and CMS pages.
- `site_shell` — reserved shell slug (`__site_shell__`).
- `directory` — directory renderer surface.
- `profile` — `/t/*` profile renderer surface.
- `platform_route` — auth/admin/api/static/system paths.

Current mount behavior:

- Edit chrome mounts only for `builder_page`.
- Edit chrome does not mount on directory/profile/platform routes.
- `site_shell` is explicitly classified but not mounted from public URL paths
  in this phase.

Current public render truth:

- Homepage and CMS pages prefer published snapshots.
- Legacy fallback remains for published pages missing snapshot payloads.
- Fallback is intentional transitional behavior and is documented in
  `homepage-reads.ts`, `page-reads.ts`, and `shell-reads.ts`.

## Snapshot Backfill Outline (Phase 3.4 follow-through)

Goal: reduce snapshot-null fallbacks so builder ownership is concrete.

1. Inventory rows with missing snapshots:
   - homepage rows where `status='published'` and
     `published_homepage_snapshot IS NULL`
   - standard/shell rows where `status='published'` and
     `published_page_snapshot IS NULL`
2. For each row, rehydrate composition from current published page-section
   links and section published props.
3. Bake that payload into the matching snapshot column and set
   `published_at`/`version` with the existing CAS discipline.
4. Emit audit events per row (`publish_snapshot_backfill` event name family).
5. After tenant inventory reaches zero snapshot-null rows, remove legacy
   public fallback branches.

### Implemented tooling

Script:

- `web/scripts/backfill-page-snapshots.mjs`

Behavior:

- Tenant-scoped.
- Dry-run by default.
- `--apply` performs writes.
- Backfills all published rows missing snapshots:
  - homepage (`published_homepage_snapshot`)
  - standard pages (`published_page_snapshot`)
  - site shell (`published_page_snapshot`)
- Prefers live composition rows; falls back to draft rows when live is empty.
- Syncs live page-section pointers to the same composition used for snapshot.
- Writes a `platform_audit_log` row per applied page with
  `action=agency.site_admin.snapshot_backfill.<kind>`.

Usage:

```bash
npm --prefix web run backfill:page-snapshots -- --tenant <tenant-uuid>
npm --prefix web run backfill:page-snapshots -- --tenant <tenant-uuid> --locale en --apply
```
