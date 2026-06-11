# Page Builder Platform — Browser QA Checklist (WS8)

> Execute this checklist on the dev server (localhost or a seeded host alias)
> after merging `integration/page-builder` to verify all WS1–WS6 deliverables.
> The orchestrator runs this; automated test coverage is in `npm run test:builder`.

---

## Prerequisites

1. Dev server running on a registered host:
   ```
   cd web && npm run dev
   ```
   The middleware gates every request against `public.agency_domains`. Use
   `localhost:3000` (if seeded) or a custom host alias from `agency_domains`.

2. Dev sign-in URL — paste this in your browser:
   ```
   /api/dev/signin?email=qa-admin@impronta.test&next=/platform/admin?platformPage=builder-lab
   ```
   This authenticates as the platform super_admin and deep-links directly to
   the Builder Lab page.

3. Network tab open in DevTools. DB access via Supabase Table Editor to verify
   no writes to `cms_page_sections`.

---

## Check 1 — Builder Lab loads (Talent / Workspace / Templates)

**Steps:**
1. After sign-in, confirm the Builder Lab page renders with three area tabs:
   - "Talent Lab"
   - "Workspace Lab"
   - "Templates"
2. Switch between each tab — all three must render without errors.
3. In "Talent Lab": confirm a Talent subject picker is visible and populated
   with real talent names from the DB.
4. In "Workspace Lab": confirm a Workspace subject picker is visible and
   populated with real tenant names.
5. In "Templates": confirm the Template Manager table renders (may be empty on
   a fresh DB).

**Expected:** All three areas load. No console errors. No 500 responses in the
network tab.

**Screenshot:** Capture the Builder Lab page showing all three tabs.

---

## Check 2 — Add Gallery shows "Page Templates" tab; dbTemplate insert yields editable freeform

**Steps:**
1. In Talent Lab or Workspace Lab, select a subject from the picker.
2. The builder canvas mounts (the shared `EditProvider`). Open the Add Gallery
   panel (click "+ Add" or the gallery button).
3. Confirm a "Page Templates" tab is visible in the gallery alongside
   "Sections", "Elements", "Connected", etc.
4. If any published page templates exist in `builder_templates`, click one to
   insert it.
5. Open the Navigator panel — every inserted node must show a
   `data-builder-node-id` attribute and appear as an editable layer (no locked
   nodes, no "view only" indicator).

**Expected:** "Page Templates" tab appears. Inserted template nodes are fully
editable in the Navigator (can be selected, moved, deleted).

**Screenshot:** Navigator showing inserted template nodes with `data-builder-node-id`.

---

## Check 3 — Talent preview: real data hydrates; `cms_page_sections` untouched

**Steps:**
1. In Talent Lab: select a real talent as the preview subject.
2. Confirm the canvas shows connected sections hydrated with that talent's data
   (bio, photos, services from the selected talent, not the platform tenant's
   data).
3. In the Network tab: confirm no request writes to `cms_page_sections`
   (no POST/PATCH to any Supabase endpoint targeting that table).
4. In Supabase Table Editor: confirm `cms_page_sections` row count is unchanged
   before and after preview interactions.

**Expected:** Real talent data renders in connected nodes. Zero `cms_page_sections`
writes in the network log.

**Screenshot:** Canvas with the talent's real name/photo visible in a connected section.

---

## Check 4 — Workspace preview: roster/brand hydrates; active tenant unchanged

**Steps:**
1. In Workspace Lab: select a workspace (tenant) as the preview subject.
2. Confirm the canvas shows connected sections hydrated with that workspace's
   brand/roster data (e.g. featured talent roster, workspace name).
3. The platform admin's own workspace (active tenant) must NOT be changed or
   overwritten by the preview selection.
4. Switch the workspace subject picker to a different workspace — the canvas
   should re-hydrate with the new workspace's data.

**Expected:** Each workspace selection refreshes the canvas data without
mutating any persistent state for the platform admin's workspace.

**Screenshot:** Canvas hydrated with the selected workspace's featured talent roster.

---

## Check 5 — Asset Library opens; Exit works (lab vs live header); Publish dropdown all actions fire

**Steps:**
1. In the Builder Lab editor: click the "Asset Library" button in the command
   dock. Confirm the Asset Drawer opens.
2. Click the Exit button in the builder header. Confirm it navigates back to
   the Builder Lab shell (not to the live storefront).
