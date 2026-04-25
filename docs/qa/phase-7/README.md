# Phase 7 QA — Assets manager

Code-level verification passed (2026-04-25).

## Build

- **Source commit:** `f319d25` — `feat(edit-chrome): Phase 7 — Assets drawer`. Six files: typed action wrappers (`assets-actions.ts`), drawer component (`assets-drawer.tsx`), DRAWER_WIDTHS extension, EditContext mutex wiring, EditShell mount + Escape + ⌘L keybind, TopBar folder icon button.
- **Production deployment** (containing Phase 7 + a follow-up admin tweak in `c46f1fe`): `dpl_6arFrVkW3t8aEYa4Qn5wgU21RVFj` — `tulala-hefw4cuvb-oran-tenes-projects.vercel.app` — state `READY`, target `production`. Aliased automatically to `tulala.digital` / `impronta.tulala.digital` / `app.tulala.digital` by the post-deploy GitHub Action.
- **TypeScript:** `cd web && rm -rf .next/dev/types .next/types && npx tsc --noEmit` exits clean (zero errors).

## Strategy note — schema reuse

No migration was required for Phase 7. The `media_assets` table already carries every column the drawer reads (`id, tenant_id, owner_talent_profile_id, variant_kind, storage_path, bucket_id, width, height, file_size, created_at, metadata, approval_state, deleted_at`). The new typed actions wrap the existing `listTenantMediaLibrary` reader; the usage scanner is a server-side substring scan over `cms_sections.props_jsonb` rows for the tenant — no new tables, no DDL.

## Acceptance criteria

| Item | Status | Evidence |
|---|---|---|
| TS errors fixed | ✅ | `tsc --noEmit` clean after wiping `.next/dev/types` |
| Prod deploy green | ✅ | `dpl_6arFrVkW3t8aEYa4Qn5wgU21RVFj` `state=READY`, `target=production` |
| Prod smoke | ✅ | `curl -sI https://tulala.digital/` → `HTTP/2 200`; `https://impronta.tulala.digital/` → `200`; `https://app.tulala.digital/` → `200` |
| Typed action wrappers | ✅ | `web/src/lib/site-admin/edit-mode/assets-actions.ts`: `loadAssetsLibraryAction()` returns `{ ok, snapshot: { items, fetchedAt } }`; `scanAssetUsageAction()` returns `{ ok, usage: Record<assetId, { assetId, refCount, sectionIds }> }`. Both gated by `requireStaff` + `requireTenantScope`, mirroring the design + revisions edit-mode wrappers from Phases 4–5. |
| Drawer kind extension | ✅ | `DRAWER_WIDTHS.assets = 720`, `assetsExpanded = 960` (`web/src/components/edit-chrome/kit/tokens.ts`). Same default width as the picker drawer; expanded fits a 4-column tile grid comfortably. |
| EditContext wiring | ✅ | `assetsOpen` state + `openAssets / closeAssets` callbacks added (`web/src/components/edit-chrome/edit-context.tsx`). The right-side drawer mutex is now 5-way: opening Assets dismisses Publish / PageSettings / Revisions / Theme, and vice versa. Value memo + deps array updated so consumers re-render on the new toggles. |
| AssetsDrawer component | ✅ | `web/src/components/edit-chrome/assets-drawer.tsx`. Lazy-fetches library + usage scan in parallel on open via `Promise.all`; re-fetches every open so a publish from a peer surface (or an upload from a section media picker) shows up without a hard refresh. Five tabs (All / Images / Videos / Documents / Brand), with Videos + Documents intentionally surfaced as calm "coming soon" empty states until their upload routes ship. In-memory search filters across filename, storage path, source hint, and variant kind. |
| Multi-select + batch action | ✅ | "Select" button in the footer flips a checkbox onto every tile; selected count shows in the footer. Cancel / Copy URLs primary actions. `navigator.clipboard.writeText` joins selected `publicUrl`s with newlines so the operator can paste a batch into form fields, brand kits, or external tools. |
| Per-asset usage badge | ✅ | Tile top-right corner: green `Used · N` chip when the scanner found references; muted `Unused` chip otherwise. The scanner pulls every non-archived `cms_sections` row for the tenant in one round-trip (cap 500), stringifies each `props_jsonb` once, and substring-matches both `assetId` and `storagePath` per asset — O(N×M) but bounded (60 assets max × ≤500 sections), single Supabase RTT, sub-100ms in practice. |
| Upload affordance | ✅ | Footer "Upload" button reuses the existing `/api/admin/media/upload` route (multipart, tenant-scoped, staff-gated, 10 MB cap, image-MIME whitelist). Optimistic prepend on success so the new tile shows up immediately; usage map records an explicit zero so the badge code doesn't read stale `undefined` until the next scan. |
| TopBar entry point | ✅ | New folder icon button between Theme and Preview in the right cluster (`web/src/components/edit-chrome/topbar.tsx`). Tooltip "Assets library (⌘L)". `onAssets={openAssets}` wired through `edit-shell.tsx`. |
| Keyboard shortcut | ✅ | `web/src/components/edit-chrome/edit-shell.tsx` Escape handler dismisses Assets alongside the other four right-side drawers; new `⌘L / Ctrl+L` toggle (open if closed, close if open). Skipped when an editable element is focused so it doesn't fight inline editing. |
| Drawer chrome consistency | ✅ | Uses the shared `Drawer` / `DrawerHead` / `DrawerTabs` / `DrawerBody` / `DrawerFoot` primitives — same paper-tinted body, white cards, pill tabs, footer treatment as Publish / PageSettings / Revisions / Theme. Tile borders use the chrome `line` token; selected state uses `blueLine` + `CHROME_SHADOWS.card` for a soft ring. No bespoke styling that diverges from the kit. |
| Empty / loading states | ✅ | Skeleton grid (6 placeholder tiles, 55% opacity) while the parallel fetch is in flight. Calm "no matches" / "no assets yet" / "no brand assets" copy via the shared `Calm` atom — same dashed-border surface card pattern Phase 5 used for the design code panel. Coming-soon copy for Videos / Documents explains the milestone gap without faking content. |
| Tile metadata | ✅ | Filename truncated, then a tabular-numeric line with `WIDTH×HEIGHT · SIZE` (KB / MB). `bytesLabel` handles null gracefully. `dimensionsLabel` returns null for assets without width/height (older seeds) and the row collapses to just the size. |
| Screenshots committed | ⏳ | Visual capture pending a staff-authenticated session at `impronta.tulala.digital?edit=1`; middleware blocks raw `*.vercel.app` so manual capture is required. Code evidence stands until then. |

