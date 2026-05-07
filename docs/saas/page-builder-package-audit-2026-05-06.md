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
- Added a dedicated builder capability CI gate (`npm run test:builder-capabilities`) so Free/Studio/Agency/Network policy regressions fail the build.
- Updated publish drawer copy to "sections ready" (instead of "sections live") so draft-state language is accurate before publish succeeds.
- Self-serve workspace provisioning now seeds and publishes the Free one-page starter automatically on first signup when the homepage is empty, so new free slugs launch with a live snapshot-owned page instead of legacy fallback-only rendering.
- Custom-domain plan eligibility now reads from the same builder plan policy path in both server actions and settings UI (no separate hardcoded eligible-plan sets).
- Style inspector selected-node controls now include responsive node visibility (Desktop/Tablet/Mobile show/hide) for componentized section child nodes, and the public renderers apply those overrides from the same snapshot payload.
- Section insert/duplicate flows now hydrate BuilderNode child roles immediately from returned section props, so newly added hero/CTA/featured/gallery/testimonials sections expose child-node selection in Navigator/Inspector without waiting for a follow-up edit pass.
- Free starter copy now says "featured roster profiles (up to five on Free)" instead of hard "five live profiles", reducing false promises on empty-roster tenants while preserving the real plan cap.
- Style inspector selected-node controls now include responsive per-node vertical spacing (`margin-top` / `margin-bottom`) for BuilderNode child roles, and public SSR renderers consume the same snapshot payload for `hero`, `cta_banner`, `featured_talent`, `testimonials_trio`, and `gallery_strip`.
- Style inspector selected-node controls now include constrained responsive node padding (`padding-top` / `padding-bottom` / `padding-inline`) and horizontal spacing (`margin-inline`) for text/copy child roles, and public SSR renderers consume the same snapshot payload at desktop/tablet/mobile breakpoints.
- Style inspector selected-node controls now support linked/unlinked horizontal spacing for text/copy child roles (`margin-inline` / `padding-inline` vs explicit left/right values), and public SSR renderers apply those asymmetric overrides from the same published snapshot payload.
- Empty-canvas starter apply now uses an EditProvider refresh bridge (`impronta:starter-applied` -> `refreshComposition`) to keep Navigator/canvas counts aligned without requiring a hard reload in the normal path.
- Publish preflight now escalates empty visible `featured_talent` blocks to a blocking error on Free workspaces, so one-page free launches cannot publish with zero public roster profiles by accident.
- Self-serve Free workspace scaffold now auto-seeds a publish-ready starter roster (up to five profiles) only when the roster is fully empty, then publishes the one-page starter. This keeps first-launch Free workspaces from landing in a zero-profile state while staying idempotent for non-empty rosters.
- BuilderNode registry now includes non-breaking advanced layout foundations (`split`, `accordion`, `tabs`, `carousel`, `masonry`) plus strict child-policy validation and operation support in the same current builder tree pipeline.
- BuilderNode section/container props now support typed data-binding and responsive container overrides in schema validation, so future UI controls can patch these fields without introducing a second storage model.
- Publish preflight now audits generic section link integrity (`href`/`url` paths), blocks unsafe protocols, validates canonical URL quality, and reports missing published locale snapshots for multi-locale homepage coverage.
- Free publish policy now escalates selected warning classes (alt text, link integrity, SEO) to blocking errors to keep free one-page launches quality-safe by default.
- Publish drawer now computes real draft-vs-live section diffs from published snapshot rows and surfaces both aggregate counts and per-section change badges (`Added` / `Moved`) in "What's going live".
- Publish preflight now includes a layout-overflow warning pass for long unbroken text tokens in content props (mobile-risk signal before publish), with focused unit coverage.
- Edit-mode server actions now enforce shell plan rules server-side: Free cannot mutate `site_shell` composition through direct action calls even if a client bypasses UI chrome locks.
- Slot type compatibility now runs through one shared rule module across section insertion surfaces and section move flows: SelectionLayer drag targets, Navigator drag-drop, picker filtering, and `moveSectionTo` all enforce the same allowed-slot behavior before save.
- Publish drawer header now reads real `cms_pages.published_at` for "Last published" (placeholder removed for timestamp; author remains deferred).
- CTA child-node spacing parity is now fixed: horizontal margins and button padding overrides from `nodePresentation` are honored in hero, CTA banner, and featured-talent renderers (desktop + responsive breakpoint CSS paths).
- `trust_strip` now exposes both eyebrow (`subheadline`) and headline as BuilderNode child roles, with node-level presentation overrides on both paths, so trust-strip copy can be styled and selected like other componentized sections.
- Edit chrome now ships a curated `trust_strip` content inspector (instead of generic fallback), with node-selection focus routing for eyebrow/headline and a faster operator flow for variant/tone/density/items editing.
- `trust_strip` item controls now support drag-to-reorder (plus up/down nudge) and duplicate actions directly in the curated inspector, so proof rows can be iterated quickly without destructive remove/re-add loops.
- `cta_banner` now exposes eyebrow as a true BuilderNode child role (`subheadline`) end-to-end: tree derivation, canvas node id binding, Style tab role controls, content-inspector focus routing, and public render nodePresentation overrides (desktop + responsive).
- `featured_talent` now exposes eyebrow as a true BuilderNode child role (`subheadline`) end-to-end: tree derivation, canvas node id binding, Style tab role controls, content-inspector focus routing, and public render nodePresentation overrides (desktop + responsive).
- `category_grid` now exposes eyebrow/headline/copy/footer CTA as true BuilderNode child roles end-to-end: tree derivation, canvas node id binding, Style tab role controls, content-inspector focus routing, and public render nodePresentation overrides (desktop + responsive).
- `contact_form` now exposes eyebrow/headline/intro/submit as true BuilderNode child roles (`subheadline`/`headline`/`copy`/`primaryCta`) end-to-end: tree derivation, canvas node id binding, Style tab role controls, and public render nodePresentation overrides (desktop + responsive).
- `faq_accordion` and `pricing_grid` now expose eyebrow/headline/intro as true BuilderNode child roles (`subheadline`/`headline`/`copy`) end-to-end: tree derivation, canvas node id binding, Style tab role controls, and public render nodePresentation overrides (desktop + responsive).
- `logo_cloud`, `team_grid`, `event_listing`, and `content_tabs` now expose BuilderNode heading roles end-to-end (and intro/copy for `team_grid`): tree derivation, canvas node id binding, Style tab role controls, and public render nodePresentation overrides (desktop + responsive).
- `process_steps` and `destinations_mosaic` now expose eyebrow/headline/copy BuilderNode child roles end-to-end: tree derivation, canvas node id binding, Style tab role controls, and public render nodePresentation overrides (desktop + responsive).
- `stats`, `timeline`, and `values_trio` now expose eyebrow/headline BuilderNode child roles end-to-end, and `comparison_table` now exposes eyebrow/headline/intro (`copy`) roles end-to-end: tree derivation, canvas node id binding, Style tab role controls, and public render nodePresentation overrides (desktop + responsive).
- `hero_split` and `split_screen` now expose eyebrow/headline/copy/primary-CTA/secondary-CTA BuilderNode child roles end-to-end, and `image_copy_alternating` now exposes top-level eyebrow/headline roles end-to-end: tree derivation, canvas node id binding, Style tab role controls, and public render nodePresentation overrides (desktop + responsive).
- `before_after` and `lookbook` now expose top-level eyebrow/headline BuilderNode child roles end-to-end, and `booking_widget` now exposes eyebrow/headline/intro (`copy`) plus button CTA (`primaryCta`) roles end-to-end: tree derivation, canvas node id binding, Style tab role controls, and public render nodePresentation overrides (desktop + responsive).
- Style inspector selected-node controls now expose button-node padding controls too (not just text roles), and include per-viewport override reset (`Reset tablet/mobile`) so editors can revert breakpoint deltas back to desktop inheritance quickly.
- Style inspector preset actions now support precision apply modes (`Type`, `Space`) for both selected node and role group targets (`T+G`, `S+G`), so operators can propagate typography or spacing systems without overwriting unrelated style fields.
- Style inspector preset workflows now include JSON import/export and deterministic preset/action ids (lint-safe, no render-time randomness), enabling reusable style-system handoff across sessions while staying compliant with current React purity lint gates.
- Style inspector preset management now includes `Rename` and `Clone` actions plus consistent viewport-reset action logging, reducing friction when operators iterate multiple near-variant style systems in one session.
- Command palette drawer actions now respect Free shell lock visibility: `Open Theme drawer` is hidden when `canEditSiteShell` is false, keeping shell-lock behavior consistent across Navigator, topbar, and quick-command surfaces.
- Keyboard shortcut overlay now follows the same plan gate and hides the Theme shortcut when shell editing is locked, so command discoverability matches actual capability on Free.
- Shortcut visibility now uses a shared helper (`isShortcutVisible` / `filterVisibleShortcuts`) with unit coverage (`kit/shortcuts.test.ts`) and is included in `npm run test:builder-capabilities`, so Free shell-lock discoverability remains regression-protected.
- Navigator child-node rows now support direct up/down reorder controls backed by BuilderNode operations plus draft save (`saveDraftHomepageAction`), so in-section structure ordering is editable and persisted within the current builder foundation (no separate prototype surface).
- Navigator child-node rows now support direct drag/drop reorder within sibling groups (same parent) using explicit BuilderNode index moves, with persisted draft saves and drop-line feedback in the existing navigator surface.
- Navigator child-node drag/drop now supports valid cross-parent moves within a section's BuilderNode tree (not only same-parent reorder), still persisted through draft saves and guarded by existing BuilderNode child-kind validation.
- Empty-canvas starter plan gating now uses the shared builder capability policy (`getBuilderPlanPolicy`) for Free messaging and template-gallery visibility, reducing direct per-component `planTier === "free"` branching.
- Navigator BuilderNode rows now consume a shared recursive section-child index (`indexBuilderSectionChildNodes`) with depth + semantic labels (role-aware + kind-aware), so current and future nested nodes appear in one tree without hardcoded suffix parsing.
- Homepage draft saves now persist `builderTree` through revision snapshots, draft preview reads restore that tree by current page version, and publish reuses the latest saved tree (with validated fallback/reconcile), so advanced BuilderNode structure survives save/reload/publish instead of collapsing to slot-derived defaults.
- Non-homepage page composition now follows the same BuilderNode persistence path: edit-chrome saves write draft revisions with `builderTree`, non-homepage composition loads restore that tree by current page version, and non-homepage publish resolves from latest draft revision tree (fallbacking safely to slot-derived tree when needed).
- Dashboard page-picker actions now use the shared builder plan policy helpers (`loadBuilderWorkspacePlan` + `cmsAdditionalPageDeniedReason`) for create/duplicate gates, reducing direct `agencies.plan_tier` branching in server actions.
- Publish now fails fast when a stored draft `builderTree` is invalid (both standard-page publish and homepage publish), so malformed BuilderNode payloads are surfaced as actionable errors instead of silently falling back to slot-only snapshots.
- Publish-time BuilderNode validation/error formatting now routes through shared snapshot-tree helpers (`resolveSnapshotBuilderTreeForPublish` + `summarizeBuilderTreeIssues`) so homepage and standard-page publish paths stay behaviorally aligned.