3. Open the Publish dropdown (top-right of the builder header). Confirm every
   menu item is present and fires the correct handler:
   - **Save draft** → "Saved" indicator appears
   - **Preview** → enters preview mode (canvas becomes read-only)
   - **Revision history** → Revisions drawer opens
   - **Page settings** → Page Settings drawer opens
   - **Duplicate page** → Pages picker opens
   - **Unpublish / Archive** → Publish drawer opens (shows unpublish options)
   - **Schedule** → Schedule drawer opens
4. In the "live" (storefront) editor, confirm the header Exit button label is
   "Exit to live site" (or the configured exitLabel) and the header variant is
   "live" (no previewSubjectChip visible).

**Expected:** All Publish menu items fire their handlers. Asset Library opens.
Exit navigates correctly for both lab and live variants.

**Screenshot:** Publish dropdown open with all items visible.

---

## Check 6 — Publish a template from the Lab; appears in Workspace/Talent Add Gallery per target/plan

**Steps:**
1. In the Builder Lab builder, build or load a simple section.
2. Click "Save as section template" (or "Save as page template") and fill in:
   - Title, category, gallery_tab, required_plan, target_context (set to "both"
     for maximum visibility in this test).
3. In the Template Manager (Templates tab), find the new draft. Click
   "Submit for Review" then "Publish".
4. Confirm the template's status becomes "published" in the Template Manager.
5. Switch to a Workspace Lab editor: open Add Gallery → the published template
   should now appear under its gallery tab (e.g. "Sections").
6. Insert the template — confirm it inserts as an editable freeform node
   (Navigator shows the node, all children are editable).
7. Switch to a Talent Lab editor and repeat the insert check.
8. In Supabase Table Editor: confirm the template row exists in
   `builder_templates` with `status='published'`. Confirm `cms_page_sections`
   is still unchanged.

**Expected:** Template publishes to the gallery. It appears in both Workspace
and Talent Add Gallery filtered by plan/target. Inserts as editable freeform.
Zero writes to `cms_page_sections`.

**Screenshot:** Add Gallery showing the newly published template, and the
Navigator after insertion showing editable freeform nodes.

---

## Automated test reference

The automated counterparts to each browser check:

| Browser check | Automated test file | npm script |
|---|---|---|
| WS1: homepage parity | `builder-core/homepage-adapter-parity.test.ts` | `test:builder` |
| WS1: legacy-write runtime guard | `builder-core/legacy-write-guard.test.ts` | `test:builder` |
| **WS8: static legacy-write guard** | `builder-core/legacy-write-guard.static.test.ts` | `test:builder` |
| WS5: ephemeral persistence spy | `builder-core/adapters/platform-lab-adapter.test.ts` | `test:builder` |
| WS4: dbTemplate freeform insert | `add-gallery/insert.test.ts` | `test:builder` |
| WS4: gallery merge + gating | `add-gallery/registry-db-merge.test.ts` | `test:builder` |
| WS3: publish-menu actions | `components/edit-chrome/publish-menu.test.tsx` | `test:builder` |
| WS2: template registry lifecycle/RLS | `builder-core/templates/registry.test.ts` | `test:builder` |
| WS4: preview subject hydration | `builder-node/section-embed-preview-subject.test.ts` | `test:builder` |
| WS6: consumer surfaces guard | `builder-core/adapters/consumer-surfaces-adapter.test.ts` | `test:builder` |

Run all automated checks with:
```
cd web && npm run test:builder
```

Expected: **464 tests pass, 0 fail** (as of WS8 harness delivery).

---

## Known pre-existing test failure (NOT a regression)

`src/lib/site-admin/builder-node/render.test.ts` — test "renders live featured
talent data for data-ready containers" — **fails intentionally** because it
requires a live DB connection to hydrate real talent data. This test is excluded
from `test:builder` to keep the suite self-contained. It is documented here so
it is never mistaken for a new regression.

To run the full builder-node suite (including the known failure):
```
npm run test:builder-node-bindings
```
This will show 35/36 pass in `render.test.ts`.

---

## Gotchas

- **Middleware host gate**: raw `*.vercel.app` preview URLs return 404 before
  route matching. QA must run on `localhost` (if seeded in `agency_domains`) or
  a known-registered host alias. See CLAUDE.md QA caveat.
- **Dev sign-in route**: `/api/dev/signin` is only available when
  `NEXT_PUBLIC_ENABLE_DEV_SIGNIN=1` (or equivalent dev env flag). Check
  `.env.local` before using.
- **Worktree `.env.local`**: carries prod secrets — remove after QA; never
  commit.
- **Builder Lab super_admin gate**: the Builder Lab page is only accessible
  to `app_role = 'super_admin'`. The `qa-admin@impronta.test` profile must have
  this role in `public.profiles` for the sign-in URL to land on the Builder Lab.
