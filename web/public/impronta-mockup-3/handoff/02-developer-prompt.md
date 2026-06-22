# Developer Handoff — Turn the Impronta Hero Slider + Header into a Freeform Builder Component

**Audience:** a developer who knows this repo's Page Builder.
**Read first:** [`01-design-spec.md`](./01-design-spec.md) (exact behavior, animations, mobile, and the full list of levers). The reference build is `web/public/impronta-mockup-3/` (live: http://localhost:4522/).

> ### TARGET DESIGN = "Noir & Or" (Design 3) — build THIS one.
> The visual you are matching is the black-and-gold **Noir & Or** mockup at `web/public/impronta-mockup-3/` (port 4522). Match its palette, type, motion, and layout exactly as the **default**: near-black backgrounds (`#0b0a0d` / `#100e13`), gold accents (`#c6a14e` / bright `#e0c074`), gold gradient buttons, Cormorant Garamond display + Jost UI, the white-and-gold "Faces with an *imprint.*" hero (italic gold word), full-screen image carousel with crossfade + Ken Burns + autoplay, and the transparent header that turns to a blurred dark bar on scroll. Theme-tokenize everything (see Part D) so the SAME component can also render the Espresso (4520) and Atelier Blanc (4521) palettes, but **Noir & Or is the shipped default and the acceptance target.** Exact tokens are in `01-design-spec.md §5`.

**Goal:** Bring the Noir & Or hero slider + premium header into the page builder as **first-class, fully freeform, configurable components** that show up in the "+" gallery (authored/curated via Builder Lab). Nothing should be hardcoded. The mockup is a *foundation*; the editor must be able to change images, text, buttons, layout, motion, header behavior, etc. Flexibility is the priority.

---

## 0. The most important architectural facts (from a codebase audit)

- There is **one Page Builder Core**, parameterized per surface (`BuilderSurfaceKind = homepage | talent_page | cms_page | site_shell | platform_lab`). Build once; it works on talent sites, storefronts, and the Lab.
- The freeform unit is a recursive **`BuilderNode`** (discriminated union on `kind`) in `web/src/lib/site-admin/builder-node/types.ts`. Container kinds hold `children: BuilderNode[]`.
- **A `carousel` node already exists**, already nests freeform children, is already root-droppable, and is already in the gallery. It renders today as a horizontal scroll-rail, and its `autoplayMs`/`loop` props exist but are **not yet wired**. The hero slider should be a **full-screen variant of this node**, not a new primitive.
- **A `nav` and a `social_links` node already exist.** A rich agency **`site_header` section** also exists with transparency/sticky/social/CTA/EN-ES/hamburger drawer — but it is feature-flagged off and **not allowed on talent sites**. The talent header today is a plain `<header>` with a logo + nav: no transparency, no sticky, no hamburger engaged, no CTA, no social, no language toggle.
- **Scroll-to-solid header behavior does not exist anywhere in the repo.** It must be built from scratch (a tiny client scroll observer + a `[data-scrolled]` CSS state).
- The inspector is **not schema-driven** — controls are hand-authored per `node.kind` in `web/src/components/edit-chrome/inspectors/builder-node-content.tsx`. Adding controls = adding a branch there (using the primitives in `inspectors/kit/inspector-ui.tsx`).
- **Per-prop locking** already exists (`builder-node/prop-lock.ts`, `lockedProps: string[]`): the platform can lock the "look" while tenants edit copy. Use it.

---

## PART A — Hero Slider (a full-screen, freeform `carousel` variant)

### A1. Recommended approach
Extend the existing `carousel` node with a `variant` so it can render either as today's rail or as a **full-viewport hero slider**. This reuses the entire tree / validate / DnD / render / inspector pipeline and keeps slides freeform.

### A2. Files to edit (slider)
1. **`web/src/lib/site-admin/builder-node/types.ts`** — `BuilderCarouselNode` (~line 605). Add fields:
   - `variant?: "rail" | "hero"` (default `"rail"`)
   - `heightMode?: "screen" | "large" | "medium" | "custom"`, `minHeightPx?: number`
   - `overlay?: { tone: "none"|"dark"|"light"|"custom"; opacity?: number; gradient?: boolean; vignette?: boolean }`
   - `grain?: boolean`
   - `transition?: "fade" | "slide" | "none"`, `transitionMs?: number`
   - `kenBurns?: boolean`, `kenBurnsAmount?: number`
   - `autoplayMs?`, `loop?`, `pauseOnHover?` (autoplay already on the type; add the others)
   - `controls?: { dots?: boolean; arrows?: boolean; progress?: boolean; counter?: boolean }`
   - `contentAlign?: { x: "left"|"center"|"right"; y: "top"|"middle"|"bottom" }` (default content placement)
   - `contentMode?: "per-slide" | "shared"` (see A4)
2. **`web/src/lib/site-admin/builder-node/registry.ts`** — `carouselPropsSchema` (~line 431): add the same fields to the Zod schema (this validates + strips unknown props on save). Consider widening the carousel `children` allow-list (~line 940) to include `split` (multi-column slides) and `section`.
3. **`web/src/lib/site-admin/builder-node/render.tsx`** — carousel case (~line 3092): branch on `variant`. For `"hero"`: full-viewport slides (`100svh`/`min-height`, one slide visible), apply the scrim/overlay + grain, content overlay positioned by `contentAlign`, and per-slide Ken Burns. Mirror the exact CSS in `01-design-spec.md §1`. Add the renderer CSS near the existing carousel CSS (~lines 624/808/912).
4. **`web/src/lib/site-admin/builder-node/carousel.tsx`** — `BuilderNodeCarouselTrack`: **wire real autoplay** (consume `autoplayMs`/`loop`/`pauseOnHover`), crossfade vs slide transition, dots/arrows/progress/counter, and `prefers-reduced-motion` guard. (Logic spec: `01-design-spec.md §1 Controls`.)
5. **Gallery tile** — add a "Hero slider" entry so it appears distinctly in "+":
   - Lightest: a **composition preset** (`web/src/lib/site-admin/add-gallery/` + `create.ts`) that stamps a `carousel{variant:"hero"}` pre-seeded with 2 `container` slides (each already holding eyebrow/heading/sub/2 buttons), so the editor gets a beautiful default instantly.
   - It will show wherever the surface's gallery policy includes the `layout`/`elements` tab.
6. (If you keep `variant` on the existing kind, no new `BuilderNodeKind` is needed — you skip the heavy 6-file path.)

### A3. Slides are freeform (this is mostly already true)
Each slide is a `carousel` child. The allow-list already permits `container`, `card`, `cta_group`, `image`, `heading`, `paragraph`, `button`, etc. So "drop any components into a slide" works the moment slides render full-screen. Confirm the inspector lets you select INTO a slide and add children (it already does via `NestedBlocksCard` + `ElementLibraryInsertPicker`).

### A4. Per-slide vs fixed/shared content (build BOTH)
- **`contentMode: "per-slide"`** (default): each slide owns its freeform children (its own eyebrow/heading/sub/buttons/anything). Background AND content change per slide.
- **`contentMode: "shared"`**: only the backgrounds rotate; one fixed content block (stored on the node, rendered above the slides) stays put. Great for "one headline, rotating imagery."
- Editor should be able to flip between these without losing work (keep both stores; just toggle which renders).

### A5. Per-slide controls to expose
For each slide (a child container): background image **with focal point** (`object-position`), or background video/solid/gradient; per-slide image filter (none/brightness/grayscale/duotone-gold/blur); per-slide scrim override; per-slide content alignment + text color; per-slide CTA set (0/1/2 buttons, each label+link+style); Ken Burns/transition override.

### A6. Deeper options to consider (don't lock the design)
Thumbnails/filmstrip nav; vertical or Ken-Burns-only (no advance) modes; "first slide is static hero, rest auto-advance"; parallax on scroll; entrance reveal of the content block; link-the-whole-slide; lazy-load non-first slides; reduced-motion fallback to a single still; theme-token driven colors so the SAME slider renders Espresso / Atelier Blanc / Noir & Or by swapping tokens (see `01-design-spec.md §5`).

---

## PART B — Header / Shell (expand the talent shell to support this design)

### B1. The gap (audited)
The talent Max-site header (`web/src/lib/talent-site/server/render-max-site.tsx:319-329`) is a bare `<header>` rendering a `container` + `nav`. It cannot do transparency, sticky, scroll-to-solid, a real hamburger, a CTA, social links, or a language toggle. The rich **`site_header` section** (`web/src/lib/site-admin/sections/site_header/`) already does almost all of this (`schema.ts` `SiteHeaderV1` has `tone: transparent|surface|solid`, `sticky`, `navItems`, `primaryCta`, `socialLinks`, `contactLinks`, `authArea.showLanguageToggle`, `variant: editorial-split`, full-screen hamburger drawer in `EditorialSplitActions.tsx`) — but it is gated off and blocked for talent sites.

### B2. Recommended approach — reuse the rich header on talent sites, then add the missing scroll behavior
**Strategy A (reuse, unlocks ~90% immediately):**
1. `web/src/lib/site-admin/sections/talent-personal-section-keys.ts` (~6-32) — add `"site_header"` + `"site_footer"` to the talent allowlist (the single gate, enforced in `site-kind-allowlist.ts:42-44`).
2. `web/src/lib/talent-site/default-max-site-trees.ts` (`buildDefaultShellTree`, ~34-109) — seed the header/footer as `section` landmark nodes (`sectionTypeKey:"site_header"/"site_footer"`) instead of plain containers (mirror `buildSlimShellSectionNode` in `site-shell-surface-tree.ts:75-94`).
3. `web/src/lib/talent-site/server/render-max-site.tsx` (`renderMaxSiteDocument`/`splitShell`, ~282-385) — render the landmark through the bespoke `SiteHeaderComponent` path (port `PublishedShell.renderShellSlot`, `PublishedShell.tsx:205-396`), scoped to the talent (do NOT route through the agency `site-shell-flag.ts` path).
4. `web/src/lib/site-admin/sections/site_header/{Component,EditorialSplitActions}.tsx` — add a talent-appropriate variant (e.g. `"talent-editorial"`) or parameterize the right zone to show **EN/ES + CTA + hamburger** and hide agency-only discovery/inquiry-cart affordances. **Important:** `SiteHeaderComponent` does agency-tenant-scoped identity reads (`resolveShellBrandLogoUrl/Tagline/SocialContact`, `Component.tsx:445-502`) — for a talent site these must resolve against the talent or be passed via props, or branding mis-scopes to the managing agency (same bug class flagged in `TalentSiteFreeformRenderer.tsx:36-42`).

**Strategy B (net-new: scroll-to-solid):**
5. `web/src/app/token-presets.css` (~5145-5149 tone, ~5342-5347 sticky) — make `transparent` the start state and add a `[data-scrolled="true"]` rule that paints the blurred solid bar (mirror the existing editorial-split sticky block). See exact target values in `01-design-spec.md §2`.
6. **New `"use client"` scroll observer** (none exists) — toggles `data-scrolled` on the header when `scrollY > threshold` (or an `IntersectionObserver` on an above-the-fold sentinel). Mount it in the header render path.
7. `web/src/lib/site-admin/sections/site_header/schema.ts` (~108-130) — add `scrollTone: "solid"|"surface"` (the tone to switch TO) + `scrollThresholdPx`. Today `tone` is a single static value; you need start-tone + scrolled-tone.

### B3. Freeform header regions + addable header components
- Expose **left / center / right** drop regions in the `site_header` so arbitrary components (logo, nav, `social_links`, language toggle, CTA, a promo line) can be dropped per region. The landmark model already renders freeform `children` after the bespoke component (`PublishedShell.tsx:371-393`); either add three named child containers/regions to the schema+Component, or expose the existing `editorial-split` grid areas (`grid-template-areas: "lead brand actions"`, `token-presets.css:5348-5356`) as freeform targets.
- `nav` and `social_links` are already gallery nodes; make sure the shell surface gallery (`config.ts` site_shell config ~352, which adds a `"shell"` tab) lists them so they're addable into the header.

### B4. Header controls to expose (inspector)
The `SiteHeaderInspector` already has **Brand / Layout / Navigation / Style / Behavior / Mobile** tabs (`web/src/components/edit-chrome/inspectors/site-header/tabs/*`). Surface the new controls in **Behavior** (transparency on/off, scroll-to-solid on/off + threshold, solid bg/blur, sticky vs fixed) and **Mobile** (breakpoint, menu style: full-screen/drawer/dropdown, what shows in the mobile menu). Route selection of the talent `site_header` landmark to this inspector (agency uses `SITE_HEADER_SELECTION_ID` — `site-header/selection-id.ts`).

---

## PART C — Scroll, mobile, motion (match the spec exactly)
- **Scroll:** header starts transparent over the hero; past the threshold it animates (0.5s) to a blurred solid bar (bg `rgba(10,9,12,0.82)`, blur 16px), padding shrinks, a hairline + soft shadow appear, wordmark turns gold. Reverses on scroll-up.
- **Mobile (≤1080px):** inline links/CTA/lang collapse into a hamburger that opens a full-screen overlay (slide-down 0.6s, burger morphs to X). ≤760px: hide slider dots/counter; H1 clamps down; hero uses `100svh`.
- **Motion inventory** (crossfade 1.6s, Ken Burns 9s, autoplay 5.2s, reveal-on-scroll, marquee, hover) and all timings are tabulated in `01-design-spec.md §3`. Everything must respect `prefers-reduced-motion`.

---

## PART D — Flexibility / anti-lock requirements (non-negotiable)
- Every visual choice is a **prop with a sensible default**, editable in the inspector. No magic constants in the render that the editor can't override.
- Use **theme tokens** (color/type) so one component renders all three palettes; expose a palette/token selector.
- Use **per-prop locking** (`prop-lock.ts`): when this ships as a curated gallery item/template, the platform admin can lock structure/look (e.g. lock the scrim + type scale) while leaving copy, images, links unlocked. Set locks via the catalog overlay (`builder_catalog_overlay.locked_props`) or template `locked_props`.
- Provide **responsive overrides** (the style model already supports `style.responsive.{tablet,mobile}` and the inspector shows per-breakpoint override badges).

---

## PART E — Build in Builder Lab, REVIEW before publish, then ship to the gallery

### E0. Review-before-publish is REQUIRED (do not publish to the live gallery first)
The owner (super_admin) must see and test this in the Builder Lab BEFORE anything goes live to tenants. The Lab lives at `/platform/admin/builder-lab` and is super_admin-only, so the owner already has access. Workflow:
1. Build/compose the component in the **Lab canvas** — this is where you and the owner preview and test it interactively (resize, click, toggle options). Lab persistence is ephemeral; the durable output is a `builder_templates` row.
2. Save it as a **DRAFT template** (`createTemplateDraft`, status `draft`) — **do NOT call `publishTemplate` yet.** Drafts do NOT appear in the live "+" gallery, so tenants can't see it.
3. **Owner reviews** the draft in the Lab (and, for the code parts, on a feature branch via localhost / a Vercel preview — see below). Iterate until signed off.
4. Only AFTER owner sign-off: `publishTemplate` to push it into the live gallery. Even then you can publish "hidden" by setting `talent_enabled:false`/`workspace_enabled:false` via `setComponentOverlay`, and flip it on per surface when ready.

For the **code** parts (carousel `variant:"hero"` and the header changes), "review before publish" = work on a feature branch off `main`, test on localhost / a Vercel preview build in the REAL builder, open a PR, and merge to `main` only after the owner approves (per the repo's branch workflow). Do not merge to `main` (which auto-deploys to production) before sign-off.

### E1. Two delivery paths
- **Path 1 — DB template (no code, fastest, for the prototype/review):** In the Lab compose a `section` containing the header `nav` + the `carousel`, then `createTemplateDraft` (`web/src/lib/site-admin/builder-core/templates/registry-actions.ts:186`). Owner reviews the draft in the Lab. Only after sign-off, `publishTemplate` (`registry-actions.ts:410`) → it merges into the live "+" gallery via `listGalleryItems` (`add-gallery/registry-db-merge.ts:504`). Curate per surface + set `locked_props`/`default_props` via `setComponentOverlay` (`catalog-overlay-actions.ts:120`). Good for a "Hero + Header" starter block immediately, but slides only get full-screen/autoplay once Part A ships.
- **Path 2 — code (the real component):** Ship Part A (carousel `variant:"hero"`) + Part B (header) on a branch, test in the Lab + a talent site preview, get sign-off, then expose them as gallery tiles (composition preset for the hero; `nav`/`social_links` already in the shell gallery). This is the durable, fully-freeform result.

### E2. Placeholder images
Use the assets in [`03-placeholder-images.md`](./03-placeholder-images.md): default the shipped component to the committed `/talent-templates/demo/model/` photos (they ship and always render), and use the listed Unsplash URLs for richer variety while designing/testing. Do not leave any empty/gray image slots.

**Control-plane tables** (canonical dir `supabase/migrations/`, then `npm run db:push`): `builder_templates` (`20260611034138`), `builder_catalog_overlay` (`20260613062557`), Builder-Studio governance columns incl. `locked_props`/`default_props` (`20261027000000`). Most of this feature needs **no migration** (it is snapshot-tree JSON); only add columns if you introduce new control-plane governance.

---

## PART F — Acceptance criteria
1. A "Hero slider" tile exists in the "+" gallery; inserting it yields a full-screen, multi-slide hero with a beautiful default, editable immediately.
2. Each slide accepts arbitrary freeform child components; images, text, and buttons are editable per slide; `contentMode` can switch to one shared/fixed content block.
3. Slider options work: autoplay on/off + interval, transition type/duration, Ken Burns on/off, dots/arrows/progress/counter, height modes, overlay/scrim, grain, content alignment, per-slide overrides — all from the inspector.
4. The header supports: transparent-over-hero, **scroll-to-solid** (with configurable threshold), sticky, wordmark/logo, editable nav links, social links, EN/ES toggle, 1+ CTA, and left/center/right freeform regions; renders correctly on a talent Max site.
5. Mobile: hamburger → full-screen menu; slider + header degrade per spec; `prefers-reduced-motion` respected.
6. Per-prop locking works (platform can lock look, tenant edits content). Theme tokens let the component render Espresso / Atelier Blanc / Noir & Or.
7. `cd web && npx tsc --noEmit && npm run lint` clean; the reference visuals in `01-design-spec.md` are matched.

---

## PART G — Risks / gotchas
- **Don't** route the talent header through the agency `site-shell-flag.ts` path (it's off by default).
- `SiteHeaderComponent` brand/social reads are agency-tenant-scoped — re-scope to the talent or pass via props (else branding mis-scopes).
- Canonical migrations live in repo-root `supabase/migrations/`; `web/supabase/migrations` is a known stale-dir hazard.
- There is a known pre-existing field-engine `localeCompare` crash in the talent layout; unrelated to this work but may surface during QA.
- The carousel children allow-list currently excludes `split`/nested `carousel` — widen it if hero slides need columns.

## Appendix — primary files
- Slider: `builder-node/{types.ts,registry.ts,create.ts,render.tsx,carousel.tsx}`, `add-gallery/{registry-catalog-elements.ts,insert.ts,registry-db-merge.ts}`, `mvp-allow-list.ts`, `drop-policy.ts`
- Header/shell: `talent-site/{server/render-max-site.tsx,default-max-site-trees.ts,resolve-max-site-core.ts}`, `sections/site_header/*`, `sections/talent-personal-section-keys.ts`, `PublishedShell.tsx`, `app/token-presets.css`
- Inspector: `edit-chrome/inspector-dock.tsx`, `inspector-tab-config.ts`, `inspectors/builder-node-content.tsx`, `inspectors/kit/inspector-ui.tsx`, `inspectors/site-header/*`, `builder-node/prop-lock.ts`
- Lab/gallery: `app/(workspace)/platform/admin/builder-lab/page.tsx`, `components/builder-lab/*`, `builder-core/templates/{registry-actions.ts,catalog-overlay-actions.ts}`, `builder-core/config.ts`
