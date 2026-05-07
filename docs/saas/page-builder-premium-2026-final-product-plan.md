# Page Builder Premium 2026 Final Product Plan

Date: 2026-05-07

## Purpose

This document merges the current Impronta/Tulala builder work, pending gaps,
and the product bar for a best-in-class 2026 visual page builder.

The target is not "another admin section editor." The target is a premium
front-end visual builder that can compete with Wix Studio, Webflow, Framer,
Builder.io, Shopify theme sections/blocks, and Shogun-style commerce builders,
while staying native to this app's multi-tenant SaaS model.

Important constraint:

- Do not create a separate builder route or parallel prototype.
- Continue inside the current storefront edit surface: `/{tenantSlug}?edit=1`.
- Impronta is the canonical local QA tenant.
- Snapshot publishing and `builderTree` remain the source of truth.

## Reference Bar

Current best-in-class expectations from official product/docs sources:

- Wix Studio: pixel-level editing, responsive AI, breakpoint controls, CMS,
  animations, custom CSS, and collaboration.
  - https://support.wix.com/en/article/wix-studio-about-the-studio-editor
  - https://support.wix.com/en/article/studio-editor-building-a-responsive-site
- Webflow: reusable components, component properties/slots, variants, and
  central design variables.
  - https://help.webflow.com/hc/en-us/articles/33961303934611-Components-overview
  - https://help.webflow.com/hc/en-us/articles/33961268146323-Variables
- Builder.io: visual editor with Insert, Layers, Style, Data, Options,
  custom components, symbols, data binding, targeting, scheduling, templates,
  and AI-assisted generation.
  - https://www.builder.io/c/docs/visual-editor
  - https://site.builder.io/c/docs/custom-components-visual-editor
  - https://site.builder.io/c/docs/component-api-reference
- Shopify theme editor: merchant-safe sections and blocks, nested theme
  blocks, app blocks, static locked blocks, section groups, and schema-driven
  constraints.
  - https://shopify.dev/docs/storefronts/themes/architecture/blocks
  - https://shopify.dev/docs/storefronts/themes/architecture/blocks/app-blocks
  - https://shopify.dev/docs/storefronts/themes/best-practices/templates-sections-blocks
- Framer: fast visual site building with breakpoint/localization expectations.
  - https://www.framer.com/help/localization/
  - https://www.framer.com/help/articles/setting-text-styles-breakpoints/

The winning product should combine:

1. Wix-like ease and responsive AI.
2. Webflow-like design-system depth.
3. Builder.io-like content/data/component extensibility.
4. Shopify-like safety for non-technical operators.
5. Framer-like speed, polish, and localization workflow.

## Current State Audit

### Strong foundation already present

The current builder has moved beyond a basic prototype:

- Storefront edit surface works on `/{tenantSlug}?edit=1`.
- Impronta local QA is documented and scriptable.
- Free/Studio/Agency/Network policy work has a shared capability path.
- Free product constraints are partly implemented:
  - one public page
  - one starter
  - up to five roster profiles
  - body editable
  - shell locked on Free
- Published pages are snapshot-owned and verified tenant-wide.
- `builderTree` exists and is persisted through drafts/publish paths.
- Existing sections expose BuilderNode identity.
- Many section types expose role-bound child nodes for selection/style.
- Advanced node kinds exist in the registry:
  - container
  - split
  - accordion
  - tabs
  - carousel
  - masonry
  - spacer
  - heading
  - paragraph
  - button
  - image
- BuilderNode operations exist and are tested:
  - insert
  - move
  - remove
  - patch props
  - drop policy
  - validation
- Navigator supports section rows and child-node rows.
- Navigator supports some child-node add/remove/reorder flows.
- Layout inspector has initial selected-node controls.
- Style inspector has responsive node-level presentation controls.
- Public renderers consume selected nodePresentation for important sections.
- Publish preflight exists for invalid payloads, link rules, layout overflow,
  featured roster quality, and snapshot validity.
- Empty-canvas starter supports:
  - true scratch start
  - first hero quick-add
  - wireframe template-gallery foundation
  - Impronta section-by-section QA

### Recent Impronta QA gates

