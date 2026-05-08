# Media System Rewrite — Execution Plan

**Date:** 2026-05-08
**Status:** Drafted, awaiting user sign-off
**Supersedes (in part):** `media-watermark-execution-plan-2026-05-07.md` (the watermark phases are pulled into this plan; the standalone plan stays as the spec for the watermark UX details).

---

## Why this plan exists

The media system has 5 surfaces that disagree on what to read and write:

| Surface | What it does today | Variant_kind it touches |
|---|---|---|
| Roster card "image count" badge | Counts gallery + portfolio rows | reads `gallery`, `portfolio` |
| Roster card thumbnail | Picks best variant by rank | reads `card`, `public_watermarked`, `gallery`, `portfolio`, `original` |
| Talent edit page — avatar uploader | Writes one row, soft-deletes prior | writes `card` |
| Talent edit page — gallery section | **Built but not mounted** in the form | writes `portfolio` |
| Workspace **Media** admin page | Filters originals only — never finds anything | reads `original` |
| Public talent profile (`/t/...`) | Picks card; renders gallery grid | reads `banner`, `gallery`, `public_watermarked`, `card` |
| Branding logo upload | Writes URL to `agencies.settings.branding.logo_url` JSONB only | does **not** write to `agency_branding.logo_media_asset_id` |

**Symptoms the user reported:**
- Roster card shows "2" for one talent and "0" for another — but both show no images on open.
- Uploading on the edit page does nothing visible.
- Media page is empty.
- Branding logo upload doesn't save.

**Root cause:** there is no canonical contract for `variant_kind`, no canonical CRUD surface for managing assets, and the gallery UI was orphaned.

---

## Goals

1. **One contract** — every surface (roster, edit, media, public profile) reads/writes the same agreed taxonomy.
2. **Edit page actually works** — opening a talent shows their existing media; uploads persist; deletes work; reorder works.
3. **Media admin page becomes the operations console** — bulk upload (folder + zip), delete, assign-to-talent, filter, watermark controls.
4. **Branding logo round-trips** — upload → DB write → re-render shows the new logo.
5. **Watermark works end-to-end** — default agency watermark, per-image override, soft overlay rendered on public profile, with a real test we can run before declaring done.

## Non-goals

- Baked-in (sharp) watermarking for exports — keeps current "soft / CSS overlay" approach for now (deferred to its own phase per the original watermark plan).
- Video assets — image-only this pass.
- Public roster directory media changes — read path only changes if the variant_kind taxonomy demands it.

---

## Canonical taxonomy (the decision)

Three `variant_kind` values, no more:

| `variant_kind` | Purpose | Storage path convention |
|---|---|---|
| `card` | Single avatar / card thumbnail per talent. Replaces previous on upload. | `talent-card/{talent_id}/{uuid}.webp` |
| `gallery` | Portfolio grid items. Many per talent. Ordered by `sort_order`. | `talent-gallery/{talent_id}/{uuid}.{ext}` |
| `logo` | Workspace branding logo. One per tenant (replaces previous). | `agency-logos/{tenant_id}/{uuid}.{ext}` |

**Migration of legacy values:**
- `portfolio` → `gallery`
- `original` → keep the row but reclassify (`gallery` if owner is a talent, `logo` if owner is an agency, soft-delete otherwise — auditable via a one-shot SQL migration).
- `public_watermarked` → drop the variant_kind; watermarking becomes a derived render on read (CSS overlay), not a separate row. The DB column `media_assets.watermark_override_json` is the source of truth.
- `banner` → keep only if used; investigate during Phase 2 audit (likely unused).

**Watermark model:** soft-only this round.
- `agency_branding.watermark_default_json` — default config (logo asset, opacity, position, scale).
- `media_assets.watermark_override_json` — per-image override (or `{ disabled: true }` to suppress).
- Render is a CSS/SVG overlay computed on read. No new variant_kind rows.

---

## Phase plan

