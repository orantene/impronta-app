# Impronta Local QA

Date: 2026-05-06

Impronta is the canonical local QA tenant for builder and tenant-admin flows.

## Canonical URLs

- Admin login: `http://localhost:3000/login?next=%2Fimpronta%2Fadmin%2Fsite`
- Admin site page: `http://localhost:3000/impronta/admin/site`
- Storefront edit mode: `http://localhost:3000/impronta?edit=1`

## Local host rule

Use `localhost:3000` for auth-sensitive local QA. Branded hosts such as
`impronta.local:3000` remain useful for host-routing tests, but they should not
be the default handoff from localhost admin flows because browser auth cookies
can be scoped separately by host.

## Smoke flow

1. Sign out.
2. Open the admin login URL above.
3. Sign in as the Impronta owner.
4. Confirm the browser lands on `/impronta/admin/site`.
5. Open the page builder.
6. Confirm the URL stays on `/impronta?edit=1...` and edit chrome shows
   navigator, responsive preview controls, and Publish controls.

## Fast local QA command

Run this before/after larger builder changes:

```bash
npm --prefix web run qa:impronta-local
```

Current gate includes:
- auth routing role-safe redirects
- builder capability policy checks
- BuilderNode binding, operation, render, data-binding, and layout-health tests
- publish preflight validation tests
- strict tenant-wide published snapshot verification

## Layout health QA

The Layout inspector now shows `Layout checks` for selected parent builder
nodes. These checks stay inside the current builder foundation and are covered
by `npm --prefix web run test:builder-node-bindings`.

Recent operator UX upgrades:

- Findings are deterministically sorted as `blockers → warnings → recommendations`.
- The card header now shows explicit counts by severity instead of a single total.
- Blocking findings are visually isolated so publish-stopper issues read first.

Manual checks on `http://localhost:3000/impronta?edit=1`:

1. Insert or select a grid container with 2+ columns.
2. Open the Layout tab.
3. Confirm the selected-node panel shows a mobile-stack warning when mobile
   overrides are missing.
4. Click `Stack on mobile`.
5. Confirm the warning clears or downgrades after the responsive patch saves.

Current rule coverage:

- multi-column container without mobile stack
- 3+ column container without tablet column tuning
- split layouts that refuse mobile collapse
- autoplay carousel without arrows/dots
- dense carousel/masonry patterns that may need operator review

## Publish preflight focus flow

The Publish drawer preflight list now groups issues by severity and category.
Each issue with a linked section exposes a `Focus section` action.

Manual checks:

1. Open `http://localhost:3000/impronta?edit=1`.
2. Open Publish.
3. Confirm issues are grouped as `Publish blockers` and `Warnings`.
4. Click `Focus section` on an issue with section context.
5. Confirm the selected section in edit state changes to that section.

## Undo/redo history safety

Undo/redo now has rollback-safe guards for failed persistence:

- If a history replay save fails, the consumed history entry is restored.
- Undo/redo is ignored while a save is in progress (`saving` guard).
- Composition restore uses the latest builder-tree ref when reconciling slots.

This prevents history drift when network/CAS failures happen during undo/redo
replay.

## Builder operation error diagnostics

Builder-node mutations now return operation-aware failure copy with targeted
causes (`invalid target`, `schema mismatch`, `guarded shell node`,
`version conflict`) and include validation issue snippets when available.

Manual checks:

1. Try moving a block into a disallowed parent and confirm the toast says
   `Move blocked` with invalid-target guidance.
2. Trigger a validation failure via invalid layout payload and confirm the toast
   includes `Schema mismatch` plus detail snippets.

## Data binding QA

The inspector now has a Data tab for selected data-capable BuilderNodes. This
is the Wave 6 foundation for SaaS-aware builder blocks: the user can connect a
container to workspace data without leaving the current `/{tenantSlug}?edit=1`
surface.

Manual checks on `http://localhost:3000/impronta?edit=1`:

1. Select a parent container/freeform data-ready block on the canvas.
2. Open the Data tab.
3. Choose `Roster talent`, `Directory taxonomy`, `Locations`, `Inquiry path`,
   `CMS page`, `Asset library`, or `Custom fields`.
4. Confirm the mode, visible limit, and filter note fields appear only when the
   selected source supports them.
5. Confirm Binding health offers quick fixes for missing mode, missing item
   limit, unknown source, and Free roster limits.

Publish preflight also checks the latest homepage `builderTree` revision for
binding drift. Warning/error findings from the Data tab become publish-drawer
issues before the tree is snapshotted.

