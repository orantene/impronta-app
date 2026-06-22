# Noir & Or — Builder Lab Block Handoff

Build every remaining block of the **Noir & Or** Impronta design (`web/public/impronta-mockup-3/`, live at `http://localhost:4522/`) as a **freeform BuilderNode composition** shipped as a **complete, drop-in "+" gallery component** via Builder Lab. Nothing is a monolithic fixed-prop block: every glyph, line, image, border, and color is a discrete, inspector-editable node on the single Page Builder Core render path.

Reference design: `web/public/impronta-mockup-3/index.html` + `web/public/impronta-mockup-3/assets/impronta.css`. Design spec/dev prompt: `web/public/impronta-mockup-3/handoff/01-design-spec.md` + `02-developer-prompt.md` (header/hero already covered there).

---

## 0. Shared principles (read first — they apply to every block)

1. **Freeform composition, never a fixed-prop block.** Each block is a tree of generic `BuilderNode`s (`container`, `split`, `card`, `heading`, `paragraph`, `image`, `button`, `cta_group`, `nav`, `social_links`, `divider`, `rich_text`, `icon`, `form`). On drop it explodes into individually selectable/editable nodes. Types: `web/src/lib/site-admin/builder-node/types.ts`. Per-kind policy: `registry.ts`. Factory defaults: `create.ts`. Render switch: `render.tsx` (`renderBuilderNodeElement`).

2. **Two packaging routes — both produce identical, fully-editable BuilderNode trees:**
   - **Composition preset (code, instant).** A factory in `composition-preset-factories.ts` + id/metadata/dispatch in `composition-presets.ts`. Surfaces automatically in the "+" gallery "Section pack" tab — `web/src/components/edit-chrome/inspectors/builder-node-content.tsx:2515` iterates `BUILDER_NODE_COMPOSITION_PRESETS` and filters by `rootKind`. **HARD CONSTRAINT: `rootKind` only accepts `container | split | accordion | card`** (`composition-presets.ts:65`). A section-rooted block must use a full-bleed `container` as its root, OR widen that union.
   - **Section template (code, the Hero Spotlight precedent — commit `52ba98bb6`).** A `build*()` function in `add-gallery/section-templates.ts` registered in `SECTION_TEMPLATE_BUILDERS` (`section-templates.ts:620`) + a catalog entry in `add-gallery/registry-catalog-sections-connected.ts`. Composed from `tpl*` helpers in `section-template-nodes.ts`. This is the **cleanest precedent** for an editorial section — copy it.
   - **Published DB template (no-code, owner-authored).** Author the same tree live in Builder Lab (`/platform/admin/builder-lab`), publish to `builder_templates`; `add-gallery/registry-db-merge.ts` unions it into the gallery. Use only when non-engineers must iterate copy/photos without a deploy.

3. **THE #1 BUILD HAZARD — free style-escape length caps (enforced by `registry.ts`, runs on insert via `validateBuilderNodeTree`).** Many spec'd CSS values **exceed the cap and will be silently rejected on drop** (the Lab preview does NOT catch this; the real "+" gallery does — this is exactly the lesson from the Hero Spotlight commit, which had to switch `clamp(74px,...)` to `16vh`). Verified caps:
   - `gap`, `maxWidthFree`, `width`, `height`, `top/right/bottom/left`, `flexBasis`, `paddingTop/Right/Bottom/Left` (the `*Free` per-side escapes), `marginTopFree…`, `lineHeight`, `letterSpacing`, `borderWidth`, `rotate`, `scale` → **max 16 chars**. So `"18px"`, `"4 / 5"`, `"100%"` pass; `"clamp(74px,10vw,158px)"` (22), `"clamp(260px,30vw,380px)"` (23) **FAIL**.
   - `fontSize` → max 32 (token-aware). `"clamp(2.8rem,4.8vw,4rem)"` (24) passes; keep clamps ≤32 chars.
   - `aspectRatioFree` → max 24; `gridColumn`/`gridRow` → max 24 (`"6 / span 3"` fine); `translate`/`transformOrigin` → 24/32.
   - `gridTemplateColumns`/`gridTemplateRows` → max 120 (`"repeat(12,1fr)"` fine; `"clamp(150px,19vw,200px)"` for `gridAutoRows`… **note `gridAutoRows` is not a first-class prop — verify it exists or route through `customCss`**).
   - `backgroundImage` → max 500 (gradients fine); `filter` → max 120; `transition` → max 120; `customCss` → **max 8000** (use this for anything long: clamp paddings, pseudo-elements, scrollbar styling, single-side borders).
   - **Rule of thumb:** any clamp() longer than 16 chars cannot go in a 16-cap prop. Put it in `customCss` (scoped per-node via `nodeScopedCss(node.id, css)`, `render.tsx:3002`) or pick a viewport-unit fallback (`16vh`, `7vw`).

4. **Theme-tokenized Noir & Or default.** Bind colors/fonts to token sentinels (`token:color.*`, `token:typography.heading-font-family`) so a tenant theme swap re-skins the block (`style-token-bindings.ts`; validated by `tokenAwareStyleString`). Ship the literal Impronta palette as the default values where a token does not exist: espresso `#100e13`, paper-2 `#161320`, ink `#ece4d3`, gold `#c6a14e`, champagne `#e0c074`, line `rgba(198,161,78,0.26)`. Display serif = Cormorant Garamond / Playfair; sans = Inter.

5. **Per-prop locking for governed surfaces.** Use `lockedProps` (`types.ts`) / catalog overlay (`builder_catalog_overlay`) to lock specific props per surface (e.g. lock the "Powered by Tulala" rich_text on tenant surfaces) while leaving everything else freeform.

6. **EN/ES on every text node** via the per-node i18n overlay — **VERIFIED working end-to-end**: `node.i18n` (`types.ts:42-49`) → normalized by `i18n-overlay.ts` (`normalizeNodeI18nOverlay`) → mirrored props.i18n→node.i18n in `validate.ts` (`BASE_NODE_FIELD_CARRIERS`) → resolved at render in `render.tsx:2779-2795` via `resolveLocalized`, threaded through `renderBuilderNodes(contentLocale)`. Localizable props: `builder-i18n-props.ts` (`heading.text`, `paragraph.text`, `rich_text.text`, `button.label`, `image.alt`). Seed `es` at author time so the ES site is never empty (mockup carries `data-en`/`data-es` on every string).