Current important local commands:

```bash
npm --prefix web run qa:impronta-local
npm --prefix web run qa:impronta-empty-first-add
npm --prefix web run qa:impronta-section-build
```

`qa:impronta-section-build` now proves:

1. reset Impronta homepage to zero sections
2. add first required hero
3. add FAQ accordion
4. add content tabs
5. add scroll carousel
6. add masonry gallery
7. add CTA banner
8. open publish drawer
9. run Impronta local gates

### Main product gap

The product is still mostly a section builder with emerging component-node
controls. It is not yet a complete premium visual builder because the user
cannot freely compose, style, resize, bind, template, and govern every part of
the page at the depth expected from a top-tier 2026 builder.

## Gap Inventory

### A. Builder engine gaps

1. BuilderNode is present, but section renderers still remain the dominant
   rendering model.
2. Advanced nodes exist in schema and navigator, but not every advanced node
   has a rich live canvas rendering/editing experience.
3. Drag/drop exists in pieces, but not yet as a full canvas-first drag/drop
   system with insertion markers, drop zones, and layout intent.
4. Tree operations do not yet feel like a complete Layers panel.
5. Undo/redo exists, but needs full confidence across every tree/style/content
   mutation.
6. Section slots and node children need one consistent mental model.
7. Node validation is strong, but operator-facing errors need better copy and
   repair actions.
8. No robust clipboard for copy/paste node, paste style, duplicate across pages.
9. No saved block/symbol system for reusable components inside or across pages.
10. No app/plugin block contract like Shopify app blocks or Builder custom
    components.

### B. Canvas UX gaps

1. Canvas selection is improving, but needs a professional overlay model:
   handles, labels, breadcrumbs, locked-state indicators, parent hover, and
   child hit targets.
2. No true resize handles for width, height, columns, media crop, or container
   constraints.
3. No visual gap/padding handles on canvas.
4. No right-click/context menu for common actions.
5. No keyboard-driven power-user workflow for node selection and movement.
6. Mobile/tablet iframe previews need editing parity, not just preview parity.
7. No mini-map or page outline for long pages.
8. No visual empty/drop zones inside containers, tabs, accordion items,
   carousel slides, or masonry groups.
9. Hover/selection performance needs strict budgets for pages with many nodes.
10. Canvas lacks professional "locked shell" affordances for Free vs paid
    plans.

### C. Layout and responsive gaps

1. Responsive overrides exist, but need a unified cascade model:
   desktop -> tablet -> mobile, with visible inheritance.
2. No responsive AI or auto-layout repair.
3. Container width, min/max width, intrinsic sizing, grid columns, stack
   behavior, alignment, and order need first-class controls.
4. No section-level and node-level layout presets that can be applied safely.
5. No full box-model panel with linked/unlinked top/right/bottom/left controls.
6. No responsive "hide on breakpoint" review panel.
7. No layout warning overlay for overflow/clipping before publish.
8. No visual grid/snapping/guides.
9. No component-level breakpoint caveats and validations.
10. No accessibility-aware responsive structure suggestions.

### D. Style and design-system gaps

1. Design tokens exist, but the builder needs a visible token manager.
2. Style inspector controls are growing, but not yet a full style system:
   typography, color, effects, borders, radius, shadow, motion, state styles.
3. No style classes or reusable style recipes equivalent to Webflow classes.
4. No local vs global style distinction with clear inheritance.
5. No component variants with locked structure and editable props.
6. No hover/focus/active/disabled state editing.
7. No theme audit for contrast, consistency, token drift, and one-off values.
8. No Figma-like style library import/export beyond starter JSON paths.
9. No design preset marketplace.
10. No brand-kit wizard that turns logo/colors/fonts into a usable site system.

### E. Content and CMS gaps

1. Data binding exists conceptually, but not as a polished Data tab.
2. Directory/profile/inquiry data is not exposed as operator-friendly bindings.
3. No repeaters/collections UI for bound lists.
4. No dynamic page templates for data models.
5. No safe "bind this card to roster/profile/category/inquiry" flow.
6. No content validation per field with inline fix actions.
7. No localization workflow inside builder beyond current locale switching.
8. No field-level AI rewrite/translate/reformat controls as a unified system.
9. No structured content history per node.
10. No media alt/caption generation workflow in the canvas.

