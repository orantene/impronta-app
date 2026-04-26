# Page Builder — Vision and Roadmap

**Status:** draft, 2026-04-25
**Owner:** editor team
**Companion:** [`builder-experience-execution-plan.md`](./builder-experience-execution-plan.md) — the tactical Phase-0 plan that got us to today
**North star:** *anyone can mimic any creative design idea they have in mind, no compromise*

---

## TL;DR

The editor today is a **polished kit** — clean chrome, working drawers, color picker, drag-to-reorder, 12 conventional section types. It's structurally sound but **token-locked**: every input is a curated preset (Stepper, Segmented, Swatch from theme palette only). Designers hit a ceiling fast.

To reach the north star we need three architectural shifts plus a section-library expansion:

1. **Token-default with pixel escape** — every preset gets an "override to raw value" path
2. **Direct manipulation** — edit text where it lives, drag corners to resize, no inspector round-trip for trivial changes
3. **Authoring DX as a feature** — adding a new section type drops from ~2hr / ~6 files to ~15min / 1 file via schema-driven inspectors and a section-renderer kit

After that, ~30 distinct section archetypes + composition lift (full-bleed, overlap, nest) + scroll interactions + template engine + a11y/perf budget = a builder that adapts to any creative direction.

**Total scope:** 14 phases, ~149 days of focused work serially, ~70-90 days with three parallel tracks.

---

## North star — what "adaptive to any creative design" means concretely

Six anchor designs that prove the bar. If we can build all six without code escape, we're done.

1. **Luxury fashion lookbook** — full-bleed scroll-pinned hero video, sticky-side product panels, asymmetric overlapping image+headline blocks, custom serif type with tight tracking on every heading, mesh-gradient backgrounds, reveal-on-scroll editorial pull-quotes
2. **Hospitality landing page** — animated map with content overlay, parallax depth (3 layers), Lottie loop in section background, per-locale imagery (different hero photo for EN vs ES), booking widget that posts to inquiry pipeline
3. **Wedding photographer portfolio** — masonry galleries with lightbox, scroll-jacked story sections, before/after slider, tracking-dense small-caps captions, full-bleed image breaks between content sections
4. **Talent agency roster** — horizontal-scroll talent cards, on-hover dim-others-amplify-one, timeline of past bookings, trust badges (Verified/Silver/Gold), inline filters, click-through to talent profile pages
5. **SaaS marketing site** — pricing comparison table, hero with code snippet + syntax highlighting, feature grid with hover zoom, FAQ accordion, stats counter, footer with multi-column nav
6. **Nonprofit campaign** — bold display typography, scroll-triggered statistics counter, donation form (lead capture → admin workspace), before/after social-impact slider, video testimonial reel with chapter markers

**Audit gap:** none of these six are buildable today end-to-end. Most need at least 4-5 capabilities the current builder lacks.

---

## Architecture principles

These are the beliefs the roadmap rests on. Listed first because if you reject one, the roadmap order changes.

1. **Token-default, pixel-escape.** Every input shows a theme token by default; raw values live one click away. You can always go off-system; the system warns but never blocks.
2. **Composition over preset extension.** New sections come from composing primitives (Container, FullBleed, Stack, Marquee, StickyScroll, Reveal), not from extending a god enum.
3. **Authoring DX is a product feature.** Section authors are a primary user. Time-to-new-section is a metric we track.
4. **Direct manipulation when feasible.** Click a heading, edit it. Drag a corner, resize it. Inspectors are for things that have no obvious canvas affordance.
5. **Design system as guide rail, not jail.** Show "you've left the theme" indicators; never refuse the edit.
6. **Behavior as primitives, not bake-ins.** Scroll triggers, hover orchestration, reveal animations are reusable kit pieces. Every section gets them for free.
7. **Same render tree for editor and visitor.** Selection / comments / drag handles are overlay-only. "Preview as visitor" hides overlay, doesn't fork the render path.
8. **Server-render for SEO; hydrate for interactivity.** Performance budget is non-negotiable.
9. **Accessibility is enforced.** Alt-text required, contrast warnings inline, heading hierarchy validated. Publish blocks if WCAG AA fails (with override).
10. **Multi-author from day one of the schema design.** Even if multiplayer ships later, schema must be CRDT-compatible so we don't refactor everything when we add it.