## Errors And Gaps Found

- Package gates are scattered. Free page count, starter access, workspace templates, domains, and roster caps are implemented in different places instead of one package-capability matrix.
- Live-page sync is snapshot-based only. Pages without `published_homepage_snapshot` or `published_page_snapshot` can still fall back to legacy rendering, so "all live pages are builder-owned" is not fully true yet.
- Current builder is section-level, not a 2027 Wix/Shogun builder. It still lacks a nested component tree, true drag/drop inside sections, resize handles for layout nodes, stateful interaction styling, and a template/block marketplace model.

## Recommended Next Execution Chunk

1. Convert package rules into one canonical capability module for Free, Studio, Agency, and Network.
2. Backfill/migrate all tenant pages so public pages are builder snapshot-owned by default.
3. Add onboarding/import flow for Free workspaces to create or attach up to five visible profiles before the one-page template is published.
4. Continue expanding node-level style controls into full box model tokens (left/right padding asymmetry, constrained width + container controls) while keeping typed schema guards.
5. Continue Builder 2.0 foundation: nested section schema, component registry, drag/drop ordering inside sections, and responsive style tokens per component.

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

### Closure stamp (2026-05-06)

Latest local execution on 2026-05-06:

```bash
npm --prefix web run backfill:page-snapshots -- --all-active --apply
npm --prefix web run verify:published-page-snapshots:strict
```