### F. Template, block, and marketplace gaps

1. Wireframe gallery foundation exists, but templates are not full products.
2. Need starter templates by industry, plan, entity type, and goal.
3. Need section templates and block templates separate from full-page templates.
4. Need saved workspace templates with preview thumbnails.
5. Need reusable symbols/blocks with global update and per-instance overrides.
6. Need locked template areas for Free plan and system-owned shell.
7. Need template compatibility rules by plan and data availability.
8. Need template apply/replace/merge modes.
9. Need template rollback and preview-before-apply.
10. Need a quality checklist for platform-promoted templates.

### G. Collaboration and workflow gaps

1. No comments anchored to nodes in the page builder.
2. No shareable edit preview with role-safe access.
3. No approval workflow for Agency/Network teams.
4. No scheduled publish UI fully integrated with diffs and preflight.
5. No page version comparison UI beyond current revision primitives.
6. No role permissions for who can edit design, content, publish, or domain.
7. No activity timeline tied to specific nodes.
8. No draft branches/experiments.
9. No A/B variants.
10. No cross-workspace template governance for Network.

### H. Performance, safety, and QA gaps

1. Full lint is blocked by unrelated legacy/prototype errors.
2. Local dev can become slow under repeated builder tests.
3. Need focused perf budgets for editor boot, first interaction, section insert,
   style patch, publish preflight, and publish.
4. Need visual regression screenshots for desktop/tablet/mobile.
5. Need E2E coverage for templates, advanced nodes, style overrides, publish,
   reload, and public render.
6. Need automated invalid-tree repair suggestions.
7. Need tenant isolation gates for all new server actions.
8. Need snapshot ownership gate in CI for active tenants.
9. Need production smoke parity for `impronta.tulala.digital` and
   `improntamodels.com`.
10. Need disaster rollback plan for broken publish snapshots.

## Final Product Definition

The final product is ready when a workspace owner can:

1. Start from an empty page or template.
2. Add sections, containers, tabs, accordions, carousels, masonry grids,
   forms, roster lists, media blocks, buttons, and custom data-bound blocks.
3. Drag/drop any allowed node into any valid parent.
4. Resize and style nodes on canvas.
5. Edit content inline or in inspector.
6. Bind nodes to roster, directory, profile, category, inquiry, or custom data.
7. Switch desktop/tablet/mobile and override layout safely per breakpoint.
8. Save blocks and templates.
9. Collaborate, comment, preview, approve, schedule, and publish.
10. Pass accessibility, SEO, layout, data, localization, and plan-policy
    preflight before public release.

Plan tiers should feel intentional:

- Free: simple one-page builder, one template, five profiles, body only.
- Studio: branded subdomain, richer templates, multi-page basics, more style.
- Agency: custom domain, full shell, reusable blocks, advanced builder.
- Network: shared templates, locked systems, team permissions, analytics,
  cross-workspace governance.

## Phase Roadmap

### Phase 0 - Stabilize Current Foundation

Goal:

Make the existing builder reliable enough to accelerate.

Tasks:

- Keep Impronta dev server path healthy after repeated E2E runs.
- Add focused lint scripts for builder files only.
- Record current repo-wide lint blockers as legacy debt.
- Add a builder-only CI command:

```bash
npm --prefix web run typecheck
npm --prefix web run test:builder-capabilities
npm --prefix web run test:builder-node-bindings
npm --prefix web run test:publish-preflight
npm --prefix web run qa:impronta-section-build
```

Exit gate:

- Builder-focused gate passes even while legacy repo lint remains noisy.

### Phase 1 - Canvas Selection System

Goal:

Make the front-end canvas feel like a professional visual editor.

Tasks:

- Build unified selection overlay for section and child nodes.
- Add parent breadcrumb: Page > Section > Container > Node.
- Add locked-plan badges for shell/header/footer and Free restrictions.
- Add context menu:
  - edit content
  - duplicate
  - hide
  - copy
  - paste style
  - move up/down
  - delete