7. **Placeholder/seed imagery must be REAL editorial portraits, never initials-in-a-box** (durable user rule). `createImage(i)` seeds from `SAMPLE_IMAGES` (`create.ts:14`, remote Unsplash editorial URLs). Real local portraits exist under `web/public/marketing/photos/impronta-2026/portrait-*.jpg` and `web/public/talent-templates/demo/*/` — note these dirs are currently **untracked** (`git status` shows `??`); commit them if a block references them.

8. **Build-as-DRAFT, owner reviews before publish.** Build each block; do NOT publish to production-visible gallery until the owner has reviewed desktop + mobile screenshots. For the DB-template route, the publish gate `validateTemplateForPublish` (`builder-core/templates/validate-publish.ts`, wired as a hard block in `registry-actions.ts:514`) refuses any unresolvable data binding.

9. **Gate before every commit:** `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint`. Add a `create.test.ts` / `section-templates.test.ts` assertion for each new preset/template id so its required editable slots can never silently drop (`assertTemplateLayerLabels` already exists). A 0-error OOM-crashed tsc run is NOT clean.

10. **Screenshots desktop + mobile per block** before claiming done. Drop the block in the canvas, render it, capture 1440px and 390px. Confirm it renders theme-aware, inserts without schema errors, and the inspector can edit every node.

---

## 1. `featured-board` — Featured Faces / "The board, edited."

### Design summary
Editorial roster showcase. Split header (left: gold eyebrow "Selected talent" + Playfair H2 "The board, edited."; right: muted aside). An **asymmetric 12-col mosaic** of 8 face cards (`impronta.css` L144-164): card #1 spans 5col×4row (hero), cards #2–#8 are 3–4col×2row tiles via explicit `grid-column` starts. Each card = portrait (`object-fit:cover`, `brightness .92 sat 1.05`) + bottom-up dark veil + champagne Playfair index 01–08 + caption (name + city). Hover: image zooms `scale(1.05)` over 1.1s, gold border fades in, caption slides up 6px, uppercase city label fades 0→1. Whole card links to the model page. Centered "See all faces →". ≤760px → 2 cols with card #1 spanning 2×2. Reduced-motion kills transforms.

### Freeform composition
Root `container` (full-bleed, `style.containerType:"inline-size"`, section padding, dark bg). Children: (1) header `container` row→stack-on-mobile (left stack: eyebrow `paragraph` + H2 `heading`; right `paragraph` aside); (2) mosaic `container` with `style.gridTemplateColumns:"repeat(12,1fr)"` (14 chars, OK) and 8 explicit **Face Card** children, each a relative `container` (`overflow:hidden`, `hover.borderColor` gold) carrying its own `style.gridColumn`/`style.gridRow` (e.g. `"span 5"`, `"6 / span 3"` — ≤24 chars, OK), holding: absolutely-positioned `image` (`fieldBindings.src/alt`), Veil `container` (`backgroundImage` linear-gradient — ≤500, OK), Index `paragraph` (manual "01".."08" — positional, NOT roster-derived), Caption `container` (hover translateY) with name `heading` + city `paragraph`; (3) See-all `container` with a `button`/link.

**Cap warnings for this block:** `gridAutoRows: "clamp(150px,19vw,200px)"` (23 chars) — `gridAutoRows` is not confirmed as a first-class prop; route it through `customCss` (cap 8000) on the mosaic container. `aspectRatioFree:"4 / 5"` (5 chars) fine. The mosaic `gridTemplateColumns` and per-card `gridColumn`/`gridRow` are all within caps.

### Packaging
`rootKind:"container"` → composition preset is viable. Add `createFeaturedFacesBoardPreset()` to `composition-preset-factories.ts`, register `"featured-faces-board"` in `composition-presets.ts` (category `data`, dataMode `data-ready`). For the data-bound auto-grid fallback, set `dataBinding.repeat:true` on the mosaic container. Alternatively publish the 8-explicit-card asymmetric variant as a `builder_templates` row with `data_binding_requirements:["featured_talent_profiles"]`.

