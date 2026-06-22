# Master Prompt — Build all Noir & Or blocks as freeform gallery components

Paste the block below into a new build chat (a Claude Code session on this repo).

---

You are building the blocks of the Noir & Or Impronta homepage design as freeform, gallery-ready components in the existing Page Builder Core. This is a real, shipping multi-tenant Next.js + Supabase app. Work local-first off `main` on a feature branch; do NOT commit to `main`.

START BY READING:
1. web/public/impronta-mockup-3/handoff/08-all-blocks-freeform.md — one section per block with the exact freeform composition, packaging route, editable controls, VERIFIED-vs-REFUTED backend integration points, and 2026 enhancements. This is the source of truth.
2. web/public/impronta-mockup-3/handoff/01-design-spec.md + 02-developer-prompt.md (header + hero, incl. the freeform-carousel correction) + 03-placeholder-images.md (placeholder image URLs).
3. The reference design: web/public/impronta-mockup-3/index.html and assets/impronta.css (live at http://localhost:4522/). This is the exact visual target.
4. The just-merged precedent — commit 52ba98bb6 ("add Hero Spotlight section") — `git show 52ba98bb6`. Copy its 2-file pattern for section templates.
5. Core builder files: web/src/lib/site-admin/builder-node/{types.ts,create.ts,registry.ts,render.tsx,composition-presets.ts,composition-preset-factories.ts}; web/src/lib/site-admin/add-gallery/{section-templates.ts,section-template-nodes.ts,registry-catalog-sections-connected.ts,registry-catalog-elements.ts,registry-db-merge.ts,types.ts}.

BLOCKS (build in this order): marquee (trivial warm-up), footer, testimonials, stats, story-house, campaigns-lookbook, cta-banner, divisions, featured-board.

HARD RULES:
- Every block is a FREEFORM BuilderNode tree (generic container/split/card/heading/paragraph/image/button/cta_group/nav/social_links/divider/rich_text/icon). NEVER a monolithic fixed-prop block. On drop it must explode into individually editable nodes on the single render path.
- Ship each as a COMPLETE drop-in "+" gallery component. Composition preset (rootKind only accepts container|split|accordion|card — a section-rooted block uses a full-bleed container root) registered in composition-presets.ts, OR a section template registered in SECTION_TEMPLATE_BUILDERS + registry-catalog-sections-connected.ts (Hero Spotlight pattern), OR a Builder-Lab-published builder_templates row. Pick per the handoff.
- WATCH THE FREE STYLE-ESCAPE LENGTH CAPS in registry.ts — enforced on insert by validateBuilderNodeTree; the Lab preview does NOT catch overruns (the real "+" gallery does). gap/maxWidthFree/width/height/top/right/bottom/left/flexBasis/per-side paddingFree/margins/lineHeight/letterSpacing/borderWidth = max 16 chars; fontSize = 32; aspectRatioFree/gridColumn/gridRow = 24; gridTemplateColumns/Rows = 120; backgroundImage = 500; filter/transition = 120; customCss = 8000. Any clamp() longer than the prop's cap MUST go in customCss (scoped per node) or use a viewport-unit fallback. #1 build hazard. (Marquee @keyframes/animation also go in customCss.)
- Theme-tokenize colors/fonts (token:color.*, token:typography.heading-font-family) with the literal Noir & Or palette as defaults (espresso #100e13, paper-2 #161320, ink #ece4d3, gold #c6a14e, champagne #e0c074, line rgba(198,161,78,0.26); Cormorant/Playfair + Inter).
- EN/ES on every text node via the per-node i18n overlay (seed `es` at author time). Verified working end-to-end.
- Seed imagery = REAL editorial portraits (createImage(i) Unsplash defaults, or commit + reference web/public/marketing/photos/impronta-2026/ or /talent-templates/demo/model/). NEVER initials-in-a-box.
- Use per-prop locking (lockedProps / catalog overlay) only where the handoff says (e.g. lock "Powered by Tulala").

API/BACKEND — FLAG, DO NOT FAKE. Present the handoff's DESIGN OPTIONS and loop in the owner before real backend work:
- featured-board: the "hybrid per-slot binding" default does NOT exist. Choose manual-asymmetric (ship now) OR auto-grid repeater (ship now) OR flag building the per-slot feature. Do not claim hybrid exists.
- divisions: tile click-through to a filtered roster (?div=) is UNIMPLEMENTED. Use a directory filter param the page actually supports (verify in lib/directory/search-params.ts + DirectoryReactiveResults.tsx), or flag adding a division facet as real work.
- cta-banner: both CTAs must reach real backends — primary to /directory or createInquiryFromIntent (NOT a dead /contact); secondary to the existing registration modal/join_register (a bespoke scout form needs a new roster_application routing mode — flag it).
- campaigns-lookbook / testimonials / stats: no dedicated data source exists; default to manual content; cms_posts bind is available for campaigns. Don't invent sources.
- story-house / footer image + i18n + media library + social links: all verified — wire them.
- marquee: none (pure presentation).

PROCESS:
- Build each block as a DRAFT. Do NOT publish to a production-visible gallery until the owner reviews.
- After each block: `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint` (a 0-error OOM-crashed run is NOT clean). Add a preset/template-id assertion test (create.test.ts round-trip or section-templates.test.ts assertTemplateLayerLabels) so required slots can't silently drop.
- Drop the block in the real "+" gallery, render it, and take DESKTOP (1440px) + MOBILE (390px) screenshots. Confirm: inserts with zero schema errors, renders theme-aware, EN+ES resolve, every node is inspector-editable.

QA SELF-CHALLENGE BEFORE CLAIMING DONE (be adversarial about your own work):
1. Did the block insert from the actual "+" gallery without a validateBuilderNodeTree error — or only in the Lab preview? (Caps fail silently in preview.)
2. Is every visual layer a real editable node, or did you smuggle in a fixed-prop wrapper?
3. Do all hrefs land on a real surface on a TENANT host (not just localhost), no dead /contact?
4. For any backend touchpoint: did you verify it in code, or assume it? If assumed/refuted, did you flag options instead of faking it?
5. Are screenshots attached and does mobile actually reflow (container queries / responsive)?
6. Did tsc + lint pass clean, and is there a test guarding the new id?
Only claim a block is done when all six pass. Report per-block status with screenshots and any owner decisions still needed.