- Add keyboard movement:
  - arrow select sibling
  - enter child
  - escape parent
  - delete remove
  - command-d duplicate
- Add overlay hit testing for nested nodes.
- Add test IDs and E2E coverage on Impronta.

Exit gate:

- User can select and operate on section and child nodes without opening the
  Navigator first.

### Phase 2 - Full Layers/Navigator 2.0

Goal:

Turn Navigator into a serious Layers panel.

Tasks:

- Show full recursive tree with icons and node names.
- Support rename, duplicate, hide, lock, delete.
- Support drag/drop:
  - section reorder
  - same-parent child reorder
  - cross-parent valid move
  - insert before/after/inside
- Add invalid-drop feedback using `drop-policy.ts`.
- Add search/filter that keeps hierarchy context.
- Add collapse/expand persistence.
- Add page shell groups:
  - Header
  - Page
  - Footer
- Add plan-locked nodes with tooltip explaining upgrade path.

Exit gate:

- Layers panel can build and reorganize nested structures with no manual data
  editing.

### Phase 3 - Node Renderer Bridge

Goal:

Move from section-only rendering toward real node rendering without breaking
public pages.

Tasks:

- Create renderer bridge for advanced nodes:
  - container
  - split
  - accordion
  - tabs
  - carousel
  - masonry
  - spacer
  - heading
  - paragraph
  - button
  - image
- Render these nodes inside existing section wrappers first.
- Preserve legacy section props as compatibility input.
- Add node render tests for each kind.
- Ensure public SSR and edit SSR produce same node identities.
- Add invalid-tree fallback only for draft, not publish.

Exit gate:

- A page can contain real nested BuilderNode content and publish it safely.

### Phase 4 - Box Model and Responsive Layout Controls

Goal:

Give the user real layout control: padding, margin, width, grid, stack,
alignment, order, responsive visibility.

Tasks:

- Build a full Box panel:
  - margin top/right/bottom/left
  - padding top/right/bottom/left
  - linked/unlinked controls
  - min/max width
  - width mode: auto, fill, fixed, fit, percentage
  - height/min height
  - overflow behavior
- Add responsive cascade inspector:
  - desktop base
  - tablet override
  - mobile override
  - inherited vs overridden indicators
  - reset breakpoint
- Add layout presets:
  - centered column
  - split 50/50
  - media left/right
  - card grid
  - carousel row
  - masonry gallery
- Add visual overflow warnings.

Exit gate:

- User can make a section responsive across desktop/tablet/mobile without code.

### Phase 5 - On-Canvas Drag/Drop and Resize

Goal:

Make editing feel direct, not form-only.

Tasks:

- Add insertion markers between nodes.
- Add empty drop zones inside containers, tabs, accordions, carousel slides,
  and masonry groups.
- Add drag ghost and valid/invalid target feedback.
- Add resize handles for:
  - image width/height
  - split columns
  - container max width
  - spacer height
  - card grid columns
- Add snapping guides.
- Add undo/redo integration for every drag/resize.

Exit gate:

- User can visually compose a page from scratch with mouse/touch operations.

### Phase 6 - Content/Data Binding System

Goal:

Make the builder a SaaS product builder, not only a static page editor.

Tasks:

- Add Data tab in inspector.
- Create binding registry:
  - workspace profile
  - roster/talent
  - taxonomy category
  - location
  - inquiry/contact path
  - CMS page
  - asset
  - custom field
- Add repeater/list nodes.
- Add data source selector:
  - manual
  - latest
  - featured
  - filtered
  - selected items
- Add empty/loading/error states for bound nodes.
- Add publish preflight for broken bindings.
- Add Free-specific roster binding guard: max five public profiles.

Exit gate:

- Featured roster, directory-like lists, and dynamic content blocks can be
  configured visually and publish safely.

### Phase 7 - Template and Block Marketplace Foundation

Goal:

Turn the current wireframe template gallery into a real template system.

Tasks:

- Create typed template manifest:
  - full-page template
  - section template
  - block template
  - symbol/reusable block
  - system template