### Editable controls
Mosaic shape (`gridTemplateColumns`/per-card `gridColumn`+`gridRow`/responsive override to `repeat(2,1fr)`); card count (add/remove); per-card data mode; `maxItems`/`filterQuery` on the binding; all copy; per-node typography/color tokens; per-card hover (scale/borderColor/caption rise/city opacity); veil gradient; image treatment + priority (eager card #1, lazy rest); links; revealOnView stagger; section ground.

### API / backend integration
- **Roster data source `featured_talent_profiles` — VERIFIED REAL.** `FEATURED_TALENT_FIELDS` (`data-bindings.ts:81-88`: `displayName`, `primary/secondaryTalentTypeLabel`, `locationLabel`, `thumbnailUrl`, `href`). Server resolver `fetchFeaturedTalentForSection` (`sections/featured_talent/fetch.ts`) → `featuredTalentProfiles` (`homepage-cms-data-sources.ts:124-136`). Repeater path `renderRepeatContainerChildren` (`render.tsx:2376`) + `collectionRecordsForSource` (`render.tsx:2401`). **Mode 1 (manual) and Mode 2 (data-bound repeater) work.**
  - **⚠️ REFUTED — "hybrid per-slot binding" as the SHIPPED DEFAULT does NOT exist.** There is no index/offset field on `BuilderDataBinding` (only `{sourceKey, mode?, filterQuery?, maxItems?, repeat?}`); no `mode==="hybrid"` branch in the renderer (mode only drives advisory inspector findings); `{{field}}` resolves to live data ONLY inside a repeater's `items.map` (top-level `repeatItem` is `null`, so a standalone "explicit card" resolves `{{thumbnailUrl}}` to the literal fallback string). **DESIGN DECISION REQUIRED:**
    - **Option A (ship now):** 8 explicit cards in **manual mode** — operator types name/city, picks each image. Keeps the asymmetric grid. Zero backend. Default this on the gallery tile.
    - **Option B (ship now):** one card template + `repeat:true` on the mosaic — live roster data, but **clones share the template's grid placement** (loses the hand-placed asymmetry; renders as a uniform auto-grid). Ship as the secondary "auto grid" tile.
    - **Option C (real work, flag to owner):** to get live-data AND asymmetry, the binding layer needs a new per-slot index/offset selector (new field on `BuilderDataBindingProps` + a render branch in `render.tsx`). This is a genuine feature, not a config. **Do not claim it exists.**
- **Profile href — VERIFIED REAL.** `profileHrefForRepeat` (`render.tsx:2467`) emits `/t/<profileCode>`, used in `collectionRecordsForSource` (`render.tsx:2412`); `/t/[profileCode]` resolves by `profile_code` and transparently serves the Max site when one exists. Per-tenant prefixing via `prefixPublicHref` (`saas/public-hrefs.ts`).
- **Publish-time binding validation — VERIFIED REAL** (structural only). `validateTemplateForPublish` rejects unregistered `sourceKey`s; hard-blocked in `registry-actions.ts:514`. Caveat: it proves the source is *known*, NOT that a tenant has roster rows — a zero-roster tenant is not caught (the empty-data render path falls back to the template default once, never blanks).

### 2026 enhancements
`revealOnView:"fade-up"` stagger (eyebrow/H2/aside 0/0.08/0.16s, then incrementing per card); `containerType:"inline-size"` + @container reflow; fluid type via `fontSize` clamp (≤32 chars); per-card `view-transition-name` (via customCss) for card→detail morph; LCP — eager+`fetchpriority=high` ONLY on card #1, lazy 2–8; gate hover behind `@media (hover:hover)`; a11y — each card one focusable link named from `{{displayName}}`, index `aria-hidden`; reduced-motion guard already in the renderer.

---

## 2. `story-house` — The House / Story

### Design summary
Two-column editorial origin story. Left: 4:5 portrait (`brightness(0.92)`) inside a gold inset frame (`::after { inset:14px; border:1px solid rgba(224,192,116,0.45) }`). Right: gold eyebrow with a 30px gold hairline before it ("The house"/"La casa"), Cormorant display heading, muted paragraph (max 50ch), italic gold pull-quote (2px gold left border), signature block ("Impronta" champagne + uppercase "Founders, Tulum"). Grid 1.05fr/1fr, vertically centered, collapses to stack on mobile. Image side alternates L/R across instances. Source: `index.html` L144-156 + `about.html` L47-55; CSS L11-31, 49-53, 167-174.

> **Note:** the literal `story-house` does not exist in code — it maps to the mockup's `class="story"` / "The house" section. That is expected (it is authored from generic nodes), not a blocker.

### Freeform composition
Root `split` (`ratio:"60-40"` image-left / `"40-60"` image-right, `gap:"l"`, `collapseOnMobile:true`). **Build children explicitly so child[0]=media, child[1]=copy** (do not rely on tplSplitColumn's content-left default). Media column: a ghost `card` (the gold inset frame via `padding:"14px"` + `borderColor:"rgba(224,192,116,0.45)"` — 21 chars, but `borderColor` is `tokenAwareStyleString(64)`, OK) wrapping one `image` (`aspectRatioFree:"4 / 5"`, `objectFit:cover`, `filter:"brightness(0.92)"` — 20 chars, `filter` cap is 120 OK, `priority:false`). Copy column: eyebrow `paragraph` (gold hairline via `customCss` `:scope::before{…width:30px…}`), `heading` L2 (Cormorant token, `textWrap:balance`), description `paragraph` (tone muted, `maxWidthFree` — **"50ch" is 4 chars, OK**), pull-quote `paragraph` (italic; the single-side 2px gold left border via `customCss` since structured `borderWidth` is uniform), signature `container` with name + role `paragraph`s.

### Packaging
**Use the section-template route (Hero Spotlight precedent — cleanest fit).** Add `buildStoryHouse()` to `section-templates.ts` from `tpl*` helpers (`tplSplitColumn`, `tplCard`, `tplImageLayer`, `tplLabeledParagraph`, `tplTitle`, `tplDescription`); register `"story-house"` in `SECTION_TEMPLATE_BUILDERS`; add a `section({...})` catalog entry in `registry-catalog-sections-connected.ts` under the `about` category (model after `about-split`). For alternating sides, ship two builders (`story-house` 60-40, `story-house-image-right` 40-60) or two catalog tiles. Add `assertTemplateLayerLabels("story-house", ["Eyebrow","Title","Description","Pull Quote","Signature Name","Signature Role","Story Image"])` to `section-templates.test.ts`. No migration.

### Editable controls
Image (swap src/mediaId, alt, focal point, aspect, brightness, object-fit); gold inset frame (border + 14px inset = card padding, deletable); eyebrow (text/EN-ES/color/hairline on-off); heading (text/EN-ES/level/size/font/weight/balance); description (text/EN-ES/tone/max-width); pull-quote (text/italic/size/border, deletable); signature; layout (ratio/gap/alternate side/collapse); section bg/padding/reveal/parallax.

### API / backend integration
- **Story image — VERIFIED REAL** (manual `props.src` or media-library `props.mediaId`). `BuilderImageNode.props` (`types.ts:688-704`), render `case "image"` resolves `mediaId`→`mediaAsset.publicUrl` from `dataSources.mediaAssets`, falls back to `src` (`render.tsx:3423-3483`); optimizer via `builderImageSrcSet`. **Default to Option A (manual src to a real seed portrait), media-library swap via the inspector picker** (`builder-node-content.tsx:464`). Keep `priority:false` (below fold).
- **Copy + EN/ES — VERIFIED REAL** (manual text + per-node i18n overlay, see Shared Principle #6). No structured agency-story field exists, so the manual path is the realistic ship. Seed `es` on every text node.

### 2026 enhancements
`revealOnView` cascade (image + eyebrow→heading→para→quote→signature, 0/80/160/240/320ms); `parallax:'subtle'` on the framed image; image `hover.scale:"1.02"` with `overflow:hidden` on the frame; `containerType:'inline-size'` so columns collapse by slot width; heading `size:'display'` clamp is native; `priority:false`; shared `view-transition-name` across L/R instances; a11y real `<h2>`, author-required alt, decorative hairline; reduced-motion guarded.

---

## 3. `divisions` — Find your cast.

### Design summary
Full-bleed row of 5 tall portrait tiles (Women / Men / New Faces / Influence / Events), each linking to a filtered roster view. Eyebrow "Divisions" + serif H2 "Find your cast." then a `repeat(5,1fr)` grid (gap 12px) → `repeat(3,1fr)` tablet → `repeat(2,1fr)` mobile. Tile `aspect-ratio:3/4.4`, `overflow:hidden`, 1px transparent border→line on hover; image filled cover, resting `brightness(.85) saturate(1.04)`, hover `scale(1.06) brightness(1)` over 1.1s; bottom-up scrim; serif name + champagne uppercase index/arrow row "01 … →". Staggered reveal. Source: `index.html` L158-173 + CSS L176-185, 311-347.

### Freeform composition
Root `container` (stack) → section-head `container` (eyebrow `paragraph` + H2 `heading`) + tile-row `container` (layout grid; the columns enum caps at 4, so the 5-up needs `style.gridTemplateColumns:"repeat(5,1fr)"` — 13 chars, cap 120, OK — plus `style.responsive.tablet/mobile.gridTemplateColumns` for 3/2-up). Five `card` tiles, each (`aspectRatioFree:"3 / 4.4"` — 7 chars OK; `overflow:hidden`; `hover.borderColor` token:color.line; `justifyContent:flex-end`): `image` (cover, `filter:"brightness(.85) saturate(1.04)"` — 36 chars, `filter` cap 120 OK; hover colorize via card-scoped `customCss` since `filter` is not in the curated hover subset), scrim `container` (gradient `backgroundImage`), label `container` (name `heading` L3 + index/arrow row `container` with two `paragraph`s), and an invisible full-tile `button` (`position:absolute, inset:0, opacity:0, zIndex:3`, label "Open Women", carrying the href).

### Packaging
`rootKind:"container"` → composition preset. Add `createDivisionsRowPreset()` to `composition-preset-factories.ts` (mirror `createGalleryStripPreset`), register `"divisions-row"` in `composition-presets.ts` (category `data`), add the dispatch case. Surfaces in the gallery automatically. DB-template alternative for owner-tuned copy/photos/hrefs.

### Editable controls
Eyebrow/H2 text + EN/ES; tile count; per-tile image (src/mediaId) + alt; per-tile name (+es) + href; per-tile index + arrow + champagne color; columns per breakpoint + 12px gap; aspect ratio; resting filter + hover colorize/zoom (card-scoped customCss); scrim gradient; hover border; label typography + token bindings; reveal stagger.

### API / backend integration
- **⚠️ Tile click-through to a FILTERED roster view — REFUTED / UNIMPLEMENTED.** The reference `/roster?div=women` is **prototype-only HTML**; `grep "div=" web/src` returns 0. The canonical directory filter contract (`lib/directory/search-params.ts`) has NO `div` and NO gender/division facet — an unknown `div` is silently dropped. The public `/directory` route accepts no such param; there is no public `/roster` route. **DESIGN DECISION REQUIRED:**
  - **Option A (ship now):** each tile's button href points at the existing public directory/roster page using a filter param that page **actually supports** — verify the live key in `lib/directory/search-params.ts` + `DirectoryReactiveResults.tsx` before wiring. Operator sets the 5 hrefs. Zero backend.
  - **Option B (real work, flag to owner):** add a division/gender facet — a new param in `search-params.ts`, the directory resolver, and the roster route, plus a `tenant_directory_search`-bound repeater to generate tiles from taxonomy. This is genuine backend work; do not claim it exists.
- **⚠️ Portrait imagery from `impronta-2026` set — REFUTED as wired.** Those portraits live ONLY in untracked HTML mockups; `create.ts` `SAMPLE_IMAGES` seeds from remote Unsplash, and `demo-assets.ts` has no divisions concept. **Default: seed `createImage(i)` (Unsplash editorial) OR commit + reference the local `marketing/photos/impronta-2026/portrait-*.jpg` set, then swap via media library.** Do not assume the local set is already wired. Also note: the in-app `destinations_mosaic` default seed has zero `imageUrl` (renders text-only boxes) — do not reuse its defaults.
- **EN/ES division names — VERIFIED REAL** via the i18n overlay (Mujeres/Hombres/Caras Nuevas/Influencia/Eventos; Divisiones; Encuentra tu cast.). Seed in the preset factory.

### 2026 enhancements
`revealOnView:'fade-up'` stagger (0/80/160/240/320ms); container-query label scale; clamp() type; `parallax:'subtle'`; per-tile `view-transition-name`; LCP — below fold, keep `priority` unset (lazy), ship sized assets to avoid CLS; reduced-motion gate hover zoom/filter behind `@media (prefers-reduced-motion: no-preference)` in card customCss; a11y — full-tile link with accessible name ("Open Women"), arrow decorative.

---

## 4. `campaigns-lookbook` — Campaigns & lookbook rail

### Design summary
Horizontal-scroll "recent work" rail. Flex-end section head (left: gold eyebrow "Recent work" + italic-capable serif H2 "Campaigns & lookbooks." max 16ch; right: muted aside max 38ch). Rail = horizontal flex track (gap 18px, `overflow-x:auto`, `scroll-snap-type:x mandatory`, 3px gold scrollbar thumb), six cards `flex:0 0 clamp(260px,30vw,380px)`, `scroll-snap-align:start`. Each card = 4:5 media frame (cover, `brightness(0.9)`) + caption row (brand serif 1.35rem left / season 10px uppercase champagne right, gold-hairline bottom border). Hover `scale(1.05)` + brightness 0.9→1 over 1s. Reveal stagger. Source: `index.html` L175-193 + CSS L187-197.

> **Note:** `campaigns-lookbook` does not exist in code; it is a planning label. Build from generic nodes.

### Freeform composition
Root `container` (`htmlTag:"section"`, stack). Section head `split` (60-40, `alignItems:flex-end`): left stack (eyebrow lockup `container` row = `divider` 30px gold + `paragraph` "Recent work"; `heading` L2 — note `maxWidthFree:"16ch"` (4 chars OK), `marginTopFree:"18px"` (5 chars OK)) + right `paragraph` aside (`maxWidthFree:"38ch"` OK). Rail `container` (layout row; `overflow:scroll`; `scrollSnapType` — **verify this is a first-class prop; if not, route via customCss**; `gap:"18px"` OK; `flexWrap:nowrap`; 3px gold scrollbar + `scrollbar-width:thin` via `customCss`, cap 8000). Children = N campaign `card`s: **⚠️ `flexBasis:"clamp(260px,30vw,380px)"` (23 chars) EXCEEDS the 16-cap — put the basis clamp in `customCss` or use a shorter value**; `scrollSnapAlign:"start"`; media-frame `container` (`aspectRatioFree:"4 / 5"`, `overflow:hidden`) wrapping one `image` (cover, `filter:"brightness(0.9)"` OK, hover scale, `priority:false`); caption row `container` (space-between, baseline, gold hairline bottom) with brand + season `paragraph`s (+ es overlay).

### Packaging
Composition preset (`rootKind:"container"`). Add `createCampaignsLookbookRailPreset()` mapping the 6 reference campaigns to card subtrees (seed `createImage(i)`), register `"campaigns-lookbook"` in `composition-presets.ts` (category `story`, `dataMode:"data-ready"`), add dispatch case + `create.test.ts` round-trip assertion. DB-template alternative for no-code iteration.

### Editable controls
Eyebrow + gold hairline; heading (font/size/italic/balance/max-width); aside; rail (gap/snap/overflow/padding/flex-wrap); gold scrollbar via customCss; per-card width/snap/radius; 4:5 frame; per-card image (src/mediaId/focal/brightness/hover/transition); brand + season text/fonts/colors; caption row; add/remove/reorder/duplicate cards; reveal stagger; per-card href; EN/ES; responsive overrides.

### API / backend integration
- **Card content source — VERIFIED infra, but NO campaign data source exists.**
  - **Option A (recommended default):** 6 static editable cards seeded from `createImage()`. Zero backend. Swap photos via the **VERIFIED-REAL media library** (`image.props.mediaId` → `listBuilderImageMediaAssets` reads `media_assets` scoped by tenant + approved, `media/assets.ts:367`; injected via `PublishedShell.tsx` + `homepage-cms-data-sources.ts`).
  - **Option B (reuse existing `cms_posts`):** `dataBinding {sourceKey:'cms_posts', mode:'bound', repeat:true}` on the rail, first card as template — clones per published journal post (title→brand, excerpt/publishedAt→season, coverUrl→image, href→link). No new schema. **VERIFIED `cms_posts` is a registered source.**
  - **Option C (reject for now):** a dedicated `campaigns` entity (`BUILDER_DATA_SOURCE_REGISTRY` key + resolver + migration). **REFUTED as existing** — genuine new backend; defer unless owner asks.
- **Per-card link — VERIFIED REAL only for enumerated sources.** Manual href works (any URL). Auto-resolved campaign-detail href is **REFUTED** (no campaign route). Bind to `cms_posts` for post permalinks, or `featured_talent_profiles` for talent deep-links.

### 2026 enhancements
`scroll-padding-inline-start` + `overscroll-behavior-x:contain` (customCss); `parallax:'subtle'` per card; `revealOnView:'fade-up'` stagger; clamp type + `textWrap:'balance'`; `containerType:'inline-size'` + container-query flexBasis; cross-doc view-transitions on linked cards; `priority:false`; a11y rail `aria-label`, keyboard-operable snap, per-image alt; gold scrollbar as an intentional detail.

---

## 5. `testimonials` — Trusted on set.

### Design summary
Full-width dark band (`espresso #100e13`, text `#ece4d3`). Left section head: champagne eyebrow "Kind words" (with 30px gold hairline) + Cormorant H2 "Trusted on set." Trio = 3-col grid (gap 18px) → 1 col ≤760px. Each `.quote` card: 1px gold-hairline border, padding 38/32, hover → bg `#17141c`, lift `translateY(-5px)`, gold border, .5s ease. Big gold quote mark (Cormorant 4rem, clipped to 28px height), italic Cormorant body 1.4rem, attribution (name champagne uppercase + role muted uppercase, `margin-top:auto`). Reveal stagger. Source: `index.html` L194-220 + CSS L199-211.

### Freeform composition
Root `container` (`htmlTag:"section"`, dark bg, `paddingTop`/`paddingBottom` — **⚠️ `clamp(74px,10vw,158px)` exceeds 16-cap; use customCss or a viewport unit like `16vh`**). Inner wrap `container` (`maxWidthFree` — "1440px" is 6 chars OK). Section head: eyebrow `paragraph` (the 30px hairline via customCss or a sibling `divider`) + H2 `heading`. Trio `container` (grid columns:3, `gap:"18px"`, responsive tablet 3 / mobile stack). Three `card`s (variant outline): border + padding via per-side `paddingTop/Left…` (escapes ≤16; "38px"/"32px" OK), `hover.backgroundColor:"#17141c"`, `hover.translate:"0 -5px"` (6 chars OK), `hover.borderColor` gold, `transitionDuration:".5s"`, `revealOnView:"fade-up"` + staggered `revealDelay`; children: quote-mark `heading` L3 ("“", Cormorant 4rem, `height:"28px"` + overflow hidden — note `height` cap 16, "28px" OK), italic body `paragraph` (+es), attribution `container` (`marginTopFree:"auto"` — 4 chars OK) with name + role `paragraph`s (+es).

### Packaging
Composition preset. Add `createTestimonialsTrioPreset()` + a private `createQuoteCard(...)` helper to `composition-preset-factories.ts` (alongside the existing `createTestimonialCardPreset`). Register `"testimonials-trio"` in `composition-presets.ts` (category `trust`, dataMode `starter`), add dispatch case, add an `el({...})` gallery entry in `registry-catalog-elements.ts`. DB-template alternative.

### Editable controls
Section bg + dark/light flip; eyebrow + hairline; headline; trio columns + gap + breakpoints; add/remove/reorder cards; per-card border/padding/radius/fill; per-card hover (lift/bg/gold border/timing); quote-mark glyph/size/color/clip; body (text/italic/size/line-height/color); attribution; reveal stagger; EN/ES.

### API / backend integration
- **Manual editorial quotes (DEFAULT) — VERIFIED REAL and correct.** Quotes are static heading/paragraph nodes (matching `createTestimonialCardPreset` / the curated `testimonials_trio` section, which is `items[]` with NO data binding). There is NO backend testimonials source and **none is required**. EN/ES via the i18n overlay.
- **Optional data-bound collection — REFUTED as existing.** A `cms_testimonials` source would need a new `BUILDER_DATA_SOURCE_REGISTRY` key + resolver + a backing table/migration. Defer unless the owner wants CMS-managed quotes; the manual path ships the identical visual today.

### 2026 enhancements
`BuilderNodeHoverStyle` lift (translate/bg/border) + `.5s` cubic-bezier (GPU transform/opacity only); `revealOnView:'fade-up'` + staggered delay (reduced-motion safe); `containerType:'inline-size'` + container-query 3→1; clamp headline (`size:'display'`); `view-transition-name` if cards link to a case-study page; text-only (no LCP cost); a11y `htmlTag:'section'`, decorative quote mark off the heading outline, verify muted role color contrast on hover bg; `textWrap:'pretty'` body / `'balance'` headline; token-bind colors so the block recolors per tenant.

---

## 6. `stats` — By the numbers

### Design summary
Single editorial proof row of 4 stats divided by gold hairlines on the warm ground (NOT a filled card). 4-col grid, 1px gold hairline on top of the band + 1px gold hairline on the right of each item except the last. Each item = big Playfair number (`clamp(2.8rem,4.8vw,4rem)`, an inner em italic+champagne for the "+", "/", or italic year) over a tiny uppercase Inter label. Items: "120+ Faces represented", "6 Cities on call", "2019 Established", "EN / ES Bilingual booking". 4-up → 2×2 ≤1024 → 2-up ≤760. Source: `index.html` L223-231 + CSS L214-219.

### Freeform composition
Root `container` (layout grid, columns:4, `htmlTag:"section"`; top hairline via `borderColor` token + a root `customCss` for the single top rule; responsive tablet/mobile columns:2). Each of 4 stat-cell `container`s (stack; right hairline via `borderColor`+`paddingRight`+per-cell `customCss border-right`, removed on last; `paddingTop:"30px"` OK): number `heading` L2 (Playfair token, `fontSize:"clamp(2.8rem,4.8vw,4rem)"` — **24 chars, `fontSize` cap 32, OK**, `lineHeight:"1"` OK); the italic-champagne accent ("2019") = `fontStyle:italic`+champagne, and for "120+"/"EN / ES" wrap the number in a child row `container` of heading "EN" + heading "/"(italic champagne) + heading "ES"; label `paragraph` (`fontSize:"10.5px"`, `letterSpacing:"0.24em"` — 7 chars OK, `marginTop:"14px"`).

### Packaging
Composition preset. **Do NOT mutate the existing `stat-band` preset** (3-up, centered, filled — pages depend on it). Add a NEW id `"stat-band-editorial"` (or `"by-the-numbers"`): add the literal to `BuilderNodeCompositionPresetId`, metadata entry, `createStatBandEditorialPreset()` + `createEditorialStat(number, accent, label)` helper, and the dispatch case. Category `trust`. No-code alternative via Builder Lab → `builder_templates`; catalog overlay sets per-surface visibility/locks.

### Editable controls
Per-stat number + accent glyph (italic-champagne on/off); per-stat label + EN/ES; add/remove/reorder cells; column count + responsive; hairline color/width/style + top/right on-off; number typography; label typography; band spacing/width; per-cell align; theme cascade; per-node/per-prop locks; reveal stagger + optional count-up.

### API / backend integration
- **Auto-derive numbers from live data — NEEDS-CHECKING / genuine work.**
  - **Option A (default, recommended v1):** manual numbers (matches the reference's fixed editorial figures). Zero backend.
  - **Option B (real work, flag to owner):** bind the number heading via `fieldBindings.text` to a NEW stats-aggregate resolver (roster count via `loadTalentCardThumbs`, distinct cities, earliest established year). Requires a new resolver in the data layer + render wiring. Design B/C as a follow-on so a stale "120+" can't outlive the real count; **do not claim it exists.**

### 2026 enhancements
`revealOnView:'fade-up'` stagger; optional count-up via per-node customCss `@property` tween (reduced-motion → instant); `containerType:'inline-size'` reflow 4→2→1; native clamp type; text-only (no LCP cost); a11y `htmlTag:'section'` + real heading+paragraph so SRs read "120 plus, Faces represented", decorative "/" separator; hairlines via `borderColor` token; stable node ids for view transitions.

---

## 7. `cta-banner` — Leave your imprint.

### Design summary
Full-bleed pre-footer conversion banner. Cover lifestyle image (`object-position center 35%`, `brightness 0.7`) under a top-down dark scrim + inset 1px champagne hairline frame. Centered white stack: champagne eyebrow "Work with Impronta", display serif H2 "Leave your imprint." ("imprint." italic champagne, `clamp(2.8rem,6.4vw,5.8rem)`), muted copy (max 46ch), centered wrap-enabled dual CTA: gold filled "Cast Impronta →" + outline "Get scouted". Reveal stagger. Both CTAs must reach real backends.

### Freeform composition
Root `container` full-bleed (`position:relative`, `overflow:hidden`; **section padding clamp exceeds 16-cap → use customCss or `16vh`**). Layering: absolutely-positioned `image` (`inset:0`, cover, `objectPosition:"center 35%"` — 11 chars, `objectPosition` cap 40 OK, `filter:"brightness(0.7) saturate(1.05)"` cap 120 OK, `zIndex:-1`, `priority:true` — this is likely the LCP) + scrim `container` (gradient `backgroundImage` cap 500 OK, `pointerEvents:none`) + content `container` (relative, `zIndex:2`, centered, `textColor:#fff`; inset hairline via `customCss ::before{inset:clamp(18px,3vw,40px);border:1px solid…}`). Content children: eyebrow `paragraph`; display line as a row `container` (flexWrap) of two `heading`s ("Leave your" white + "imprint." italic champagne) so each word is editable; copy `paragraph` (`maxWidthFree:"46ch"` OK); `cta_group` with button A (gold gradient `backgroundImage` OK, optional trailing `icon`) + button B (outline, `hover.backgroundColor:#fff`).

> **Cap note:** `clamp(2.8rem,6.4vw,5.8rem)` is 26 chars — `fontSize` cap is 32, OK. But put it on `fontSize`, not a 16-cap prop.

### Packaging
**`rootKind` must be `container` (not `section`)** — the preset union excludes `section`. Add `createCtaBannerSpotlightPreset()`, register `"cta-banner-spotlight"` (category `conversion`, dataMode `starter`, rootKind `container`), add dispatch case, surface via `registry-catalog-elements.ts`. Alternatively the existing curated `cta_banner` section (with `backgroundMediaAssetId`/`overlayOpacity`/CTAs) can drop as a `section_embed` for a config-driven non-freeform variant. DB-template route for owner-curated per-tenant variants.

### Editable controls
Background image (src/mediaId/focal/filter); scrim color+opacity; inset hairline; eyebrow; headline per-word (white + italic champagne); copy + max-width; primary CTA (label/href/gold gradient/arrow/hover); secondary CTA (label/href/outline/fill-on-hover); CTA row layout; vertical rhythm; responsive overrides; hover + focus-visible; reveal stagger; EN/ES on every text node.

### API / backend integration — both CTAs MUST reach real backends (do not ship dead anchors)
- **Primary "Cast Impronta" → booking/inquiry — VERIFIED infra.**
  - **Option A (default):** href → `/directory` (opens the in-header inquiry cart) or a talent profile that funnels into `submitInquiry`/`createInquiryFromIntent`. **⚠️ A raw `/contact` default is a dead end on tenant hosts — point at `/directory` or a real inquiry route.**
  - **Option B:** drop the `booking_widget` section_embed (`section-embed-presets.ts`) beneath the banner.
  - **Option C (richest):** inline `form` node → `/api/cms/forms/submit` → `decideFormRouting` → `createInquiryFromIntent` (creates a real inquiry, source `agency_site`). **VERIFIED this route exists.**
- **Secondary "Get scouted" → talent application — VERIFIED infra (registration), one path is real new work.**
  - **Option A (default):** href → the existing per-tenant talent registration modal / cross-domain SSO signup (`join_register` + tenant registration engine); applications land at `/(workspace)/[tenantSlug]/admin/roster/applications`.
  - **Option B:** drop the `join_register` section as a section_embed (variant `banner`).
  - **Option C (NEW backend — flag to owner):** a bespoke scout `form`. Today `/api/cms/forms/submit` only branches inquiry vs plain submission — a true scout-application pipeline (insert into the roster applications table) would need `decideFormRouting` extended with a `roster_application` mode. **Do not claim this exists.** Default to A/B (the applications backend already exists).
- **Background from media library — VERIFIED REAL** via `image.props.mediaId` (or `backgroundMediaAssetId` if using the curated section_embed).

### 2026 enhancements
`revealOnView:'fade-up'` stagger (0/.08/.16/.24s); `parallax:'subtle'` on the bg image; clamp type + clamp rhythm (via customCss); `containerType:'inline-size'` so the CTA row collapses by slot width; **LCP — `image.props.priority:true`** (eager + fetchpriority high), scrim as CSS gradient (no request), AVIF/WebP asset; hover micro-interactions (gold CTA lift + arrow nudge, outline fills); `view-transition-name` into the booking surface; a11y `htmlTag:'section'` + aria-label, AA contrast via tunable scrim, real `<a>`/`<button>` + focus-visible, decorative bleed image alt; reduced-motion guarded; champagne accent + gradient stops as theme tokens.

---

## 8. `footer` — Editorial site-shell footer

### Design summary
Dark espresso (`#100e13`) full-width footer. Top zone = 4-col asymmetric grid (`1.6fr 1fr 1fr 1fr` → 2-col ≤900px → 1-col ≤640px). Col 1 = oversized champagne Cormorant wordmark "IMPRONTA" + muted tagline (max 34ch). Cols 2–4 = link stacks under tiny uppercase champagne eyebrows "Agency / Studios / Connect", muted links → champagne on hover. Gold hairline separates a bottom bar (flex space-between, wrapping): "© 2026 Impronta Models" / EN-ES toggle (champagne active) / "Powered by Tulala" (Tulala champagne). All tiny uppercase tracked caps. Connect column doubles as the social home. Source: `index.html` + CSS `.foot*`.

### Freeform composition
Root `container` (`htmlTag:"footer"`, espresso bg, top gold border, `paddingTop` — **clamp exceeds 16-cap → customCss or `9vh`**). Inner wrap `container`. Child A top-zone `container` (grid; `gridTemplateColumns:"1.6fr 1fr 1fr 1fr"` — 19 chars, cap 120 OK; `gap:"40px"` OK; bottom hairline; responsive tablet `"1fr 1fr"` / mobile `"1fr"`): col 1 (wordmark `heading` L2 Cormorant champagne `fontSize` clamp + tagline `paragraph` `maxWidthFree:"34ch"` OK +es); cols 2–4 (eyebrow `heading` L4 + a `nav` node with `ariaLabel`, per-link i18n + hover color); col 4 also a `social_links` node + a `nav` with the Bookings link. Child B bottom-bar `container` (row, space-between, flexWrap, tiny caps): "© 2026…" `paragraph`; EN/ES toggle `cta_group` of two `button`s (active champagne, href `?lang=en`/`?lang=es`); "Powered by Tulala" `rich_text` (Tulala in a champagne `<em>`).

### Packaging
Two routes. **Primary — composition preset:** add `"footer-editorial"` id (rootKind `container`), `createFooterEditorialPreset()` factory (makeId + create helpers + literal `nav`/`social_links`/`rich_text` objects, responsive + i18n.es baked in), dispatch case. **Secondary — published DB template** with the **`shell` gallery tab** (`add-gallery/types.ts` `AddGalleryTab "shell"`) so it lands on the site-shell surface; `registry-db-merge.ts` unions it. Match the node-id conventions of `buildShellFooterFreeformChildren` (`shell-builder-tree.ts`) so a tenant editing the shell sees consistent structure. Catalog overlay locks the "Powered by Tulala" rich_text on tenant surfaces.

### Editable controls
Wordmark text/font/size/tracking/color; tagline + EN/ES + max-width; column eyebrows; per-column nav links (add/remove/reorder/relabel/retarget + per-link es + hover color); social platforms/hrefs (or bind `workspace_social_links`); grid ratio + gap + 2 breakpoints; gold hairline color/width; bg + text tones; EN/ES toggle labels/active color/hrefs; © line; "Powered by Tulala" rich_text + champagne em; paddings/hover/reveal.

### API / backend integration
- **EN/ES toggle — VERIFIED REAL** via per-node i18n overlay; toggle buttons set the locale (lang query param/cookie), renderer resolves overlays. Buttons are plain `button` nodes (fully editable).
- **Social links — VERIFIED REAL.** Option A static `social_links.links[]`; Option B `dataBinding sourceKey:workspace_social_links` (server passes tenant socials from `agency_business_identity` via `resolveShellSocialContact`), static links as fallback. `buildShellFooterFreeformChildren` already mints `social_links`.
- **Column links auto-populated — VERIFIED REAL (optional).** Option A manual `nav.links[]` (matches mockup); Option B `nav.dataBinding sourceKey:cms_page` for a live sitemap column, static fallback.
- **"Powered by Tulala" lock — VERIFIED REAL.** Stamp `lockedProps` on the rich_text (or set via `builder_catalog_overlay`) so it is read-only on tenant surfaces, no migration.

### 2026 enhancements
Fluid type via clamp (wordmark on `fontSize` ≤32; paddings via customCss); `revealOnView:'fade-up'` stagger per column; link/social/toggle hover → champagne with `transition color .3s` + focus parity; `containerType:'inline-size'` 4→2→1 by footer width; semantic `htmlTag:'footer'` + per-column nav `ariaLabel`, toggle `aria-pressed` for active locale; below-fold (no priority, pure text/SVG — CLS 0); gold hairlines via `borderColor` token; optional `parallax:'subtle'` on the wordmark; reduced-motion guarded.

---

## 9. `marquee` — Disciplines ticker (scrolling strip)

### Design summary
Full-width dark band (espresso `#100e13`) with one row of Cormorant/Playfair-italic words separated by gold "/" glyphs, scrolling left forever (~38s linear, `translateX(0 → -50%)` with the content duplicated for a seamless loop), pausing on hover; 1px gold hairline top + bottom. Words `clamp(1.5rem,2.6vw,2.3rem)`, opacity ~.95, slash is gold. Default items: RUNWAY / EDITORIAL / CAMPAIGN / LOOKBOOK / E-COMMERCE / FITNESS / HOSPITALITY / EVENTS. Source: `index.html` `.marquee` block + CSS `/* marquee */`. Reduced-motion → static centered row.

### Freeform composition
Root `container` (`htmlTag:"section"`, full-bleed, dark bg token, top+bottom `borderColor` gold, `overflow:hidden`, `containerType:"inline-size"`). One inner "track" `container` (layout row, `gap`, no-wrap, `width:max-content`) carrying the scroll via the node's `customCss` (`@keyframes` translateX 0→-50% + `animation ~38s linear infinite`; `:hover{animation-play-state:paused}`; `@media (prefers-reduced-motion){animation:none}`). The track holds the ITEMS as discrete children — a `heading`/`paragraph` per word + a small gold `paragraph`/`icon` "/" separator between — so the editor can scroll WORDS, ICONS, or IMAGE LOGOS, never a fixed string. For the seamless loop, duplicate the item set twice inside the track. Each word and each separator is its own editable node.

**Cap note:** the `@keyframes` + `animation` MUST go in the node's `customCss` (8000-char cap) — NOT in `transition`/`filter` (120-char caps). That's the only safe place for keyframes.

### Packaging
Composition preset. Add id `"marquee-ticker"` to `BuilderNodeCompositionPresetId` + metadata + `createMarqueeTickerPreset()` (seeds section→track→duplicated word/separator children) + dispatch case. Category `layout`. No-code alternative: Builder Lab → `builder_templates` + catalog overlay. Reuse the existing curated `marquee` section ONLY if it already nests freeform children — verify; if it's a fixed `items[]` prop block, do NOT use it (that's the monolith trap), build the freeform preset.

### Editable controls
Item list (add/remove/reorder words/icons/logos, each freeform + EN/ES); separator glyph (slash/dot/diamond/none/custom) + color; scroll speed/duration; direction (L/R); gap; font family/size/style; band bg + text color (tokens); top/bottom hairline on/off + color; pause-on-hover on/off; band height/padding; reduced-motion fallback.

### API / backend integration
None — pure presentation, manual content. (Optional future, flag only if asked: bind the item list to a tenant "disciplines/specialties" taxonomy via `fieldBindings`. Not in the reference.)

### 2026 enhancements
GPU `transform` marquee (not `margin`/`left`); `prefers-reduced-motion` static fallback; duplicate-and-translate seamless loop; `containerType:'inline-size'`; pause on hover + focus; `aria-hidden` on the duplicate copy so SRs read the words once; supports logo/image nodes for a client/brand ticker; stable node ids for view transitions.

---

## Build order
*(plus **`marquee`** — trivial freeform ticker, no backend; build any time as a warm-up.)*
1. **`footer`** — site-shell closer; lowest backend risk (everything VERIFIED); establishes the `nav`/`social_links`/`rich_text` + i18n + shell-tab pattern reused elsewhere.
2. **`testimonials`** — pure freeform, manual content VERIFIED, no backend; fastest win after footer; locks in the dark-band + hover-card + reveal pattern.
3. **`stats`** — text-only, manual numbers VERIFIED; tiny; exercises the new-preset-without-mutating-existing rule (`stat-band-editorial`).
4. **`story-house`** — section-template route (Hero Spotlight precedent), image + i18n both VERIFIED; introduces the `split` + media-frame + customCss-hairline pattern.
5. **`campaigns-lookbook`** — freeform rail; manual default VERIFIED, `cms_posts` bind available; surfaces the flexBasis cap hazard.
6. **`cta-banner`** — both CTA backends need a routing decision (VERIFIED infra, one path = real work); LCP/priority matters; do after the simpler blocks.
7. **`divisions`** — click-through filter is REFUTED/unimplemented; needs an owner decision on Option A (existing filter param) vs Option B (new facet) before it is truly "done".
8. **`featured-board`** — most complex; the "hybrid per-slot" default is REFUTED, so it needs an owner decision (manual asymmetric vs auto-grid repeater vs build the per-slot feature). Build last with the chosen mode.

## Acceptance criteria (per block)
- Drops from the "+" gallery as a fully freeform BuilderNode tree; every node selectable/editable in the inspector (no monolithic fixed-prop block).
- Inserts with **zero schema/validation errors** — all free style escapes within their `registry.ts` caps (the Lab preview won't catch overruns; test in the real "+" gallery).
- Renders theme-aware (token-bound colors/fonts) with the Noir & Or palette as defaults; EN and ES both resolve.
- Seed imagery is real editorial portraits, never placeholder boxes.
- All hrefs reach a real surface (no dead `/contact` on tenant hosts); any unverified/REFUTED backend is flagged to the owner with concrete options, not silently faked.
- `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint` clean; a preset/template-id assertion test added.
- Desktop (1440px) + mobile (390px) screenshots captured and attached for owner review.
- Built as DRAFT; owner reviews before any production-visible publish.