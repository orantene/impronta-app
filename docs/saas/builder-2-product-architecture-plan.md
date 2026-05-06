# Builder 2.0 Product + Architecture Plan

Date: 2026-05-06

## North Star

Tulala should not build a generic Wix clone. The product should become a
roster-business site builder: flexible like a modern visual builder, but safer
because it is structured, data-aware, package-aware, and connected to the
actual workspace objects that make a talent business run.

The goal is structured freedom:

- Users can edit, reorder, swap, and style the parts that matter.
- The system prevents broken pages, empty promises, dead inquiry paths, and
  off-brand layouts.
- Templates are not static mockups; they are live compositions connected to
  roster profiles, inquiry forms, services, trust signals, and package limits.

## Product Principles

1. **Real data first**
   Profile cards, services, packages, locations, testimonials, trust badges,
   and inquiry CTAs should bind to workspace data where possible. A user should
   not need to edit the same profile card in five places.

2. **Body-first editing**
   Most users think in page body sections: hero, services, roster, packages,
   gallery, testimonials, CTA. Header, footer, directory style, and profile
   families should be progressively unlocked by plan.

3. **Guarded flexibility**
   Every control should have a bounded model: sliders, tokens, variants,
   component props, and responsive overrides. Avoid arbitrary HTML/CSS as the
   primary storage model.

4. **Mobile is not an afterthought**
   A premium builder in 2026 needs explicit mobile/tablet controls, but not a
   separate mobile site. Responsive overrides should live on the same component
   tree.

5. **Publish confidence**
   Publishing should run preflight checks for empty data, broken links, missing
   inquiry path, bad SEO, missing alt text, plan violations, and mobile layout
   risks.

6. **AI edits structured data**
   AI should modify the same component tree and schema the UI uses. It should
   never produce unreviewable random HTML as the default output.

## 2026 Ambition: Everything Feels Possible

The builder should eventually feel like the user can build any modern roster
site without leaving Tulala:

- Accordion FAQs.
- Tabs.
- Sliders/carousels.
- Masonry galleries.
- Split sections.
- Full-width editorial bands.
- Sticky CTAs.
- Mobile-only sections.
- Desktop-only hero treatments.
- Profile cards fed by real roster data.
- Inquiry forms connected to the booking/work pipeline.
- Trust badges connected to real reliability and payment state.
- Embeds and app blocks where safe.
- Precise padding, margin, gap, width, alignment, and background controls.

But "everything is possible" should not mean "anything can break." The product
should expose deep controls through typed models, presets, constraints, and
preflight checks.

The best version is closer to:

```txt
Webflow-like layout control
+ Shogun-like commerce/content blocks
+ Canva-like fast presets
+ Notion-like structured editing
+ Tulala's real roster/inquiry/business data
```

## Universal Node Controls

Every editable node should eventually share a common control contract. A node
can be a section, container, component, or app block.

### Box Model

Controls:

- Padding: top/right/bottom/left, linked/unlinked.
- Margin: top/right/bottom/left, linked/unlinked.
- Gap: row/column.
- Width: auto, full, fixed, max-width presets, custom constrained values.
- Height/min-height: auto, viewport presets, fixed constrained values.
- Aspect ratio for media and cards.
- Container mode: contained, wide, full-bleed.

Rules:

- Use sliders, steppers, and presets.
- Store values as tokens or constrained numeric values.
- Prevent impossible values that cause text overflow or broken mobile layouts.

### Layout

Controls:

- Display: stack, row, grid, carousel, masonry where valid.
- Alignment: start, center, end, stretch.
- Justification: start, center, end, between.
- Columns: 1-6 where the component supports it.
- Order by breakpoint.
- Wrap behavior.
- Sticky behavior where safe.

### Visual Style

Controls:

- Background: transparent, solid, image, gradient preset, video where allowed.
- Text color.
- Border.
- Radius.
- Shadow.
- Overlay.
- Opacity.
- Blend/tint presets for media.

### Typography

Controls:

- Text preset: hero, heading, subheading, body, caption, label.
- Weight.
- Alignment.
- Line-height preset.
- Max text width.
- Case transform where safe.

Avoid raw viewport-scaled fonts as the default. Use responsive typography
presets with explicit mobile/tablet/desktop values.

### States

Interactive components should support:

- Default.
- Hover.
- Focus.
- Active.
- Disabled.

Initial UI can hide state editing until Agency+, but the data model should
support it early.

### Visibility