- Add template metadata:
  - industry
  - plan availability
  - required data
  - section count
  - preview thumbnail
  - locale support
  - responsiveness certification
  - accessibility certification
- Add preview-before-apply modal.
- Add apply modes:
  - replace page
  - append sections
  - insert section/block
  - merge missing content
- Add rollback after apply.
- Add save current selection as block.
- Add save current page as template.
- Add platform-promoted templates.

Exit gate:

- User can search, preview, apply, save, and reuse templates without breaking
  existing draft data.

### Phase 8 - Components, Symbols, Variants

Goal:

Build Webflow/Builder-style reusable components.

Tasks:

- Add symbol model:
  - global symbol definition
  - instance overrides
  - locked structure
  - editable props
  - detached instance
- Add variants:
  - layout variants
  - style variants
  - content density variants
  - plan-specific variants
- Add slot support:
  - allowed child kinds
  - required static child blocks
  - optional dynamic children
- Add update-all-instances workflow.
- Add conflict handling when a symbol definition changes.

Exit gate:

- Header/footer/cards/CTA blocks can be reused with controlled overrides.

### Phase 9 - Design System and Brand Kit

Goal:

Make the builder create beautiful sites consistently.

Tasks:

- Build visible token manager:
  - colors
  - typography
  - spacing scale
  - radius
  - shadows
  - motion
  - density
- Add style classes/recipes:
  - section recipes
  - text recipes
  - button recipes
  - card recipes
- Add brand-kit wizard:
  - logo upload
  - color extraction
  - font pairing
  - one-click theme application
- Add design audit:
  - contrast
  - one-off values
  - inconsistent spacing
  - missing tokens
  - too many fonts/sizes
- Add JSON import/export for design systems.

Exit gate:

- A workspace can define a brand system once and apply it across pages,
  templates, and symbols.

### Phase 10 - AI Builder Assistance

Goal:

Use AI where it accelerates operators without making the system opaque.

Tasks:

- Add AI commands:
  - make responsive
  - improve hierarchy
  - rewrite copy
  - shorten/expand
  - translate
  - generate alt text
  - suggest section
  - build page from brief
  - generate template variant
- Add AI patch preview:
  - before/after diff
  - accept/reject per change
  - undo integration
- Add responsive AI for selected section:
  - infer groups
  - propose stack/grid
  - show breakpoint diff
- Add guardrails:
  - no destructive publish
  - no cross-tenant data leakage
  - no unsupported section kinds
  - plan-aware suggestions

Exit gate:

- AI can safely propose builderTree/style/content patches and users can review
  them before applying.

### Phase 11 - Collaboration, Workflow, Publish

Goal:

Make Agency/Network teams comfortable using this on real client sites.

Tasks:

- Node-anchored comments.
- Mention teammates.
- Review states:
  - draft
  - ready for review
  - approved
  - scheduled
  - published
- Role permissions:
  - content editor
  - designer
  - publisher
  - owner
- Shareable preview links.
- Publish diff by node and section.
- Scheduled publish.
- Rollback to previous snapshot.
- Activity log.
- Optional A/B variants.

Exit gate:

- A team can review and publish a client page without sharing admin passwords
  or bypassing preflight.

### Phase 12 - App Blocks and Integrations

Goal:

Allow extensibility without letting custom code break tenant safety.

Tasks:

- Define app block contract:
  - schema
  - settings
  - allowed surfaces
  - safe render sandbox
  - data inputs
  - plan gates
- Support first-party app blocks:
  - inquiry form
  - booking CTA
  - roster search
  - Google map/location
  - testimonial/review feed
  - newsletter form
- Support app-block wrapper sections.
- Add integration permissions.
- Add CSP and security checks.

Exit gate:

- Integrations can appear as configurable blocks in the builder without custom
  theme code or unsafe tenant leakage.

## Execution Order

### Marathon 1 - Current Builder Becomes Professionally Usable

Recommended next implementation batch:

1. Phase 0 - stabilize focused builder gate.
2. Phase 1 - canvas selection overlay.
3. Phase 2 - Layers/Navigator 2.0.
4. Phase 4 partial - full box model for existing selected nodes.

Why:

