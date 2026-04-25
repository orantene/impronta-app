# Phase 4 QA — Revisions drawer + Restore

Code-level verification passed (2026-04-25).

## Build

- **Source commits:** `aee8504` (RevisionsDrawer + load/restore actions + EditContext + EditShell + TopBar wiring) → `ad94b8b` (tracker bump to Phase 4 acceptance gate)
- **Preview build:** `dpl_6oLqEHeFVFbqxQiHrmY5iVxcUd3V` — `tulala-18fyhu6bm-oran-tenes-projects.vercel.app` (commit `ad94b8b`, includes `aee8504`) — state `READY`.
- **Production promote:** `tulala-18fyhu6bm-oran-tenes-projects.vercel.app` promoted via `vercel promote --yes`. Live on `tulala.digital`, `app.tulala.digital`, `impronta.tulala.digital`.
- **TypeScript:** `cd web && rm -rf .next/dev/types && npx tsc --noEmit` exits clean (zero errors).

## Acceptance criteria

| Item | Status | Evidence |
|---|---|---|
| TS errors fixed | ✅ | `tsc --noEmit` clean after wiping `.next/dev/types` |
| Vercel build green on `phase-1` | ✅ | `dpl_6oLqEHeFVFbqxQiHrmY5iVxcUd3V` `state=READY` |
| Schema reuse — no migration | ✅ | Existing `cms_page_revisions` table already carries `id, page_id, kind ('draft' \| 'published' \| 'rollback'), version, template_schema_version, snapshot jsonb, created_by, created_at`. Confirmed: `web/src/lib/site-admin/server/pages.ts:92-102` (PageRevisionRow type) + `web/src/lib/site-admin/server/homepage.ts:220-250` (insertHomepageRevision writes from saveDraft + publish + rollback paths). |
| Read action exists | ✅ | `loadHomepageRevisionsAction(locale)` in `web/src/lib/site-admin/edit-mode/revisions-actions.ts` — staff-gated, tenant-scoped, calls `loadHomepageRevisionsForStaff` (cap 50, newest-first), bulk-joins `display_name` from `profiles` for non-null `created_by` ids in a single round-trip, surfaces `kind / version / createdAt / createdBy / sectionCount / titleAtRevision` per row plus the current `pageVersion` and the most recent `publishedVersion` |
| Restore action exists | ✅ | `restoreHomepageRevisionAction({ revisionId, locale, expectedVersion })` in same file — typed wrapper over the existing Phase 5 `restoreHomepageRevision` lib op, runs through `homepageRestoreRevisionSchema`, returns `{ ok, pageVersion }` or `{ ok:false, error, code, currentVersion? }` for VERSION_CONFLICT |
| Drawer mounted in EditShell | ✅ | `<RevisionsDrawer />` mounted between `<PageSettingsDrawer />` and `<MutationErrorToast />` in `web/src/components/edit-chrome/edit-shell.tsx` |
| Top bar Revisions icon wired | ✅ | `topbar.tsx` clock-arrow `<TbIconBtn title="Revisions" onClick={onRevisions}>` → `EditShell` passes `onRevisions={openRevisions}` → flips `revisionsOpen=true` in `EditContext` |
| Drawer renders kind / author / time / version | ✅ | `revisions-drawer.tsx`: `KindChip` per kind (Draft = paper / Published = green / Rollback = violet), `LiveChip` (blue) on the row whose version equals `publishedVersion`, `formatRelative` (just now / Nm / Nh / Nd / localised date) with `title=` full timestamp tooltip, version + section count + author display name |
| Restore confirm flow | ✅ | Click `Restore` → in-row two-step (`Cancel` ghost + `Yes, restore` primary). Confirm calls `restoreRevision(revisionId)` on EditContext → `restoreHomepageRevisionAction` → `restoreHomepageRevision` lib op → fresh `kind='rollback'` revision row + draft composition replaced. On success drawer closes + `refreshComposition()` reloads slots/metadata + `router.refresh()` re-renders the storefront. On `VERSION_CONFLICT` we refresh authoritative state and surface the error via the existing `MutationErrorToast`. |
| CAS / audit / cache-bust discipline | ✅ | All restores route through the existing Phase 5 `restoreHomepageRevision` op (`web/src/lib/site-admin/server/homepage.ts:1068-1240`) — same capability check (`agency.site_admin.homepage.compose`), CAS on `cms_pages.version`, audit-event emission, fresh `kind='rollback'` revision row, and (intentionally) no public cache bust because the rollback lands as draft. |
| Screenshots committed | ⏳ | Visual capture pending a staff-authenticated session at `impronta.tulala.digital?edit=1`; middleware blocks raw `*.vercel.app` so manual capture is required. Code evidence stands until then. |

## Smoke check

- `curl -sI https://tulala.digital/` → `HTTP/2 200` ✅
- `curl -sI https://impronta.tulala.digital/` → `HTTP/2 200` ✅
- `curl -sI https://app.tulala.digital/` → `HTTP/2 200` ✅
- Post-promote Action `vercel-post-deploy-alias.yml` re-aliased the two ghost-locked domains automatically (no manual alias needed).

## Notes / deferred items

- **Diff renderer + Compare tab** — out of scope for this phase. The mockup surface 6 reserves space for a per-section diff highlight against the currently-published revision; building that requires a section + prop diff utility that doesn't exist yet. Tracked under Phase 4 deferred bullets in `docs/builder-implementation-progress.md`.
- **Named-draft schema deepening** — the deeper schema (`name text`, `note text`, `tag` enum with `auto | draft | named | published`) is deferred. The existing `kind` enum already covers the auto / draft / published / rollback distinction the operator needs day-one; named drafts layer on top once the Save-as-named-draft prompt is built.
- **Timeline grouped by day / by hour** — the list is flat newest-first today. While the row count is capped at 50 server-side this is fine; if we lift the cap or surface paging, the grouping becomes worth doing.
- **Per-row Preview action** — also deferred. Today the only action is Restore (with confirm). Preview-as-of-revision needs a query-string-driven storefront variant that can render against an arbitrary snapshot — out of scope for this phase.