Phases land in dependency order. Each phase is independently shippable to prod (per the project's pre-launch shipping rules).

### Phase 0 — Audit & verification harness *(0.5 day)*

**Why:** before any rewrite, prove what's actually in the DB so the migration is safe.

- Read-only SQL audit: per-talent counts of each `variant_kind`, count of orphaned media rows (talent doesn't exist), count of branding rows missing FK.
- Save the audit output to `docs/plans/_artifacts/media-audit-2026-05-08.md`.
- Add a smoke test (`web/e2e/media.spec.ts`) that renders the roster page and asserts at least one talent's card thumb resolves to a 200 image — fail-loud baseline before changes.
- Add a manual QA checklist in this doc (see "Verification" below) — every phase ticks items off.

**Done when:** audit committed, baseline e2e green or red but explained.

---

### Phase 1 — Branding logo: fix the round-trip *(0.5 day)*

**Why first:** the watermark feature in Phase 6 depends on the logo actually saving. We cannot test watermarks without it. Independent of the variant_kind work.

Changes:
1. `web/src/lib/server-actions/admin-agency-logo-upload.ts`:
   - Verify the DB update succeeded **before** returning the public URL. Today the URL is computed and returned regardless of whether `agencies.settings` updated.
   - Also insert a `media_assets` row with `variant_kind = "logo"`, `owner_agency_id = tenantId`, and write the asset id to `agency_branding.logo_media_asset_id` (the column already exists in migration `20260601100400_saas_p1_agency_branding.sql`).
   - Storage path moves to `agency-logos/{tenantId}/{uuid}.{ext}` (uuid filename to bust CDN cache; old path was `logo.{ext}` which collides on re-upload).
2. Branding read path: prefer `agency_branding.logo_media_asset_id → media_assets.storage_path` over the JSONB blob. Keep JSONB as fallback during transition.
3. Branding form re-renders with the saved URL after submit (revalidate path).

**Verification:**
- Upload a PNG logo in `/admin/branding` → reload → logo persists.
- Reupload a different PNG → previous file soft-deleted from `media_assets`, new one shown.
- Logo URL renders on public profile header (or wherever it's surfaced).

**Done when:** all three verifications pass on prod (live env, since we are pre-launch and ship straight).

---

### Phase 2 — Variant taxonomy migration *(0.5 day)*

Single forward migration `20260508_media_variant_taxonomy.sql`:
- `UPDATE media_assets SET variant_kind = 'gallery' WHERE variant_kind = 'portfolio';`
- For `variant_kind = 'original'`: route to `gallery` if `owner_talent_profile_id IS NOT NULL`, else soft-delete (`deleted_at = now()`).
- For `variant_kind = 'public_watermarked'`: soft-delete (the watermark is now a render-time overlay, not a separate row).
- For `variant_kind = 'banner'`: leave alone if any rows exist; flag in audit.
- Add CHECK constraint: `variant_kind IN ('card', 'gallery', 'logo', 'banner')` (banner kept until Phase 6 audit confirms it's unused).

Code changes (search-and-replace, then verify):
- `web/src/app/(workspace)/[tenantSlug]/_data-bridge/roster.ts:264` — `["card", "public_watermarked", "gallery", "portfolio", "original"]` → `["card", "gallery"]`. Count uses `gallery` only.
- `web/src/app/(workspace)/[tenantSlug]/_data-bridge-media.ts:87` — `eq("variant_kind", "original")` → `.in("variant_kind", ["card", "gallery"])`.
- `web/src/app/(workspace)/[tenantSlug]/admin/roster/[id]/extended-actions.ts:435` — write `gallery`.
- `web/src/app/t/[profileCode]/page.tsx:761,772` — read `["card", "gallery"]`.
- `web/src/app/(workspace)/[tenantSlug]/_data-bridge/talent.ts:123` — same simplification.
- Any remaining reference grepped from `variant_kind` results — fix in same commit.

**Verification:**
- Run roster page → cards show counts and thumbs identical to pre-migration baseline (Phase 0 e2e still green).
- Open public profile of a talent that had `portfolio` rows → gallery still renders.
- Media admin page now shows rows.

**Done when:** the codebase contains exactly four `variant_kind` literal values: `card`, `gallery`, `logo`, `banner`. Grep proves it.

---

### Phase 3 — Talent edit page: mount gallery + reorder + delete *(1 day)*

**Why:** the GallerySection component already exists and works; it's just not mounted. Plus we need delete and reorder.

Changes:
1. `web/src/app/(workspace)/[tenantSlug]/admin/roster/[id]/TalentEditForm.tsx` — mount `<GallerySection />` next to the avatar uploader. Pass `portfolio` from `loadAllTalentMedia()` (already exists at `talent-data.ts:302`).
2. Add **delete** action in `extended-actions.ts`:
   - Soft-delete `media_assets` row (`deleted_at = now()`).
   - Storage object stays for 30 days then a separate cleanup job removes it (out of scope this plan; document the gap).
3. Add **reorder** action: bulk update `sort_order` from a drag-and-drop list. Use `@dnd-kit/sortable` if not already a dep, else simplest up/down arrows.
4. Cap: 30 gallery items per talent enforced server-side. (Pre-launch number — easy to bump.)

**Verification:**
- Open a talent with 0 images → upload 3 → all 3 visible after refresh.
- Reorder → refresh → order persisted.
- Delete one → grid updates → row marked `deleted_at` in DB.
- Roster card thumbnail updates to new top item.

**Done when:** opening any talent shows their gallery; full CRUD works; roster card reflects state.

---

### Phase 4 — Workspace Media page: real CRUD *(1.5 days)*

The current `WorkspaceMediaPage` in `_pages.tsx` is a prototype with stubbed actions. Replace with a real component, but keep the visual shell (filter bar, grid, multi-select footer).

New component: `web/src/components/admin/media/WorkspaceMediaConsole.tsx`.

Reads:
- `_data-bridge-media.ts` updated to return: id, talent_profile (or null), variant_kind, storage_path, public_url, watermark_override_json, sort_order, created_at, file_size, dimensions.

Actions (all server actions in `web/src/app/(workspace)/[tenantSlug]/admin/media/actions.ts`):
1. **`actionUploadMediaSingle`** — upload one file, no talent assignment yet (orphan asset). Visible in "Unassigned" filter.
2. **`actionDeleteMedia(ids[])`** — soft-delete one or many. Confirm dialog. Removes from gallery on the talent's edit page too.
3. **`actionAssignMediaToTalent(ids[], talentId, variantKind)`** — moves orphan or reassigns to a talent. Updates `owner_talent_profile_id` and `variant_kind`. (Variant defaults to `gallery`.)
4. **`actionUpdateWatermarkOverride(id, override)`** — sets `watermark_override_json`. Used by Phase 6.

UI additions on the page:
- Top-right **Upload** button → opens dialog with two tabs: "Single/Multi files" and "Folder/ZIP" (the ZIP tab is implemented in Phase 5).
- "Unassigned" filter chip.
- Grid tile shows: thumbnail, talent badge (or "Unassigned"), variant_kind badge, watermark indicator. Click → side drawer with Assign / Replace watermark / Delete.
- Multi-select footer wires to: **Delete selected**, **Assign to talent…** (searchable dropdown), **Apply default watermark**.

**Verification:**
- Upload one image → appears in "Unassigned".
- Multi-select 3 unassigned → assign to Adriana → appear on her edit page gallery.
- Multi-select 2 → delete → confirm dialog → soft-deleted, vanish from grid and from talent edit page.
- Reload page mid-action → state remains consistent (no orphan storage objects from failed registrations).

**Done when:** all four actions ship and the prototype stub at `_pages.tsx:9752` is removed/replaced.

---

### Phase 5 — Bulk upload: folder + ZIP *(1 day)*

Built on Phase 4's single-upload server action.

Folder upload:
- HTML `<input type="file" webkitdirectory multiple>` → iterate `FileList`, filter to images, upload each in parallel-throttled batches (4 concurrent).
- Progress bar with per-file status (queued / uploading / done / failed).

ZIP upload:
- Client-side unzip via `jszip` (already a dep candidate; verify) — no server unzip to avoid memory spikes on Vercel.
- Skip non-image entries. Cap: 100 files per zip, 500MB total.
- Same upload pipeline as folder.

Both flows:
- Default destination: orphan / unassigned (`owner_talent_profile_id = null`).
- Optional pre-pick: "Assign to: <talent>" applies during upload (saves the multi-select-then-assign step).
- After upload, banner: "X uploaded · Assign now" → opens multi-select assign dialog.

**Verification:**
- Drop a folder of 12 photos → all 12 appear unassigned → bulk-assign to a talent → her gallery has 12 items in expected order.
- Upload a ZIP of 30 photos → same.
- Upload a ZIP with some non-images → non-images skipped silently, count reflects actual.
- Upload a ZIP > 500MB → blocked with clear error.

**Done when:** drag-and-drop, file picker, and ZIP all work; failures are recoverable (retry per-file).

---

### Phase 6 — Watermark wiring + manual test *(1 day)*

This is the explicit user ask: "we test the watermark."

Implementation (per the existing `media-watermark-execution-plan-2026-05-07.md`, but pinned to soft-overlay only this round):

1. `agency_branding.watermark_default_json` schema: `{ logoMediaAssetId, opacity (0–1), position ("br"|"bl"|"tr"|"tl"|"center"), scalePct (1–100) }`.
2. **Branding drawer** — replace the "Watermark section coming" stub with real controls:
   - Toggle: "Enable default watermark".
   - Logo source: `logo_media_asset_id` (the same logo from Phase 1).
   - Opacity slider, position picker, scale slider — live preview against a sample image.
   - Save → updates `agency_branding.watermark_default_json`.
3. **`<WatermarkedImage />` component** (already exists at `web/src/components/media/watermarked-image.tsx`) — extend to:
   - Accept asset's `watermark_override_json` (per-image override beats default).
   - If `override.disabled === true`, render the bare image.
   - Else render image with absolutely-positioned `<img>` of the logo, opacity / position / scale per config.
4. Use `<WatermarkedImage />` on:
   - Public talent profile gallery grid (`/t/[profileCode]`).
   - Pitch share landing.
   - Media admin grid tiles (preview).
5. **Per-image override UI**: in the Media admin page side drawer, expose "Use default watermark / Disable / Override (custom)". Wired to `actionUpdateWatermarkOverride`.

**Manual test (the one the user explicitly asked for):**
- Upload an agency logo via Branding → verify it persists (Phase 1 verification).
- Enable default watermark in Branding → set 30% opacity, bottom-right, 18% scale.
- Save → reload Branding → settings still set.
- Open a talent's public profile → gallery images render with watermark overlay.
- Disable watermark on one specific image via Media console → public profile renders that one bare, others still watermarked.
- Re-enable → reload → watermark is back.

**Done when:** the full round-trip above passes on prod with screenshots saved to `docs/plans/_artifacts/watermark-test-2026-05-08/`.

---

### Phase 7 — Cleanup, packages, retire prototype *(0.5 day)*

1. Delete the prototype `WorkspaceMediaPage` in `_pages.tsx` once the real console is stable for one full session.
2. Update the package catalog per the existing watermark plan: `meetsPlan` gate for Studio (per-image only) vs Agency (Media console + bulk + usage). Verify the Studio tier downgrade hides the Media nav entry.
3. Update `MEMORY.md` entry for `project_media_watermark_feature.md` to point at this plan and mark watermark MVP shipped.
4. Update pricing page copy if Media is now Agency-only.

**Done when:** Studio account sees no Media nav; Agency account sees the full console; pricing page reflects the gating; old prototype gone.

---

## Cross-cutting concerns

**Storage cleanup.** Soft-delete only this round — no Vercel cron job to garbage-collect storage objects. Document in code comment + open a ticket for "media storage GC" follow-up. Cost risk is low at current scale.

**RLS.** Existing policies on `media-public` and `media-originals` already gate by talent UUID folder path. New `agency-logos` path needs RLS allowing tenant admins to write to their own tenant folder; service-role bypass already covers the action path. Add a migration test.

**Roster card count.** Definition becomes: `count of media_assets where owner = talent AND variant_kind = 'gallery' AND deleted_at is null`. The "card" avatar does not count.

**Cache busting.** All public URLs include the asset uuid in the path so CDN doesn't serve stale.

**No fallbacks for legacy code paths.** Pre-launch — once Phase 2 migration runs, dead code is deleted, not left as compatibility shims.

---

## Verification (acceptance test, end-to-end)

After all phases ship, this script must pass on prod:

1. **Branding logo:** Upload PNG → reload → logo on profile → reupload different PNG → previous gone, new shown. ✓
2. **Talent gallery (existing data):** Open Adriana → see 2 images that previously showed as "2 count". ✓
3. **Talent gallery (new upload):** Open Alexa (count 0) → upload 4 photos → all 4 visible → roster card thumb updates → count badge becomes "4". ✓
4. **Reorder + delete:** Drag photo 4 to position 1 → save → reload → order persists. Delete photo 2 → grid + roster card update. ✓
5. **Media console — single upload:** Drop 1 file → appears unassigned → assign to talent → on her gallery. ✓
6. **Media console — bulk:** Drop folder of 10 → all unassigned → multi-select 5 → assign to Alexa → her gallery has 5. ✓
7. **Media console — ZIP:** Upload zip of 12 photos → 12 unassigned. ✓
8. **Media console — delete:** Multi-select 3 → delete → confirm → gone from grid and from talent gallery. ✓
9. **Watermark default:** Enable default in Branding → 30% opacity bottom-right → public profile gallery shows watermark on every image. ✓
10. **Watermark override:** One image set to "disabled" → that one bare on public profile, others still watermarked. ✓
11. **Re-render check:** Hard reload of public profile → watermark state survives. ✓

All 11 must pass. Any failure blocks the phase from being marked done.

---

## Open questions for the user

Before I start coding, confirm or override:

1. **Reorder UX** — drag-and-drop (uses `@dnd-kit`, ~50KB) or simple up/down arrows? I default to **drag-and-drop**.
2. **Folder upload concurrency** — 4 parallel uploads default. Acceptable?
3. **Media console → talent assignment** — assigns as `gallery` by default. Should there be a UI to assign as `card` (avatar) instead? I lean **no** — avatar is a roster-edit-page concern.
4. **Watermark — exempt the avatar (`card`)?** Default agency watermark applies to gallery images on public profile. Should the avatar be watermarked too? My default: **no** (avatars are a tight crop and watermarks look bad on them). User override available per-image regardless.
5. **Plan timing** — phases 1-6 estimate ~5 days total. Ship one-by-one to prod, or bundle into a single PR? Per pre-launch shipping rules I'll **ship straight** unless told otherwise.

---

## Out of scope (deliberately)

- Video assets.
- Baked-in (sharp) watermarking for export.
- Storage object garbage collection cron.
- Public roster card layout changes (only the count + thumb source change).
- Notification when admin assigns media to a talent.
- AI tagging / face detection / smart sort.

These are tracked as follow-ups but not part of this plan.