- The engine foundation exists.
- The user pain is front-end editability and Wix-like feel.
- Canvas/layers/box controls make the product visibly better fastest.

### Marathon 2 - Real Nested Composition

1. Phase 3 - node renderer bridge.
2. Phase 5 - drag/drop and resize.
3. Add E2E for building a page from scratch with real nested nodes.

### Marathon 3 - Data and Templates

1. Phase 6 - Data tab and bindings.
2. Phase 7 - template/block marketplace.
3. Free/Studio/Agency template plan gates.

### Marathon 4 - Premium System

1. Phase 8 - components/symbols/variants.
2. Phase 9 - design system and brand kit.
3. Phase 10 - AI patch assistant.

### Marathon 5 - Agency/Network Maturity

1. Phase 11 - collaboration and workflow.
2. Phase 12 - app blocks/integrations.
3. Live QA on Impronta domains and Vercel deployment ladder.

## Non-Negotiable Product Principles

1. Current builder only. No parallel route.
2. Snapshot-published truth. Public pages never render unsafely from draft.
3. Tenant isolation first.
4. Plan policy centralization.
5. Every new node kind gets:
   - schema
   - registry entry
   - renderer
   - inspector controls
   - validation
   - tests
6. Every new visual mutation gets:
   - undo/redo
   - draft persistence
   - publish persistence
   - public SSR parity
7. Every premium feature must degrade clearly for Free.
8. Impronta local QA before live QA.
9. No hard-coded one-off prototype UI that cannot become product.
10. Performance budget is a feature.

## Verification Matrix

### Unit/test gates

```bash
npm --prefix web run typecheck
npm --prefix web run test:builder-capabilities
npm --prefix web run test:builder-node-bindings
npm --prefix web run test:publish-preflight
npm --prefix web run verify:published-page-snapshots:strict
```

### Impronta browser gates

```bash
npm --prefix web run qa:impronta-local
npm --prefix web run qa:impronta-empty-first-add
npm --prefix web run qa:impronta-section-build
```

Future gates to add:

```bash
npm --prefix web run qa:impronta-node-drag
npm --prefix web run qa:impronta-box-model
npm --prefix web run qa:impronta-template-gallery
npm --prefix web run qa:impronta-data-binding
npm --prefix web run qa:impronta-responsive
npm --prefix web run qa:impronta-publish-rollback
```

### Manual QA loop

Use:

- `http://localhost:3000/impronta?edit=1`
- `http://localhost:3000/impronta/admin/site`

Manual checklist:

1. Reset Impronta homepage.
2. Add hero.
3. Add body section.
4. Add advanced node inside body section.
5. Drag/reorder.
6. Style desktop.
7. Override tablet.
8. Override mobile.
9. Save draft.
10. Reload.
11. Confirm tree/style survived.
12. Publish.
13. Confirm public page.
14. Confirm snapshot verifier.

## Recommended Immediate Next Ticket

Start with Phase 1 plus the safest piece of Phase 2:

Title:

`feat(edit-chrome): professional canvas selection and layers foundation`

Scope:

- Unified selection overlay for section and child nodes.
- Breadcrumb for selected node ancestry.
- Context menu for duplicate/hide/delete/move/edit.
- Layers panel recursive tree polish.
- E2E on Impronta selecting hero child node and applying one style/content
  mutation.

Do not start by building more templates. Templates matter, but the builder must
first support direct, flexible node editing so every future template is useful
after it is applied.

## Definition Of Done For "Better Than Wix" Claim

The claim is credible only when all of these are true:

1. Empty page to publishable page in under 10 minutes.
2. Non-technical owner can edit content and basic layout without breaking
   responsive design.
3. Designer can reach advanced spacing, typography, responsive, and state
   controls without code.
4. Agency can save and reuse blocks/templates across clients.
5. Network can lock brand/system areas while allowing local overrides.
6. AI can generate and repair layouts with reviewable patches.
7. Public pages stay fast, accessible, SEO-safe, and snapshot-owned.
8. Impronta passes local and live smoke on every publish path.
9. Free plan is simple and useful, not a broken demo.
10. Agency plan feels like a real professional website operating system.