Observed result:
- `candidates: 0`
- `totalMissing: 0`
- `totalMissingBuilderTree: 0`
- `totalInvalidBuilderTree: 0`
- `totalMisalignedBuilderTree: 0`

Interpretation:
- Tenant-wide published pages are currently snapshot-owned and builderTree-valid.
- Phase 3 snapshot closure is complete for current active data.

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
- `web/scripts/verify-published-page-snapshots.ts`

Behavior:

- Tenant-scoped.
- Dry-run by default.
- Supports `--all-active` to run tenant-wide in one command.
- `--apply` performs writes.
- Backfills all published rows missing snapshots:
  - homepage (`published_homepage_snapshot`)
  - standard pages (`published_page_snapshot`)
  - site shell (`published_page_snapshot`)
- Prefers live composition rows; falls back to draft rows when live is empty.
- Syncs live page-section pointers to the same composition used for snapshot.
- For published standard pages that have no page_sections but still have legacy
  body content, auto-converts body content into a `blog_detail` section during
  `--apply` so the page can become snapshot-owned.
- Enriches existing snapshots missing `builderTree` by deriving section nodes
  from legacy slot entries.
- Writes a `platform_audit_log` row per applied page with
  `action=agency.site_admin.snapshot_backfill.<kind>`.

Usage:

```bash
npm --prefix web run backfill:page-snapshots -- --tenant <tenant-uuid>
npm --prefix web run backfill:page-snapshots -- --tenant <tenant-uuid> --locale en --apply
npm --prefix web run backfill:page-snapshots -- --all-active --apply
```

Hard verification gate:

```bash
npm --prefix web run verify:published-page-snapshots -- --tenant <tenant-uuid>
npm --prefix web run verify:published-page-snapshots -- --all-active
npm --prefix web run verify:published-page-snapshots -- --all-active --require-builder-tree
```

## Phase 4 Foundation Status

BuilderNode foundation is now wired in non-breaking mode:

- Snapshot publish paths (homepage, standard pages, site shell) now include an
  optional `builderTree` payload.
- `builderTree` currently mirrors legacy section slots one-to-one using
  `section` nodes (`legacy:<slot>:<sortOrder>:<sectionId>` ids).
- Public storefront rendering is unchanged (still section-slot renderer), but
  the existing section wrappers now expose stable `data-builder-node-id`
  attributes for the current EditShell/Navigator/Inspector foundation.
- Hero sections now expose deterministic child BuilderNode ids (headline,
  subheadline, primary CTA, secondary CTA) from the same live section render,
  and the current Navigator + canvas click path can select those child nodes
  without introducing a second builder surface.
- `cta_banner` and `featured_talent` now expose deterministic child-node ids
  too (headline/copy/CTA roles), aligned with the same live DOM selection
  contract as hero.
- Iframe bridge selection sync now keys on `(sectionId, builderNodeId)`, so
  changing child-node focus inside the same section round-trips correctly
  between desktop chrome and tablet/mobile iframe previews.
- The current Navigator consumes the same BuilderNode identity for every
  section row, keeping canvas selection and layer rows aligned without a
  second builder surface.
- Section-slot mutations now preserve existing section child nodes in
  `builderTree` (move/insert/remove/duplicate no longer drop hero child-node
  identity after reconcile).
- Non-homepage composition load now derives BuilderNode child roles from live
  section props too, so CMS pages (not only homepage snapshots) expose the
  same child-node affordances.
- Hero, cta_banner, and featured_talent curated content inspectors now consume
  selected child-node identity and route focus to matching fields (headline /
  copy / CTA roles), so child selection is not just visual metadata.
- Style tab now reads the active child BuilderNode selection for `hero`,
  `cta_banner`, and `featured_talent`, and can patch node-level presentation
  (`align`, `maxWidthPx`, `size`, `tone`) into each section's live draft so
  Layout/Style intent is no longer section-only for these componentized roles.
- Style tab selected-node controls now support desktop/tablet/mobile targeting
  for node-level presentation overrides, writing responsive breakpoint payloads
  into `nodePresentation.breakpoints`.
- Style tab selected-node controls now also support visibility overrides
  (`visible`/`hidden`) per breakpoint for the same child-node roles.
- Style tab selected-node controls now also support responsive per-node
  vertical spacing (`marginTopPx` / `marginBottomPx`) on those same roles.
