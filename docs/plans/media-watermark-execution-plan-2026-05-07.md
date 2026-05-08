# Media Gallery + Watermark — Execution Plan

**Date:** 2026-05-07
**Spec source:** `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_media_watermark_feature.md`
**Gating:** `meetsPlan(state.plan, "studio")` for watermark; `meetsPlan(state.plan, "agency")` for gallery/usage/bulk
**Pattern reference:** Field Catalog (`web/src/app/prototypes/admin-shell/_drawers.tsx:16275`)

---

## Phase 0 — Logo upload (prerequisite)

**Why first:** Nothing watermarks without a logo. Schema column `agency_branding.logo_media_asset_id` exists; UI is stubbed in BrandingDrawer.

**Tasks**
- Wire logo upload in `_drawers.tsx` BrandingDrawer (replace `"Logo upload coming next iteration"` stub).
- Upload via existing `media-public` bucket; insert `media_assets` row (no `owner_talent_profile_id` — agency-owned logos need a nullable FK or a synthetic agency talent stub; pick one and migrate).
- Set `agency_branding.logo_media_asset_id` on save.
- Light + dark variant slots (column `logo_dark_media_asset_id` already exists).

**Acceptance**
- Upload PNG/SVG → preview renders → reload page → still rendered.
- Replace flow works (old asset soft-deleted).

**Migration risk:** `media_assets.owner_talent_profile_id` is currently NOT NULL. Must drop NOT NULL or introduce `owner_kind`. Decision: **drop NOT NULL** + add CHECK that exactly one of `owner_talent_profile_id` / `owner_agency_id` is set. New column `owner_agency_id UUID REFERENCES agencies(id)`.

---

## Phase 1 — Workspace Media page (Agency only, read-only)

**Route:** `web/src/app/(workspace)/[tenantSlug]/admin/media/page.tsx`

**Tasks**
- New nav item "Media" in admin left sidebar. Locked (`PlanLockPill plan="agency"`) for Free/Studio.
- Server-side data loader `web/src/lib/admin-workspace-media-data.ts`:
  - Query `media_assets` joined to `talent_profiles` filtered by `talent_profiles.tenant_id = ?`.
  - Return: id, storage_path, talent name, talent slug, variant_kind, approval_state, created_at, sort_order.
  - Pagination (cursor by created_at).
- Grid component: thumbnail + talent badge + status pill on each card.
- Filter bar: talent (multi-select), approval state, variant kind, date range.
- Empty state + loading skeletons.

**Out of scope this phase:** edit, watermark, bulk actions, usage tab — read-only.

**Acceptance**
- Agency-tier user sees grid of every workspace photo.
- Studio-tier user sees locked nav row + upgrade modal on click.
- Filters reduce result set correctly.
- Performance: 1k images < 1.5s server render.

---

## Phase 2 — Workspace watermark default (Studio + Agency)

**Tasks**
- DB migration: `ALTER TABLE agency_branding ADD COLUMN watermark_preset_json JSONB`.
  Shape: `{ enabled: bool, position: 'tl'|'tc'|'tr'|'ml'|'mc'|'mr'|'bl'|'bc'|'br', size_pct: 4–25, opacity: 0–1, padding_pct: 0–10, variant: 'light'|'dark' }`.
- BrandingDrawer: new "Watermark" section below logo. Position 3×3 grid, size slider, opacity slider, padding slider, light/dark toggle, enable switch.
- Live preview pane: sample image with logo overlay.
- `<WatermarkedImage>` component (`web/src/components/media/watermarked-image.tsx`):
  - Wraps `next/image` + absolutely positioned `<img>` overlay.
  - Server component reads agency preset from current tenant.
  - Resolves theme (light vs dark) at render.
- Wire `<WatermarkedImage>` into:
  - Public talent profile gallery
  - Pitch public link image rendering

**Studio gating:** the Watermark section in BrandingDrawer is unlocked at Studio. The "Save as default" lever and the live `<WatermarkedImage>` rendering on public surfaces both require the tenant be on Studio+ — gate with `meetsPlan(state.plan, "studio")`.

**Acceptance**
- Studio + Agency tenants can edit and save preset.
- Free tenant sees locked card + upgrade CTA.
- Public talent profile shows watermark only when `enabled: true`.
- Logo respects light/dark theme of the surface.

---

## Phase 3 — Per-image override (Studio + Agency)

**Tasks**
- DB migration: `ALTER TABLE media_assets ADD COLUMN watermark_override_json JSONB` (same shape as preset; null = use workspace default).
- New modal: WatermarkEditor (`web/src/components/media/watermark-editor.tsx`).
  - Left: live preview with draggable logo overlay (5 magnetic anchors at 5% inset).
  - Right: position grid + sliders + reset to default + apply.
- Open from per-talent media row in `EditorSections.tsx` and from media page tile (Phase 1).
- `<WatermarkedImage>` resolution order: per-asset override → workspace default → none.