---

## Current state — grounded audit (April 2026)

### What works fully
- **Chrome:** TopBar (undo/redo, devices, page settings, revisions, theme, comments, assets, preview, share, save, publish, exit), 6 drawers, drawer mutex
- **Section registry:** 12 types in `web/src/lib/site-admin/sections/registry.ts` (hero, trust_strip, cta_banner, category_grid, destinations_mosaic, testimonials_trio, process_steps, image_copy_alternating, values_trio, press_strip, gallery_strip, featured_talent)
- **Inspector tabs:** 5/5 wired (Content, Layout, Style, Responsive, Motion) — all write back to section data; Responsive is device-aware with per-breakpoint overrides
- **Theme drawer:** Brand + Editorial palettes, color picker (HSL + eyedropper + recents), Layout/Effects/Code tabs (Code is placeholder), 4 heading-font + 3 body-font presets, spacing/radius/shadow preset scales
- **Page Settings drawer:** Basics, SEO, Social, URL & robots tabs with title/description/OG image/canonical/noindex
- **Revisions:** Real list from `cms_page_revisions`, restore via CAS-safe action
- **Comments:** End-to-end threads with reply, resolve/unresolve, delete, edit, realtime via Supabase
- **Assets drawer:** Picker + upload via `/api/admin/media/upload`; tabs for All / Images / Videos (stub) / Documents (stub) / Brand
- **Schedule publish:** Full end-to-end, datetime picker, cron at `/api/cron/publish-scheduled`
- **Drag-to-reorder:** Both canvas (DOM-driven, `[data-cms-section]` rects) and navigator (HTML5 native drag)
- **Locale switcher:** EN/ES URL swap (no per-field content swap)
- **Device toggle:** Desktop/Tablet/Mobile with real breakpoint CSS

### Wired but not bound (⚠️)
- **Locale per-field content** — switcher works, but content doesn't translate per locale; no `{en, es}` storage
- **Page Settings → Code tab** — placeholder ("coming soon" copy)
- **Page Settings → slug editor** — disabled, blocks on multi-page support
- **Share preview link** — action exists in `command-palette.tsx`; no topbar button surfacing it
- **Link href** — text input only, no picker for pages / anchors / talent profiles
- **Icons** — enum-picked (`category-icon-glyph.tsx`), not user-uploadable
- **Video bg / video upload** — assets drawer marks "coming soon"

### Missing (❌)
- Inline canvas editing (every text edit requires opening the inspector)
- Rich text formatting beyond plain string fields
- Asset crop / focal point picker
- Header / Footer globals (no global-block machinery)
- Multi-page management (only Homepage exists; Phase 24 in master plan)
- Form section type + submission handler
- Custom CSS escape hatch per section
- Free numeric+unit inputs (everything is preset stepper or enum)
- Free color outside theme palette (the picker exists but most fields lock to palette enum)
- Google Fonts / custom font upload
- Per-level type scale editor (h1-h6 sizes, weights, line-heights)
- Section-level diff in publish drawer (publish-drawer docstring acknowledges)
- Background primitives beyond static color/image (no video bg, no Lottie, no parallax, no mesh gradient)
- Scroll-triggered interactions (Motion tab is entry-on-mount only)
- Composition lift (no full-bleed, overlap, nesting; flat slot model)
- Section variants as a first-class system
- Section archetypes beyond conventional 12
- Template engine (no save-as-template, no template gallery)
- Section blueprints (no "starter content" presets per type)
- Accessibility tooling (no alt-text enforcement, no heading hierarchy scan, no contrast checker)
- Performance budget (no Lighthouse score in publish flow)
- Multiplayer / presence / cursors / locks / CRDT
- Section authoring DX tools (no scaffolding CLI, no schema → inspector auto-binding, no section sandbox, no section-renderer kit)

---

## Three-layer architecture (target state)