Controls:

- Show/hide on desktop.
- Show/hide on tablet.
- Show/hide on mobile.
- Show based on data availability.
- Show based on plan where platform-owned templates need it.

## Layout Engine

Builder 2.0 needs a real layout engine instead of only one-off section props.

### Containers

Container types:

- Stack.
- Row.
- Grid.
- Split.
- Carousel.
- Masonry.
- Accordion group.
- Tabs group.

Each container has allowed child types and layout rules. For example:

- Accordion group can contain accordion items.
- Tabs group can contain tab panels.
- Profile grid can contain profile card nodes or a profile data source.
- Button group can contain button nodes.

### Drop Zones

Drop zones must be semantic:

- Section drop zone.
- Container child drop zone.
- Before/after component.
- Inside component slot.

The system should know what can be dropped where. This prevents invalid trees.

### Slots

Complex components need named slots:

```txt
Hero
  media
  eyebrow
  headline
  copy
  primaryCta
  secondaryCta
```

Slots allow precise editing without turning every design into raw HTML.

## Responsive Model

The builder should use a cascade:

```txt
Base desktop style
  -> tablet overrides
  -> mobile overrides
```

Each override stores only changed values. The user can reset a mobile override
back to desktop at any time.

Responsive controls should support:

- Device preview.
- Device-specific visibility.
- Device-specific order.
- Device-specific columns.
- Device-specific spacing.
- Device-specific media crop/focal point.
- Device-specific full-width/contained behavior.

Mobile editing should be direct: switch to mobile, select the component, adjust
mobile padding or stacking, publish one page.

## Advanced Components

The registry should grow into a serious component library.

### Content Components

- Heading.
- Paragraph/rich text.
- Image.
- Video.
- Button.
- Button group.
- Icon list.
- Badge group.
- Divider.
- Spacer.

### Layout Components

- Container.
- Stack.
- Row.
- Grid.
- Split.
- Accordion.
- Tabs.
- Carousel.
- Masonry gallery.

### Roster Components

- Profile card.
- Profile grid.
- Featured roster.
- Roster carousel.
- Category-filtered roster.
- Manual profile picks.
- Availability/status badge.

### Business Components

- Inquiry CTA.
- Inquiry form.
- Contact form.
- Package/rate card.
- Service card.
- Booking/availability prompt.
- Testimonial.
- Trust badge.
- Press logo.
- FAQ accordion.

### Integration Components

- Map.
- Calendar/embed block.
- Video embed.
- Form endpoint block.
- Social link block.
- Analytics/event marker.
- Custom code/embed for Agency+ only, with sandboxing and preflight.

## Feature Integration Model

Generic builders stop at visuals. Tulala should connect builder blocks to
product features.

Builder block integrations:

- Roster block -> `agency_talent_roster` + `talent_profiles`.
- Inquiry form -> inquiry/workspace engine.
- Package cards -> package/rate settings.
- Trust badges -> trust/reliability/payment state.
- Directory links -> tenant public directory.
- Profile links -> tenant public profile URLs.
- Contact CTA -> configured inquiry/contact destination.
- Domain banner -> package/domain state.
- Translation health -> locale completeness.

Each integration should have:

- Data source selector.
- Empty state.
- Publish preflight.
- Preview data.
- Permissions.
- Package gate.

## Inspector Design For Deep Controls

The right inspector needs both simple and advanced modes.

### Simple Mode

For most users:

- Content.
- Layout preset.
- Style preset.
- Data source.
- Mobile visibility.

### Advanced Mode

For Studio/Agency/Network:

- Box model.
- Grid/flex controls.
- Responsive overrides.
- State styles.
- Motion.
- Data filters.
- Custom attributes where safe.

The same node model supports both modes; package rules decide which controls are
visible.

## Interaction And Motion

Motion should be tokenized:

- None.
- Subtle.
- Editorial.
- Energetic.

Component interactions:

- Accordion open/close.
- Tabs.
- Carousel slide.
- Sticky bar.
- Reveal on scroll.
- Hover card.

Motion controls should never be required for content to be visible. Preflight
should catch inaccessible interaction patterns.

## Extensibility: App Blocks

Long-term, Tulala can support "app blocks" for platform or partner features.

Examples:

- Inquiry form block.
- Availability request block.
- Talent search block.
- Featured roster block.
- External calendar block.
- Map/location block.
- CRM capture block.

App block contract:

```txt
AppBlock
  key
  label
  configSchema
  dataRequirements
  renderMode
  packageAvailability
  permissions
  preflightChecks
```

This is how future integrations become builder-native without hardcoding every
feature into one giant editor.

## Package Model

### Free

Purpose: let a new workspace publish a credible one-page storefront quickly.

Allowed:

- One public landing page.
- One starter template family.
- Up to five roster people.
- Body sections editable.
- Copy, CTA links, section order, and profile source editable.
- Basic color/accent choices from a small curated set.

Locked or limited:

- Header and footer style locked or minimally editable.
- Directory card family locked.
- Profile page layout family locked.
- No custom domain.
- No multi-page builder.
- No reusable block library.

Core user journey:

1. Signup creates workspace and Free URL.
2. Owner creates, invites, or connects up to five people.
3. One-page template binds to those visible roster profiles.
4. Publish preflight blocks if there is no inquiry path or the page promises
   profile content with no visible profiles.

### Studio

Purpose: give solo operators and small teams a more branded site without full
agency complexity.

Allowed:

- Branded subdomain.
- Multiple starter templates.
- More page sections and a small page count.
- Richer body style controls.
- More profile slots.
- Section duplication and saved drafts.
- Basic header/footer choices.

Locked or limited:

- No full custom domain unless upgraded.
- Limited reusable blocks.
- Limited team/workspace permissions.

### Agency

Purpose: full branded roster business site.

Allowed:

- Branded subdomain and custom domain.
- Multi-page builder.
- Full header/footer/site shell editing.
- Directory card family choices.
- Profile layout family choices.
- Reusable blocks.
- Advanced templates.
- Rich SEO/social settings.
- Stronger publish workflow with review, revisions, scheduled publish.

### Network

Purpose: multi-workspace / multi-brand operations.

Allowed:

- Shared template libraries across workspaces.
- Shared blocks and locked brand systems.
- Multi-workspace analytics.
- Parent/child site settings inheritance.
- Workspace-level overrides.
- More granular permissions and approval workflows.

## Builder Layers

### 1. Template Layer

Templates define complete starting experiences. They are not the final storage
format for a page; they materialize tenant-owned content and component trees.

Template examples:

- Free Quickstart: one-page roster launch.
- Bridal Studio: hero, services, featured artists, packages, testimonials, CTA.
- Model Agency: roster-first, category filters, client CTA, editorial profile
  cards.
- Creator Roster: social proof, creator categories, campaign inquiry.
- Casting Network: search-first directory, submission flow, trust proof.

Template metadata should include:

- Supported plans.
- Required data bindings.
- Section/component tree.
- Default tokens.
- Starter copy.
- Preflight expectations.

### 2. Page Layer

A page is a published tree plus metadata.

Required page concepts:

- Page identity: tenant, locale, slug, type.
- Draft tree.
- Published snapshot.
- SEO/social metadata.
- Version.
- Package gates.
- Publish status.

Current `published_homepage_snapshot` and `published_page_snapshot` are the
right direction. Builder 2.0 should make every public builder-owned page use a
snapshot consistently.

### 3. Section Layer

Sections are high-level page regions. They remain important because most users
edit sites in sections, not individual DOM nodes.

Examples:

- Hero
- Featured roster
- Service grid
- Image + copy
- Gallery strip
- Packages
- Testimonials
- Trust badges
- FAQ
- Inquiry CTA
- Contact form

Section controls:

- Reorder.
- Duplicate.
- Hide by device.
- Rename.
- Swap variant.
- Bind data source.
- Convert to saved block.

### 4. Component Layer

Builder 2.0 becomes powerful when a section can contain editable components.

Component examples:

- Heading
- Rich text
- Image
- Video
- Button
- Button group
- Profile card list
- Service card
- Price/package card
- Badge group
- Form field group
- Slider/carousel
- Column/grid container
- Spacer/divider

Component controls:

- Reorder inside parent section.
- Add/remove component where allowed.
- Replace component type where compatible.
- Bind to data.
- Set responsive style overrides.
- Set visibility rules.

### 5. Data Binding Layer

This is the strategic advantage over generic site builders.

Supported binding sources:

- Roster profiles.
- Featured profiles.
- Manual profile picks.
- Service categories.
- Packages/rates.
- Testimonials.
- Locations.
- Trust badges / verification state.
- Inquiry form config.
- Workspace identity.
- Brand/media library.

Bindings should be typed. A profile card list should know it expects
`talent_profiles` through `agency_talent_roster`, not arbitrary text.