**Acceptance**
- Override saves and persists.
- Reset clears override and falls back to default visibly.
- Drag snaps to corners + center.
- Studio gets this; Free is locked.

---

## Phase 4 — Bulk apply + Usage tab (Agency only)

**Tasks**
- Media page: multi-select with persistent footer toolbar (count + actions).
- Bulk action: "Apply watermark override" → opens WatermarkEditor in bulk mode → writes the same override JSON to N rows.
- Bulk action: "Clear override" → set override to null.
- Usage tab on media page:
  - Postgres view `media_asset_usage` joining `media_assets` to talent profile (always), `pitch_items`, `inquiry_attachments`, `booking_attachments` if those tables exist.
  - One row per use site; columns: media_asset_id, surface, surface_title, surface_url, last_used_at.
  - UI: split-pane — image on left, usage list on right.

**Acceptance**
- Bulk select 50 photos → apply override → all show updated watermark on public profile.
- Usage tab for a photo shows every pitch / inquiry / profile that references it.
- Performance: usage view query < 500ms for 10k assets.

---

## Phase 5 — Baked exports (Studio + Agency, when needed)

**Tasks**
- DB migration: extend `media_variant_kind` ENUM with `'watermarked'`; add `source_media_asset_id UUID REFERENCES media_assets(id)`.
- Server route `web/src/app/api/media/bake-watermark/route.ts`:
  - Input: `media_asset_id`.
  - Loads source from `media-originals` bucket, applies `agency_branding.logo_media_asset_id` + resolved preset via `sharp.composite()`.
  - Writes to `media-public/{talent_id}/wm/{uuid}.jpg`.
  - Inserts new `media_assets` row with `variant_kind='watermarked'`, `source_media_asset_id` set.
- Hook into PDF / lookbook export pipeline: when generating, prefer watermarked variant when present, else bake on-demand.

**Acceptance**
- PDF export contains baked watermark.
- Re-bake invalidates and replaces stale variants when preset changes.

---

## Phase 6 — Package update (post-QA, BLOCKING release)

**This phase does not begin until phases 0–5 are merged AND QA on localhost + on `tulala.digital` preview passes.**

Per user instruction 2026-05-07: packages must be updated before announcing the feature.

**Tasks**
- [`web/src/app/(marketing)/pricing/page.tsx`](web/src/app/(marketing)/pricing/page.tsx) — public comparison matrix:
  - Add row "Logo watermark on photos" — Studio ✓ / Agency ✓ / Network ✓
  - Add row "Workspace media gallery" — Agency ✓ / Network ✓
  - Add row "Photo usage tracking" — Agency ✓ / Network ✓
- [`web/src/app/prototypes/admin-shell/_drawers.tsx`](web/src/app/prototypes/admin-shell/_drawers.tsx) `defaultUnlocks()`:
  - Studio unlocks: append `"Logo watermark"`.
  - Agency unlocks: append `"Branded media gallery"`, `"Photo usage tracking"`.
- [`web/src/lib/access/plan-catalog.ts`](web/src/lib/access/plan-catalog.ts) — if a per-plan feature list field exists by then, sync. (Currently doesn't carry feature lists; just price/rank metadata.)
- Spot-check upgrade modals from each lock surface render the new unlocks correctly.

**Acceptance**
- `/pricing` shows new rows with correct ticks.
- Upgrading from a locked Media nav row shows the new unlocks list in the modal.
- Sandbox a Free tenant → click locked Media → modal mentions media gallery + usage tracking.

---

## QA matrix (run before Phase 6)

Per `feedback_dev_workflow.md` — localhost first.

| Test | Free | Studio | Agency | Network |
|------|------|--------|--------|---------|
| Sees Media nav row | locked | locked | unlocked | unlocked |
| Can open BrandingDrawer Watermark section | locked | unlocked | unlocked | unlocked |
| Watermark renders on public profile | no | yes | yes | yes |
| Per-image override editor opens | no | yes | yes | yes |
| Bulk apply works | no | no | yes | yes |
| Usage tab visible | no | no | yes | yes |
| PDF export has baked watermark | no | yes | yes | yes |
| Free-tier "friend-link" talent NOT watermarked | n/a | yes | yes | yes |

Run on `tulala.digital` preview after localhost passes.

---

## Open decisions (resolve before starting Phase 0)

1. **Logo asset ownership** — extend `media_assets` with `owner_agency_id` (preferred) vs. synthetic agency-talent row vs. separate `agency_assets` table.
2. **Watermark on un-claimed talent** — talent who haven't claimed their account yet but were added by agency: treat as exclusive (watermark) or as friend-link (no watermark)? Default proposal: watermark; flip if their tier moves to Free post-claim.
3. **Logo source for tenants without an uploaded logo** — fall back to `brand_mark_svg` if present, else feature is disabled (preset enabled=false on save).