```
┌──────────────────────────────────────────────────────────────┐
│  Page composition (slots, lift modifiers, locale)           │
│  - flat slots today; full-bleed/overlap/nest after Phase 4  │
└──────────────────────────────────────────────────────────────┘
              ↑ composes
┌──────────────────────────────────────────────────────────────┐
│  Section types (lib/site-admin/sections)                    │
│  - declare schema (with versioning), variants, defaults     │
│  - composed from section-renderer primitives                │
└──────────────────────────────────────────────────────────────┘
              ↑ composes
┌──────────────────────────────────────────────────────────────┐
│  Section-renderer primitives (kit/section-primitives) [NEW] │
│  - Container, FullBleed, Stack, Grid, AspectRatio,          │
│    Marquee, StickyScroll, Reveal, Parallax, Lightbox        │
│  - chrome kit (existing) handles inspector controls         │
└──────────────────────────────────────────────────────────────┘
```

**Schema model:**
- Sections own a versioned schema with auto-migration backfill
- Each schema field describes its own UI (label, type, default unit, validation, conditional visibility)
- Inspector auto-renders from schema; custom inspectors are opt-in override
- Per-locale fields are a primitive (`{ default, en, es, ... }`)

**Data flow:**
- Edit → mutation through `edit-context.tsx` actions → optimistic local state → debounced server save → broadcast to collaborators (Phase 12)
- Theme is its own document; can be overridden per-section (rare)

**Render flow:**
- Same React tree in editor and visitor
- Editor adds selection layer + comment pins + drag handles via overlay
- Server-render for SEO; hydrate for interactivity

---

## Roadmap — 14 phases

### Phase 0 — Foundation (✅ done, April 2026)
Editor chrome, drawers, color picker, drag-to-reorder, 12 section types, full inspector wiring, save/publish/revisions/comments/schedule.

### Phase 1 — Pixel-first foundation (~10 days)
**Goal:** remove the ugly ceiling. Every preset gets an override-to-raw path.

Deliverables:
- `<NumberUnit>` kit primitive (value + px/rem/%/vh/vw/em picker, theme-token toggle)
- Layout panel: paddingTop/Bottom/Left/Right, marginTop/Bottom, containerWidth, gap accept numeric+unit
- Style panel: free color anywhere (drop "theme palette only" constraint), with "linked to theme" indicator
- Effects panel: borderRadius, shadow values, opacity, blur as numerics
- Theme drawer: spacing/radius/shadow scales editable as numeric arrays (not preset chips)
- Code tab activated: per-section custom CSS textarea with scoped injection (`.section-{id} { ... }`) + sanitization
- Schema migration: presentation accepts union of `enum | { value, unit }`
- Renderer reads either shape and produces CSS

**Success criteria:** a designer can recreate a Figma mockup that uses padding values not in the preset stepper, with hex colors not in the brand palette, in under 5 minutes.

**Risk:** schema migration touches 12 sections. Build the union shape carefully; backfill defaults must not break existing pages.

### Phase 2 — Direct manipulation (~5 days)
**Goal:** edit content where it lives.

Deliverables:
- Inline contenteditable on text nodes (selection-layer extension)
- Floating mini-toolbar: font, size, weight, line-height, tracking, color, alignment
- Per-element typography overrides stored in section data (`textOverrides: { headingId: { fontSize, ... } }`)
- Drag corners on images to resize within section bounds
- Per-element style overrides extend to color and link href

**Success criteria:** editing a hero headline doesn't require opening the inspector; an editor can hand-tune a heading's size/tracking by dragging a slider in the floating toolbar.

**Risk:** React reconciliation around contenteditable is notoriously fragile; budget time for selection-state edge cases.

### Phase 3 — Authoring DX (~12 days)
**Goal:** cut new-section authoring cost from ~2hr to ~15min.