### 6. Style Token Layer

Global design should live in tokens, not scattered CSS.

Token groups:

- Color palette.
- Typography.
- Radius.
- Spacing scale.
- Shadow.
- Motion.
- Density.
- Header/footer style.
- Directory card family.
- Profile layout family.
- Background mode.

Plan gates can decide which tokens are editable.

### 7. Responsive Layer

Every editable node should support optional overrides:

- Desktop default.
- Tablet override.
- Mobile override.

Initial override controls:

- Hide/show by device.
- Stack direction.
- Column count.
- Alignment.
- Spacing.
- Image crop/focal point.
- Text size preset.

Avoid raw viewport-based font scaling. Use named presets and stable layout
constraints.

### 8. Publish Layer

Publish should produce immutable snapshots:

- Page snapshot.
- Site shell snapshot when applicable.
- Resolved component tree.
- Resolved token set.
- Data binding references.
- Published timestamp.
- Version.

Public rendering should prefer snapshots. Draft rendering should use the same
renderer with draft inputs.

## Proposed Storage Model

The current page/section snapshot model can evolve without throwing it away.

### Builder Tree

```txt
BuilderPageTree
  id
  tenantId
  locale
  pageId
  version
  root
    children: BuilderNode[]
```

### Builder Node

```txt
BuilderNode
  id
  type: section | component | container
  registryKey
  props
  style
  responsive
  binding
  children
  visibility
  locks
```

### Registry Entry

```txt
BuilderRegistryEntry
  key
  kind
  label
  allowedParents
  allowedChildren
  schemaVersion
  propsSchema
  styleSchema
  bindingSchema
  defaultProps
  defaultStyle
  renderComponent
  inspectorComponent
  planAvailability
```

### Snapshot

```txt
PublishedBuilderSnapshot
  version
  publishedAt
  pageVersion
  locale
  tree
  tokens
  bindings
  meta
```

## Editing UX

### Top Bar

Must keep:

- Page switcher.
- Device switcher.
- Undo/redo.
- Preview.
- Publish.
- Command palette.

Add later:

- A/B version selector.
- Comments/review mode.
- AI command input.

### Left Navigator

Current navigator should evolve from section list to tree view:

- Site shell.
- Page body.
- Sections.
- Components inside selected section.
- Hidden items.
- Warnings per node.

Free can show a simplified tree: body sections only.

### Canvas

Canvas should support:

- Click to select.
- Drag section reorder.
- Drag component reorder inside section.
- Drop zones.
- Inline text editing.
- Focal point editing for images.
- Resize handles only where safe.

### Right Inspector

Inspector tabs:

- Content.
- Style.
- Layout.
- Data.
- Responsive.
- Motion.
- Advanced.

Free should show fewer tabs. Agency/Network can unlock full controls.

### Insert Library

Library hierarchy:

- Templates.
- Sections.
- Blocks.
- Components.
- Data-driven components.

Each item should show plan availability and required data.

### AI Builder

AI should work at multiple scopes:

- Whole page: "make this page feel more editorial."
- Section: "turn this into a bridal services section."
- Component: "make this CTA softer."
- Data: "show only featured photographers."
- SEO: "improve title and description."

AI outputs should be structured patches:

```txt
Patch
  targetNodeId
  operation
  before
  after
  explanation
```

## Data-Aware Blocks

The first Builder 2.0 data-aware blocks should be:

1. Roster grid
2. Featured profiles
3. Services/categories
4. Inquiry CTA
5. Contact/inquiry form
6. Trust badges
7. Testimonials
8. Packages/rates

These create the most product value because they connect the site to the
workspace, not just design.

## Preflight Checks

Before publish, check:

- Required sections exist.
- Required components exist.
- No section promises roster/profile content while source is empty.
- Profile card lists do not exceed package caps.
- CTAs point to valid routes.
- Inquiry form exists or CTA has an external destination.
- Images have alt text when meaningful.
- SEO title and description exist.
- Mobile layout has no obvious overflow risk.
- Header/footer state is valid for the plan.
- Custom domain/subdomain rules match package.
- Draft references are publishable and not archived.

## Migration From Current Builder

The current builder has useful foundations:

- Section registry.
- Zod schemas.
- Homepage/page snapshots.
- Edit chrome.
- Navigator.
- Inspector.
- Publish drawer.
- Preflight.
- Tokens.
- Starter kits.