Current registry coverage:

- workspace profile
- roster talent
- directory taxonomy
- locations
- inquiry path
- CMS page
- asset library
- custom fields

## Empty-canvas reset

To clear Impronta back to a zero-section homepage for component-by-component
builder QA:

```bash
npm --prefix web run reset:impronta-homepage -- --apply --purge-cleared-sections
```

This preserves the Impronta homepage row and localhost edit entry, but resets
the homepage composition to an empty body canvas. Use this when testing parent
and child builder components one at a time from a clean state.

Recommended loop:

1. Reset Impronta to empty.
2. Open `http://localhost:3000/impronta?edit=1`.
3. Add one real section or parent block.
4. Verify behavior in localhost before adding the next piece.
5. Extend Playwright or unit coverage once that flow stabilizes.

## First-add QA loop

The blank-state builder card now supports a true scratch flow for local QA:

- `Add hero first` inserts the required homepage hero directly from the empty state.
- Once the hero lands, use the navigator/canvas add-section controls for the next body section.
- The empty-state guidance now calls out the recommended rebuild order for parent/child sections:
  - FAQ / accordion
  - tabs
  - carousel
  - masonry
  - CTA

For a deterministic browser regression on the clean tenant, run:

```bash
npm --prefix web run qa:impronta-empty-first-add
```

That command:

1. resets Impronta to zero homepage sections
2. opens the localhost builder smoke
3. creates the first hero section from the blank-state quick action
4. verifies publish drawer access
5. runs the existing Impronta local QA gates

## Section-by-section build QA loop

To validate the Wix-style scratch workflow from a zero-section tenant through
real body content, run:

```bash
npm --prefix web run qa:impronta-section-build
```

That command:

1. resets Impronta to zero homepage sections
2. creates the required hero from the blank-state quick action
3. uses the navigator Add section control to insert FAQ accordion, content
   tabs, scroll carousel, masonry gallery, and CTA banner
4. confirms publish drawer access
5. runs the existing Impronta local QA gates

The navigator Add section button should target the required hero slot only
while hero is missing. Once hero exists, it should open the flexible body slot
so operators can keep building section by section without hitting hero-only
library results.

## Navigator keyboard/density QA

The layered navigator now keeps row height stable and hides dense action chrome
until a row is selected, hovered, or keyboard-focused.

Keyboard checks:

1. Tab into the navigator section list.
2. On a section with child layers, press `ArrowRight` to expand.
3. Press `ArrowLeft` to collapse.
4. Tab forward and confirm only currently visible action controls receive focus
   (hidden action rows should not enter tab order).

Automated smoke coverage:

- `npm --prefix web run test:e2e:impronta-navigator-keyboard`

## Template gallery foundation

The empty-canvas starter now has a wireframe template-gallery modal with search
and category filters. The visible starter tiles open the gallery first, then
the modal applies a starter through the same existing draft-seeding action.
This keeps future made-up and saved templates inside the current builder
foundation instead of creating a parallel template surface.

## Section template selector QA

The Add section drawer now exposes starter kits and starter section templates
with explicit data contracts:

- `data-section-template-data-binding` identifies the canonical builder data
  source for each starter.
- `data-section-template-edit-model` identifies whether the starter is edited
  as section props, live data, navigation, an action route, or asset media.
- Starter cards and review dialogs show the component recipe, so the team can
  distinguish fixed starter content from database-backed blocks.
- The drawer includes a `Data` facet for source-specific filtering such as
  roster talent, tenant directory search, asset library, and inquiry paths.
- Incompatible starter cards stay visible but disabled. They expose
  `data-section-template-compatible="false"` plus an incompatible reason, so
  restricted slots explain the blocker instead of making templates disappear.
- Template compatibility also checks the workspace plan against the starter's
  data source. Studio-only and Agency-only data blocks stay visible on lower
  tiers, but the card explains the required plan before insertion.
- The same starter-template plan gate runs inside the server insertion action.
  The drawer explanation is not the security boundary; `createAndInsertSection`
  rejects lower-tier workspaces that try to force-insert Studio or Agency data
  starters.

Fast check:

```bash
npm --prefix web run test:e2e:impronta-section-starters
```

That test opens `http://localhost:3000/impronta?edit=1`, opens the Add section
drawer, verifies homepage kits, validates the featured roster starter contract,
filters by data source, opens the review dialog, and confirms the data/recipe
metadata is visible before insertion.