- Style tab selected-node controls now support linked/unlinked horizontal
  spacing for those roles (`marginInlinePx` / `paddingInlinePx` or explicit
  `marginLeftPx`/`marginRightPx` and `paddingLeftPx`/`paddingRightPx`).
- BuilderNode drop-policy helpers now provide semantic "can drop?" checks with
  explicit reason codes (`ROOT_KIND_NOT_ALLOWED`, `CHILD_KIND_NOT_ALLOWED`,
  `SLOT_KIND_NOT_ALLOWED`) for future drag/drop guards on nested canvases.
- Public renderers for those three section types now consume
  `nodePresentation` and apply the overrides directly in the same section DOM
  contract (no duplicate route or experimental renderer).
- `testimonials_trio` and `gallery_strip` now participate in BuilderNode
  child-role derivation for eyebrow/headline/caption paths, including canvas
  ids + inspector focus hooks for those child roles.
- `category_grid` now participates in BuilderNode child-role derivation for
  eyebrow/headline/copy/footer-CTA paths, including canvas ids + inspector
  focus hooks for those child roles.
- `contact_form` now participates in BuilderNode child-role derivation for
  eyebrow/headline/intro/submit paths, including canvas ids for style-node
  selection and snapshot-owned render bindings.
- `faq_accordion` and `pricing_grid` now participate in BuilderNode
  child-role derivation for eyebrow/headline/intro paths, including canvas
  ids for style-node selection and snapshot-owned render bindings.
- `logo_cloud`, `team_grid`, `event_listing`, and `content_tabs` now
  participate in BuilderNode child-role derivation for eyebrow/headline
  (plus intro on `team_grid`) paths, including canvas ids for style-node
  selection and snapshot-owned render bindings.
- `process_steps` and `destinations_mosaic` now participate in BuilderNode
  child-role derivation for eyebrow/headline/copy paths, including canvas ids
  for style-node selection and snapshot-owned render bindings.
- `stats`, `timeline`, and `values_trio` now participate in BuilderNode
  child-role derivation for eyebrow/headline paths, and `comparison_table`
  participates for eyebrow/headline/copy paths, including canvas ids for
  style-node selection and snapshot-owned render bindings.
- `hero_split` and `split_screen` now participate in BuilderNode child-role
  derivation for eyebrow/headline/copy/CTA paths, and
  `image_copy_alternating` participates for top-level eyebrow/headline paths,
  including canvas ids for style-node selection and snapshot-owned render
  bindings.
- `before_after` and `lookbook` now participate in BuilderNode child-role
  derivation for top-level eyebrow/headline paths, and `booking_widget`
  participates for eyebrow/headline/copy plus button-CTA paths, including
  canvas ids for style-node selection and snapshot-owned render bindings.
- `magazine_layout`, `masonry`, `sticky_scroll`, and `scroll_carousel` now
  participate in BuilderNode child-role derivation for top-level
  eyebrow/headline paths, and `map_overlay` participates for
  eyebrow/headline/body-copy while `press_strip` participates for eyebrow;
  all now include canvas ids for style-node selection and snapshot-owned
  render bindings.
- `lottie`, `video_reel`, and `image_orbit` now participate in BuilderNode
  child-role derivation too (`lottie` with eyebrow/headline/caption-copy;
  `video_reel` + `image_orbit` with eyebrow/headline), with the same live
  canvas node ids, style-node role controls, and snapshot-owned render
  bindings.
- `code_embed`, `blog_index`, `donation_form`, and `code_snippet` now
  participate in BuilderNode child-role derivation too (`code_embed` with
  eyebrow/headline/caption-copy; `blog_index` + `code_snippet` with
  eyebrow/headline; `donation_form` with eyebrow/headline/intro-copy and
  submit-CTA), with the same live canvas node ids, style-node role controls,
  and snapshot-owned render bindings.
- `blog_detail`, `site_header`, and `site_footer` now participate in
  BuilderNode child-role derivation too (`blog_detail` with
  category/title/byline roles, `site_header` with brand-label + primary-CTA,
  `site_footer` with brand-label + tagline), and `anchor_nav` + `marquee`
  are now explicitly handled as section-only nodes (no child-role map) so
  parity coverage has no silent section-type gaps.
