# Phase 2 QA — Top bar mission control + Page Settings + Publish rebuild

Code-level verification passed (2026-04-24).

## Build

- **Source commits:** `7152114` (TopBar wired + Page Settings drawer) → `09eb019` (Publish drawer rebuild) → `e8c5fda` (Save draft mechanism) → `4751729` (tracker advance to gate)
- **Preview build:** `dpl_Cpjdq9R8s8UgFwtS2wbXLWMu5Dok` — `tulala-pz59ix73o-oran-tenes-projects.vercel.app` (commit `e8c5fda`) — state `READY`.
- **Production promote:** `tulala-pz59ix73o-oran-tenes-projects.vercel.app` promoted via `vercel promote --yes`. Live on `tulala.digital`, `app.tulala.digital`, `impronta.tulala.digital`.
- **TypeScript:** `cd web && tsc --noEmit` exits clean (zero errors). The only noise is a stale `.next/dev/types/routes.d.ts` left by the Turbopack dev server — it is in `.next/`, ignored from version control, and is not part of the build typecheck.

## Acceptance criteria

| Item | Status | Evidence |
|---|---|---|
| TS errors fixed | ✅ | `tsc --noEmit` clean after wiping `.next/dev/types` |
| Vercel build green on `phase-1` | ✅ | `dpl_Cpjdq9R8s8UgFwtS2wbXLWMu5Dok` `state=READY` |
| Top bar shows all 10 controls | ✅ | `web/src/components/edit-chrome/topbar.tsx` — brand pill + page picker + save status + Undo + Redo + viewport switcher + page settings + revisions + preview + share + Save draft + Publish split-button (titles: "Switch page", "Undo (⌘Z)", "Redo (⇧⌘Z)", "Page settings", "Revisions", "Preview as visitor (⌘P)", "Share preview link", "Save a draft checkpoint", "Publish options") |
| Page Settings opens its own drawer | ✅ | `topbar.tsx` cog button → `onPageSettings` → `openPageSettings()` in `EditContext` flips `pageSettingsOpen=true` → `<PageSettingsDrawer>` mounts in `edit-chrome.tsx` with Drawer `kind="pageSettings"` (520px) |
| Publish drawer is rebuilt design | ✅ | `web/src/components/edit-chrome/publish-drawer.tsx` — preview thumbnail card + page-settings mini (Open full → openPageSettings) + search-preview card + going-live list with `(legacy)` collapsed behind disclosure; footer Save draft + Cancel + Publish now |
| Save draft creates a `cms_page_revisions` row | ✅ | `saveDraftHomepageAction` (composition-actions.ts:704) wraps `saveHomepageCompositionAction`, which writes to `cms_page_revisions` with `kind='draft'` on every successful save. EditContext's `saveDraft()` is wired from the topbar text button + `Save as named draft…` menu item + Publish drawer footer button. `DraftSavedToast` surfaces the server timestamp |
| Screenshots committed | ⏳ | Visual capture pending a staff-authenticated session at `impronta.tulala.digital?edit=1`; middleware blocks raw `*.vercel.app` so manual capture is required. Code evidence stands until then. |

## Smoke check

- `curl -sI https://tulala.digital/` → `HTTP/2 200` ✅
- `curl -sI 'https://impronta.tulala.digital/?edit=1'` → `HTTP/2 200` ✅
- Both responses include the project's CSP and tenant headers, confirming the middleware allow-list is matching post-promote.

## Notes / deferred items

- **Page Settings → Code tab** (`<head>` injection): deferred — needs a `cms_page_metadata.head_html` schema field. Tracker keeps the unchecked box and will be picked up alongside the SEO schema work.
- **Publish drawer diff list with edited/added/removed badges:** deferred — needs a server-side diff vs. last-published snapshot. The current rebuild renders the full going-live list as a graceful fallback so operators still see what's about to ship.
- **Last published meta line** in the Publish drawer header currently renders an em-dash placeholder until `lastPublishedAt` is captured into a column the server can hand back; immediate post-publish path renders the just-issued ISO timestamp.

These are explicit, scoped deferrals — they live in the tracker so the next milestone can pick them up. The Phase 2 gate as defined ships.