Do not rewrite from zero. Evolve it in phases.

### Compatibility Strategy

1. Keep current section snapshots rendering.
2. Add BuilderNode tree support behind the existing section model.
3. Treat existing sections as section nodes with no child component tree.
4. Convert one section type at a time to component-child capable.
5. Publish snapshots that can contain both legacy section slots and builder
   tree nodes during migration.
6. Once all public pages are tree-backed, remove legacy fallbacks.

## Execution Phases

### Phase B2.0 - Product Rules + Capability Matrix

Goal: make package behavior explicit.

Deliverables:

- Canonical builder/package capability file.
- Free/Studio/Agency/Network matrix.
- Tests for page count, section availability, shell editability, roster caps,
  domain rules, template availability.

Exit gate:

- No scattered package checks without using the central policy.

### Phase B2.1 - Builder Page Ownership

Goal: every public page is builder-owned or intentionally excluded.

Deliverables:

- Audit all tenant public routes.
- Backfill builder snapshots for homepage and standard pages.
- Mark non-builder surfaces explicitly: directory, profile, auth, etc.
- Remove silent legacy page fallback where unsafe.

Exit gate:

- Public pages on tenant hosts resolve to builder snapshots or documented
  non-builder renderers.

### Phase B2.2 - Free Product Journey

Goal: signup to Free published site works end to end.

Deliverables:

- Roster setup path: create, invite, or connect up to five people.
- Visible count: 0/5, 1/5, etc.
- Sixth person blocked with upgrade messaging.
- Free builder body-only controls.
- Header/footer/directory/profile style locked or simplified.
- Publish preflight understands empty roster and inquiry CTA.

Exit gate:

- New Free workspace can publish a one-page site with real roster profiles.

### Phase B2.3 - Component Tree Foundation

Goal: introduce nested components without breaking current sections.

Deliverables:

- BuilderNode type.
- Component registry.
- Tree normalization/migration helpers.
- Renderer that can render legacy section nodes and new component nodes.
- Inspector dispatch by node kind.

Exit gate:

- One section supports editable child components in draft and published modes.

### Phase B2.4 - Drag + Drop Inside Sections

Goal: make the builder feel modern.

Deliverables:

- Drop zones in selected section.
- Component reorder.
- Add/remove component.
- Undo/redo integration.
- Keyboard accessibility for reorder.

Exit gate:

- User can add, move, and remove components inside a section without corrupting
  the page tree.

### Phase B2.5 - Responsive Controls

Goal: make mobile control explicit.

Deliverables:

- Responsive style schema.
- Device-specific overrides.
- Mobile/tablet inspector controls.
- Overflow/preflight warnings.

Exit gate:

- User can adjust selected component layout on mobile without changing desktop.

### Phase B2.6 - Data-Bound Components

Goal: make Tulala better than generic builders.

Deliverables:

- Roster/profile card component.
- Service/category component.
- Inquiry form component.
- Package/testimonial/trust components.
- Data binding inspector.

Exit gate:

- User can bind a component to real roster/workspace data and publish it.

### Phase B2.7 - Template + Block Library

Goal: turn builder into a growth surface.

Deliverables:

- Saved blocks.
- Platform template packs.
- Plan-gated template library.
- Workspace reusable blocks for Agency+.
- Network shared blocks with locks.

Exit gate:

- Agency can save and reuse a branded block across pages.

### Phase B2.8 - AI Builder

Goal: structured AI editing.

Deliverables:

- AI patch schema.
- Node-scoped AI actions.
- Preview diff before applying.
- Prompt presets.
- Safety checks before publish.

Exit gate:

- AI can edit a section/component and produce a reviewable structured patch.

## What Not To Do

- Do not store arbitrary HTML as the main page model.
- Do not create a second page-builder system beside the current one.
- Do not unlock full header/footer editing on Free.
- Do not let profile cards drift from real roster data by default.
- Do not make mobile a separate duplicated page.
- Do not make AI bypass schemas, plan rules, or publish preflight.

## Immediate Next Slice

When implementation resumes, start with B2.0 and B2.2 together:

1. Add the canonical package capability matrix.
2. Use it to lock Free builder shell controls.
3. Improve Free roster setup messaging and 0/5 progress.
4. Ensure created/invited/connected roster profiles can become visible on the
   Free one-page template.
5. Add publish preflight for "profile section has no visible profiles."

This gives the product a cleaner Free journey while laying the foundation for
the larger component-tree builder.