- Public renderers for `hero`, `cta_banner`, `featured_talent`,
  `testimonials_trio`, and `gallery_strip` now emit scoped responsive CSS for
  node-level breakpoint overrides (tablet/mobile) without introducing a second
  renderer path.
- Curated content inspectors now resolve selected child-node roles through a
  shared BuilderNode role resolver instead of per-inspector suffix parsing,
  reducing role drift across sections.
- A dedicated BuilderNode role-binding gate now runs in CI
  (`npm run test:builder-node-bindings`) and fails when a section derives
  child-node roles that are not wired in the live renderer bindings.
- A validated BuilderNode operations toolkit now exists for insert/move/remove
  and props patch mutations (`operations.ts`), with focused tests wired into
  the same builder-node CI gate so future nested-canvas work can build on a
  shared mutation core.
- BuilderNode history now tracks pure tree edits too, so child-node reorder
  and advanced-node layout prop changes participate in the same undo/redo
  timeline instead of bypassing it as save-only mutations.
- The live Structure Navigator now supports typed child-node authoring on the
  current builder surface: section-level add menus, nested node add/remove
  controls, and cross-parent drag hover logic all save through the same
  `builderTree` draft pipeline.
- The shared Layout inspector now exposes selected-node controls for
  `container`, `split`, `accordion`, `tabs`, `carousel`, `masonry`, and
  `spacer` on the live `?edit=1` surface, saving through the existing
  `builderTree` draft path instead of a separate builder mode.
- Homepage + site-shell renderers now share a single role-binding resolver,
  reducing drift risk between public surfaces.
- Publish preflight now blocks on invalid section payloads (including malformed
  `nodePresentation`) before secondary checks run.
- Empty-canvas starter apply now round-trips through an EditProvider bridge
  event (`impronta:starter-applied`) so composition state and storefront SSR
  refresh together without forcing a full-page reload in normal flow.
- There is no separate BuilderNode prototype route. Phase 4 work stays inside
  the current page builder and snapshot pipeline.

This keeps current production behavior stable while enabling the next step:
current-builder controls that can progressively consume typed component nodes.

## Latest Verification (2026-05-06)

- `npm --prefix web run verify:published-page-snapshots -- --all-active --require-builder-tree`
  - `tenantCount=8`, `scannedPublishedRows=14`
  - `totalMissing=0`, `totalMissingBuilderTree=0`, `totalInvalidBuilderTree=0`
- `npm --prefix web run verify:published-page-snapshots:strict`
  - `tenantCount=8`, `scannedPublishedRows=14`
  - `totalMissing=0`, `totalMissingBuilderTree=0`, `totalInvalidBuilderTree=0`
- `npm --prefix web run backfill:page-snapshots -- --all-active`
  - dry-run found `candidates=0` across active tenants
- `npm --prefix web run test:publish-preflight`
  - includes link integrity, layout-overflow risk, and publish-diff unit checks
- `npm --prefix web run qa:impronta-local`
  - auth routing, builder capabilities, builder-node bindings, publish
    preflight, and strict published-snapshot coverage all green after the
    navigator add/remove pass
- `TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... PLAYWRIGHT_USE_DEV_SIGNIN=1 npm --prefix web run test:e2e:impronta-local`
  - localhost Impronta smoke now verifies slugged admin entry, builder launch,
    edit chrome visibility, and navigator add-menu visibility
- `TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... npm --prefix web run test:e2e:impronta-empty-first-add`
  - resets cleanly to the blank-state Impronta tenant, inserts the first hero
    from the empty-canvas quick action, and confirms publish-drawer reachability
- `TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... npm --prefix web run test:e2e:impronta-section-build`
  - resets cleanly to the blank-state Impronta tenant, inserts the first hero,
    then uses the live navigator Add section flow for FAQ accordion, content
    tabs, scroll carousel, masonry gallery, and CTA banner before checking the
    publish drawer
- `npm run verify:impronta:tenant`
  - one-command local tenant gate (tenant isolation, builder ownership,
    strict snapshot coverage, builder capabilities, node presentation, and
    server-action guardrails)
- `npm run verify:impronta:live`
  - live Impronta domain sweep on current routing rules
  - `www.improntamodels.com` now passes TLS + canonical redirect to
    `https://improntamodels.com/`