Deliverables:
- Scaffolding CLI: `pnpm new:section <name>` generates schema + renderer stub + factory + registry entry in one command
- **Schema → inspector auto-binding** — describe fields once (`paddingTop: { type: 'numberUnit', label: 'Top padding', defaultUnit: 'rem' }`), inspector auto-renders. Custom inspectors stay possible as override. *Single biggest DX win.*
- Section sandbox at `/dev/section-sandbox/[type]` — isolated render with mock data, live inspector, theme switcher, device toggle. Iterate in 5sec instead of 30sec, no editor spin-up
- **Section-renderer kit** at `web/src/components/edit-chrome/kit/section-primitives/`: `<Container>`, `<FullBleed>`, `<Stack>`, `<Grid>`, `<AspectRatio>`, `<Marquee>`, `<StickyScroll>`, `<RevealOnScroll>`, `<Parallax>`, `<Lightbox>`
- First-class variant system — section declares `variants: ['media-left', 'media-right', 'full-bleed']`, picker auto-shows them, inspector auto-includes variant chip group
- Typed `useTheme()` hook with autocomplete on tokens

**Success criteria:** a developer adds a new section type with a single inspector field in under 15 minutes, with the schema → inspector binding handling all controls.

**Risk:** the section-renderer kit API is foundational. If wrong, refactor cost is high. Prototype on 3 sections (Phase 6's first batch) before locking the API.

### Phase 4 — Compositional freedom (~8 days)
**Goal:** break the slot-stacking model.

Deliverables:
- Full-bleed escape: sections can ignore container width, render edge-to-edge
- Overlap composition: sections accept negative top/bottom margin, layered with explicit z-index
- Nested sections: section instances can hold child section slots (e.g., a "split-screen" archetype hosts two child sections)
- Asymmetric grid placement: section can declare grid-area within page composition
- Schema lift: page composition stores section instances with composition modifiers (`fullBleed`, `overlapTop`, `gridArea`)

**Success criteria:** an editorial layout where an oversized image overlaps the next section's headline is shippable.

**Risk:** non-trivial schema change. Composition modifiers must compose with locale and responsive overrides. Test interaction matrix carefully.

### Phase 5 — Backgrounds and motion (~10 days)
**Goal:** visual depth.

Deliverables:
- Video background primitive (poster, mute, loop, autoplay-on-view, mobile-fallback to image)
- Lottie/SVG animation backgrounds
- Mesh gradient generator (3-5 color stops, rotation, scale)
- Animated noise/grain overlay
- Parallax layered images (3+ layers, scroll-driven offset)
- Scroll-triggered animations: fade-up, slide-in, sticky reveal, scroll-pinning, scroll-jacking
- Motion timeline editor: custom keyframes per element (advanced, behind disclosure)
- Reduced-motion compliance: all animations respect `prefers-reduced-motion`

**Success criteria:** a hero with parallax depth + scroll-pinned video bg + reveal-on-scroll headline is achievable.

### Phase 6 — Section archetype library (~15 days, scales with Phase 3)
**Goal:** 30+ distinct section types.

After Phase 3 (~0.4 day per archetype instead of 1.5):

**First wave (creative archetypes):**
- Split-screen hero, sticky-scroll panels, marquee text loop, side-scroll carousel, lookbook flipbook, before/after slider, masonry grid, big editorial pull-quote, timeline, sticky-sidebar-with-scrolling-content

**Second wave (utility archetypes):**
- Stats counter, logo cloud (distinct from press strip), pricing table, comparison table, tabs, accordion FAQ with images, booking widget, image-orbit (item with floating tags), video reel with chapter markers, map + content overlay

**Third wave (vertical-specific):**
- Talent roster card grid, lookbook gallery, donation form, code snippet block with syntax highlight, event listing, calendar embed

**Success criteria:** all six anchor designs from the north star are buildable.

### Phase 7 — Page-level structure (~10 days)
**Goal:** real multi-page sites.

Deliverables:
- Multi-page management: add/rename/delete/duplicate pages, slug editor, page reorder for navigation
- Header / Footer globals: edit once, applied site-wide; per-page header override possible
- Per-page settings completion: password protect, custom redirects, per-page meta overrides
- 404 / error pages
- Sitemap.xml + robots.txt management
- Page templates (separate from full-site templates): save a single page as reusable starting point

**Success criteria:** ship a real 10-page agency site with consistent navigation and footer that updates everywhere when edited once.

### Phase 8 — Real interactions (~8 days)
**Goal:** dynamic content.

Deliverables:
- Form builder section type: field types (text, email, textarea, select, checkbox, file upload, date), validation rules, custom field labels, required/optional flags
- Form submission handler: routes to inquiry pipeline (per `project_inquiry_flow_spec.md`) or email or webhook
- Form submission storage in DB (`form_submissions` table)
- Link picker: page / anchor / external URL / talent profile / file / phone / mailto, with route validation
- Asset crop UI + focal point picker (`react-easy-crop` or similar)
- Image responsive srcset + lazy load + format negotiation (next/image-style pipeline)
- Video upload pipeline + thumbnail generation
- Anti-spam: honeypot + rate limit + optional captcha for forms

**Success criteria:** lead-capture forms route into the admin workspace inquiry queue end-to-end; images deliver optimal sizes per device.

### Phase 9 — Localization and personalization (~8 days)
**Goal:** per-locale content + future personalization hooks.

Deliverables:
- Per-field locale storage: each translatable field becomes `{ default, en, es, ... }`
- Locale add/remove via theme/site settings
- Translation status indicators per field (translated / missing / outdated)
- Auto-translate via API (Claude, DeepL, or Google) — opt-in batch
- Per-locale assets (different image per language)
- Visitor-segmentation hooks (geo, device, traffic source) for future personalization
- Locale fallback chain (es-MX → es → default)

**Success criteria:** flipping the locale toggle swaps content per-field with proper fallbacks; auto-translate fills missing locales in one click.

### Phase 10 — Accessibility + performance (continuous, ~6 days for first pass)
**Goal:** all generated pages meet WCAG AA + Lighthouse 90+.

Deliverables:
- Alt-text required on image fields (publish blocks if missing, with override)
- Heading hierarchy live validation (warnings in inspector when h2 follows h4 without h3)
- Color contrast checker (warnings on combinations below WCAG AA, computed live as colors change)
- Focus order preview mode
- Image optimization audit in publish flow (oversized images flagged)
- Lighthouse score check in publish flow with go/no-go threshold (override available)
- Bundle size budget per page (alert if section composition exceeds threshold)
- ARIA landmark requirements (header, nav, main, footer)

**Success criteria:** publish is blocked if a11y or perf falls below threshold (override available with explicit confirmation).

**Note:** this isn't a one-shot phase — accessibility tooling should evolve continuously alongside other features.

### Phase 11 — Template engine + verticals (~12 days)
**Goal:** new users land in a builder that ships with creative starting points.

Deliverables:
- Save current page as template (under workspace)
- Save current site as multi-page template
- Template gallery (browse workspace + curated)
- Apply template (replace current composition with confirmation)
- Template marketplace (other workspaces' public templates, opt-in)
- **Per-vertical starter kits:** luxury fashion, wedding photographer, hotel, talent agency, SaaS, nonprofit (6 kits, ~1 day each)
- Section blueprints framework: each section ships 3-5 visual starter presets, surfaced in picker drawer

**Success criteria:** a new user picks a vertical kit and has a complete ready-to-customize site in under 2 minutes.

### Phase 12 — Multiplayer + collaboration (~15 days)
**Goal:** multi-author editing without conflicts.

Deliverables:
- Presence indicators (avatars of who's editing the same page)
- Cursor visibility per editor
- Section-level locks (prevent simultaneous edit on same section)
- CRDT-based content state (Yjs or Automerge) — avoid lost updates
- Per-section comment pins (extend existing comments-drawer)
- Activity feed (who changed what when, with restore-to-this-moment)
- Optimistic local edits with conflict resolution

**Success criteria:** two designers edit the same page concurrently for 30 minutes without losing work.

**Risk:** depends on schema being CRDT-compatible (architecture principle #10). If today's `edit-context.tsx` mutation model isn't CRDT-friendly, expect a 5-7 day refactor inside this phase.

### Phase 13 — Advanced design system (~10 days)
**Goal:** deep theming.

Deliverables:
- Google Fonts picker (search Fonts API, pick family + weights, inject `<link>`)
- Custom font upload (`.woff2` + license metadata)
- Per-level type scale editor (h1-h6 sizes, weights, line-heights, tracking, computed responsive scaling)
- Theme inheritance: workspace theme → site theme → page theme
- Theme variants (e.g., dark mode toggle that publishes a sibling stylesheet)
- Brand kit import: paste a URL, auto-extract colors / fonts / logo
- Theme presets save/load (export theme as JSON, import elsewhere)

**Success criteria:** a workspace can lock down brand fonts/colors and individual sites inherit + override safely with audit trail.

### Phase 14 — AI assistance (~12 days)
**Goal:** speed + creative assist.

Deliverables:
- "Generate section from prompt" — Claude API produces section type + content + suggested variant
- "Rewrite this copy" — inline floating button on selected text
- "Suggest a better layout" — analyzes current section, proposes variant changes
- "Translate all content" — batch via translation API
- "Generate an image" — via image API (Replicate / OpenAI / Anthropic), lands in assets drawer
- "Critique this page" — Claude audits page for design / copy / a11y issues
- AI-assisted alt-text generation
- Cost / quota visibility per workspace

**Success criteria:** a non-designer describes a section in plain English and gets a near-final result requiring only minor tweaks.

**Risk:** external API costs and latency. Design around quotas and offer self-hosted fallback paths where possible.

---

## Parallelization

Three tracks running concurrently to cut elapsed time roughly in half:

```
Track A (Foundation & Creativity)  : Phase 1 → 2 → 3 → 4 → 5 → 6
Track B (Site Structure & Distribution): Phase 7 → 11
Track C (Quality & Capabilities)   : Phase 8 → 9 → 10 (continuous)
Track D (Future bets, after stabilization): Phase 12 → 13 → 14
```

Dependencies:
- Phase 1 blocks Phases 4, 5, 6 (everything pixel-related)
- Phase 3 blocks Phase 6 (auto-binding makes archetypes cheap)
- Phase 4 blocks some Phase 6 archetypes (split-screen, sticky-sidebar need composition lift)
- Phase 9 (locale storage) blocks per-locale content in Phase 11 templates
- Phase 12 (multiplayer) is the biggest single bet; defer until 1-8 are stable

**Elapsed-time estimate:** 14 phases serial = ~149 days. With three parallel tracks = ~70-90 days.

---

## Decision log

Architecture forks worth recording because reversal is expensive.

1. **Token-default with pixel escape, not pure pixel-first.** Preserves "always on-brand" path while opening flexibility. *Reversal:* would require ripping out the kit entirely.
2. **Schema-driven inspectors (Phase 3).** Author defines schema once, UI auto-renders. *Reversal:* hand-write inspectors per type (current model). Acceptable but slow.
3. **Same React tree for editor + visitor.** Overlay-based selection layer. *Reversal:* forks editor + visitor render paths; doubles maintenance.
4. **Composition lift via slot annotations (Phase 4).** Sections declare full-bleed/overlap/nest capabilities; renderer respects them. *Reversal:* rigid slot stacking (current).
5. **Per-locale at field level, not section level.** Finer granularity. *Reversal:* requires schema migration of every section type.
6. **CRDT for collaborative state (Phase 12).** vs. operational transform vs. manual locking. *Reversal:* tied to multiplayer phase only — pick the CRDT library carefully (Yjs is the safe choice).
7. **AI as assist, not autopilot (Phase 14).** Every AI output goes through user approval. *Reversal:* would change product feel substantially.
8. **Section-renderer kit as separate primitives (Phase 3).** Not bundled into the chrome kit. *Reversal:* harder to evolve once consumed by 30+ section types.

---

## Risks and unknowns

- **Performance with full pixel-first + composition lift might exceed Lighthouse budgets.** Monitor bundle size + LCP per page from Phase 1 onward.
- **CRDT migration (Phase 12) is non-trivial.** Today's mutation model may not be CRDT-friendly; budget 5-7 day refactor inside the phase.
- **Direct-manipulation editing (Phase 2)** introduces subtle bugs around React reconciliation; needs careful state handling and possibly a state library (Zustand or Jotai) if React's built-ins prove insufficient.
- **Schema versioning (Phase 3) adds complexity** — only adopt if we expect rapid section evolution. We do, so it's worth it.
- **AI assist (Phase 14)** introduces external API costs and latency. May need quota system per workspace.
- **Section-renderer kit (Phase 3)** is foundational. If API is wrong, refactor cost compounds. Prototype on 3 sections before locking.
- **Auto-translate quality** (Phase 9) varies by language pair; manual override path must remain primary.
- **Multiplayer presence** (Phase 12) requires a real-time channel layer (Supabase Realtime should work, but stress-test before locking).

---

## Success metrics

Top-of-funnel to bottom-of-product:

| Metric | Today | Target |
|---|---|---|
| Time to first published page (new user) | ~30 min (manual setup) | <10 min (with template) |
| Distinct templates per vertical | 0 | ≥5 |
| New section authoring time | ~2 hr | ≤30 min |
| Section archetype count | 12 | ≥30 |
| Lighthouse perf score (generated pages) | unmeasured | ≥90 |
| Lighthouse a11y score | unmeasured | ≥95 |
| Save-to-publish latency (median) | ~1.5 sec | <500 ms |
| Concurrent editors per page (Phase 12) | 1 | ≥5 without conflict |
| Visual fidelity to designer mockup (Phase 1+2 done) | ~60% | ≥95% matchable |
| Anchor-design buildable count | 0 of 6 | 6 of 6 |

---

## What we're explicitly NOT building (out of scope)

To avoid feature creep, these are decisions to skip:

- **A code-only "design mode"** like Webflow's full CSS panel. Custom CSS escape (Phase 1) is enough; we don't expose the full cascade.
- **A full WYSIWYG HTML editor inside sections.** Inline editing is text + minimal formatting only. Rich content comes from purpose-built section types.
- **Plugins / extensibility marketplace.** Workspace-scoped templates are as far as we go. No third-party section authoring (yet).
- **Native mobile editor.** The editor is desktop-first; mobile preview yes, mobile edit no.
- **A separate "developer mode."** The whole product is approachable; advanced controls live behind disclosures, not behind modes.
- **E-commerce checkout / cart.** Forms can capture leads; transactional commerce is out of charter.
- **Offline editing.** Editor is online-only; offline drafts are out of scope.

---

## Reference files (for the next agent picking this up)

- Section registry: `web/src/lib/site-admin/sections/registry.ts`
- Edit context: `web/src/components/edit-chrome/edit-context.tsx`
- Inspector dispatch: `web/src/components/edit-chrome/inspectors/content-dispatch.tsx`
- Inspector panels: `web/src/components/edit-chrome/inspectors/{layout,style,responsive,motion}-panel.tsx`
- Selection layer (canvas): `web/src/components/edit-chrome/selection-layer.tsx`
- Drawers: `web/src/components/edit-chrome/{theme,page-settings,revisions,comments,assets,publish,schedule}-drawer.tsx`
- Chrome kit: `web/src/components/edit-chrome/kit/`
- Inspector kit: `web/src/components/edit-chrome/inspectors/kit/`
- Mockup source: `docs/mockups/builder-experience.html` (3,655 lines, 26 surfaces — repo-root-relative)
- Tactical Phase-0 plan: [`builder-experience-execution-plan.md`](./builder-experience-execution-plan.md)
- Charters that touch the builder:
  - `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_talent_subscriptions.md` (Portfolio tier custom domains)
  - `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_api_embeds_strategy.md` (embeddable widgets — *not yet ratified*)

---

## Recommended first thrust

If you're picking this up cold and have ~3 weeks of focused execution time:

**Sprint 1 (5 days):** Phase 1 partial — `<NumberUnit>` primitive + Layout panel retrofit + free color anywhere + custom CSS escape hatch. The biggest perceived freedom-jump per day.

**Sprint 2 (5 days):** Phase 1 finish + Phase 2 — Theme scale free editing + inline canvas editing + per-element typography toolbar.

**Sprint 3 (5 days):** Phase 3 head — schema → inspector auto-binding + section-renderer kit (Container, FullBleed, Stack, Grid, AspectRatio).

After 3 weeks: you've removed the ugly ceiling, added direct manipulation, and made every subsequent section dramatically cheaper to ship. From there, Phase 6 (archetypes) becomes the volume play.