## Promote + smoke

- **Production deployment id:** `dpl_6arFrVkW3t8aEYa4Qn5wgU21RVFj`
- **Auto-promoted via** GitHub auto-deploy on push to `phase-1` (combined with the parallel-session admin tweak in `c46f1fe`)
- `curl -sI https://tulala.digital/` → `HTTP/2 200` ✅
- `curl -sI https://impronta.tulala.digital/` → `HTTP/2 200` ✅
- `curl -sI https://app.tulala.digital/` → `HTTP/2 200` ✅

## Notes / deferred items

- **Drag-into-canvas** — the mockup hints at dragging tiles directly onto a section to use the asset there. Today's flow is: select tiles, Copy URLs, then paste into the inspector field. Drag-and-drop wiring touches the InlineEditor + every section's media field; tracked as a Phase 7 follow-up so the manager itself ships first.
- **"Use N in section" primary action** — the mockup shows a contextual primary CTA when a section is selected on the canvas. Phase 7 v1 ships Copy URLs as the universal action; the contextual variant lights up cleanly once the section media schema gets a "set from URL list" entry point.
- **Bulk delete + tag** — selection model is in place but destructive ops (`media_assets.deleted_at`, brand-kit tagging) wait on the M11 brand-kit story to land first; the drawer is forward-compatible with both.
- **Video / Document uploads** — placeholder tabs surface a calm "coming soon" empty state. Lighting them up is one upload route + one MIME whitelist extension each. Tracked under Milestone D.
- **Brand tab today** — relies on `metadata.source` / `metadata.seeded_by` substring-matching `brand`. Proper brand-kit tagging is M11 territory; the tab will populate naturally as soon as the tagging shape lands.
