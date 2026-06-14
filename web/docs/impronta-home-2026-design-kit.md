# Impronta — Home Page Design Kit
### A section-by-section build brief for the Page Builder Lab (hand to a builder agent alongside the screenshots)

**Source design:** `web/public/impronta-home-2026.html` (the approved "Casting Issue" home mockup).
**Goal:** rebuild this design as a **theme-driven template** in the Page Builder Lab so it can be published to the gallery and applied by **Talent Max** profiles and **Admin workspace** pages, then populated with real content/data.

> ### ⚡ Read this first — three facts that change the whole job
> 1. **Don't hard-code black/gold/Cormorant.** They are the **`editorial-noir`** theme preset's values. Every color/font binds to a **theme token** via the `'token:…'` sentinel (see §1.2), so the template re-skins per tenant. If you ship raw hex, a tenant on another theme gets a broken page — and if no theme is applied, the platform default accent is **blue `#0ea5e9`**, not gold.
> 2. **Most of this design already exists as code.** Don't build from zero. There is a `noir.ts` page design, a `featured_talent` preset literally named **`v11-showcase` / `v11-noir`**, a `cta_banner` with a `reassurance` italic line, a `hero_search` with `highlight` + search + chips + stats, and `composition-presets` (e.g. `agency-search-hero`, `featured-talent-grid`, `editorial-story-split`). **Start from those presets and adjust**, don't reinvent.
> 3. **The whole page is one `page_template`.** Compose the sections in the Builder Lab, then "Save as page template" → it lands in `builder_templates` (kind `page_template`). Gate it with `target_context` + `required_plan` + `required_talent_tier` (§5).

---

## 0. How to use this kit
Open the screenshots next to this doc. Each section in §3 has: **Role · Builder component (real section key) · Layout · Theme tokens · Schema fields · Motion · Content/data · Responsive · Builder notes.** Build top→bottom (§3 order), assemble in the Lab (§4), gate & publish (§5). Confirm the few flagged items (§6).

---

## 1. THE DESIGN SYSTEM — theme tokens, not hex (most important)

### 1.1 The token system (verified)
- Theme = **`TOKEN_REGISTRY`** (`src/lib/site-admin/tokens/registry.ts`), ~40 named tokens across scopes: `color, typography, radius, shadow, motion, density, icon, shell, background, template`.
- A tenant's chosen values live in **`agency_branding.theme_json`** (+ `theme_preset_slug`). Presets in `src/lib/site-admin/presets/theme-presets.ts`: `neutral, classic, editorial-bridal, studio-minimal, **editorial-noir**`.
- At render, `resolveDesignTokens(branding)` merges registry defaults + the tenant's `theme_json`; `designTokensToCssVars()` injects **color** tokens as inline CSS vars on `<html>`; `designTokensToDataAttrs()` injects **enum** tokens (typography/radius/spacing/shadow presets) as `data-token-*` attributes that `src/app/token-presets.css` turns into `--site-*` vars.

### 1.2 How to make a node theme-driven (the mechanism)
In a `BuilderNode` style, a color/font prop bound to a token uses the sentinel prefix **`token:`** (`STYLE_TOKEN_REF_PREFIX` in `src/lib/site-admin/builder-node/style-token-bindings.ts`). `resolveStyleTokenRef()` turns `'token:color.accent'` → `var(--token-color-accent, <fallback>)`.

> **So in the builder inspector, set colors/fonts to the bindable token, not a hex.** e.g. `backgroundColor: 'token:color.background'`, `textColor: 'token:color.ink'`, `borderColor: 'token:color.line'`, `fontFamily: 'token:typography.heading-font-family'`. Bindable set = `STYLE_BINDABLE_TOKENS`.

### 1.3 Color mapping (mockup hex → token → CSS var → Editorial-Noir value)

| Mockup hex | Role | Bind to token | CSS var | Noir value |
|---|---|---|---|---|
| `#0a0a0b` | Page canvas | `color.background` | `--token-color-background` | `#0a0a0a` |
| `#111113`/`#161618` | Raised surfaces / bands / cards | `color.surface-raised` | `--token-color-surface-raised` | `#0f0f0f` |
| `#C9A227` | Accent (CTA, active, hairline glint) | `color.accent` (or `color.primary`) | `--token-color-accent` | `#d4af37` |
| `#E4C76A` | Accent hover | *derive* from accent (lighten) | — | — |
| `#f1ede6` | Headlines / primary text | `color.ink` | `--token-color-ink` | `#f4f4f5` |
| muted greys | Secondary text | `color.muted` | `--token-color-muted` | `#a1a1aa` |
| `rgba(201,162,39,.12)` | Hairlines / dividers | `color.line` | `--token-color-line` | `#1f1f22` |

### 1.4 Type / shape / motion / shell → tokens (Editorial-Noir values)
- **Heading font:** `typography.heading-preset` = `cinzel-editorial` (→ `--site-heading-font`). The mockup drew **Cormorant Garamond**; the *intent* is "light editorial serif, italic for emphasis." **Bind to the token — don't hard-code Cormorant.** If the brand insists on Cormorant, set the custom `typography.heading-font-family` token (faces registered in `builder-node/page-designs/tokens.ts`).
- **Body:** `typography.body-preset` = `refined-sans` (mockup used Inter). **Labels/eyebrows:** `typography.label-preset` = `uppercase-tracked`. **Scale/tracking:** `editorial` / `wide`.
- **Shape/feel:** `radius.base` `md` (`--site-radius-*`); `shadow.preset` `ambient`; `motion.preset` `refined` (`--site-motion-ease/dur-*`); `density.section-padding` `editorial` (`--site-section-y`); `density.container-width` `standard` (`--site-container-max`); `motion.stagger-preset` `editorial`; `icon.family` `editorial-line`.
- **Shell:** `shell.header-variant` `editorial-sticky` · `shell.header-sticky` `on` · `shell.header-transparent-on-hero` `on` · `shell.footer-variant` `espresso-column` · `shell.mobile-nav-variant` `full-screen-fade` · `shell.logo-variant` `wordmark` · `background.mode` `editorial-noir`.

### 1.5 Template-level theme
`builder_templates` rows carry an optional **`theme_tokens`** field (a token override bundle on the template itself). Recommended: bundle the Editorial-Noir tokens into the template's `theme_tokens` so the page reads correctly *as designed* even before a tenant theme is applied — while individual node styles still bind to `token:` so a tenant override re-skins it. *(One verify item, §6: whether `theme_tokens` hard-overrides or seeds — treat as the template's recommended palette.)*

### 1.6 "Gold discipline" — the restraint rule (bake into every section)
Accent gold ≤ ~3% of any screen: a 1px hairline/glint, a CTA fill, a CTA underline, the active nav/folio number, an active dot, or **one warmed word** per view. Never a gold flood, gradient, or large fill. This is the difference between luxury and loud.

---

## 2. GLOBAL SYSTEMS
- **Scroll-reveal:** every section's shared presentation supports `animations.scroll: reveal-stagger` and `animations.entry: fade-up` — use those (driven by `motion.stagger-preset`). Must respect `prefers-reduced-motion` (`reducedMotion: respect`).
- **Parallax:** shared presentation supports `parallax` / `animations.scroll: parallax-soft` and `--parallax-l*` layers — use for the hero portrait and the two full-bleed plates. **Never put parallax and reveal on the same node.**
- **Header scroll (transparent→frosted, hide/reveal):** covered by `shell.header-*` tokens + `site_header.tone: transparent`.
- **Custom cursor + folio rail (premium extras):** no native token. Use a section's **`customCss`** field (scoped to `[data-cms-section][data-section-id]`) or a global shell slot — **confirm support (§6); the page must look right without them.**

---

## ⬡ GALLERY PLACEMENT & CONNECTED-vs-FREEFORM — the build map (read before §3)
This decides **where each piece is created in the `+` gallery** and **whether it's data-bound (connected) or authored (freeform)** — so each component lands in the right tab and the workspace admin can control it.

### The 5 `+` gallery tabs (verified from `add-gallery/registry.ts` — this *is* what the editor renders)
- **layout** — Layout (structural containers/columns).
- **elements** — Text · Buttons · Media · Cards · Interactive · Forms · Utility · Social & Embed (atomic freeform blocks; use for the bespoke bits — "best for" list, the bleeding wordmark).
- **sections** — Hero · About · Services · Gallery · **Featured Talent** · **Talent Roster** · Testimonials · CTA · FAQ · Contact (composed sections; some carry a connected `itemKind`).
- **connected** — **Talent · Agency · Directory · Booking & Inquiry · Dynamic Data** (data-bound — bind to a workspace data source).
- **page_templates** — full published page templates (**where our whole home lands**).

### The data sources a connected component binds to (`BUILDER_DATA_SOURCE_REGISTRY`)
| Source key | Gallery name | Binds to | Min plan | Manual pick? |
|---|---|---|---|---|
| `workspace_profile` | Workspace profile | tenant name / brand / contact | free | no |
| `featured_talent_profiles` | **Roster talent** | published talent profiles (the roster) | free | yes + filter |
| `tenant_directory_search` | **Directory taxonomy** | **categories / disciplines / skills** | free | yes + filter |
| `talent_locations` | Locations | markets/cities from talent | studio | yes |
| `inquiry_path` | Inquiry path | contact / booking / request-a-brief CTAs | free | no |
| `cms_page` | CMS page | published CMS pages | studio | yes |
| `asset` | Asset library | workspace media | studio | yes |
| `custom_field` | Custom fields | structured fields (trust metrics, stats) | agency | yes |

Only `section`/`container` nodes carry the **repeater** binding; child `heading/paragraph/rich_text` bind `text`, `button` binds `label`/`href`, `image` binds `src`/`alt`.

### The decision rule (the thing to get right)
> For each block ask: **does the content come from the tenant's own data (roster, taxonomy/disciplines, locations, counts, profile) — or is it authored marketing copy?**
> - **Tenant data → CONNECTED.** Build/assign it in the **`connected` tab** (relevant Talent/Directory/Agency category) **and/or** use the section's dynamic mode (`featured_talent.sourceMode: auto_*`; `talent_type_grid.mode: dynamic` → `tenant_directory_search` taxonomy). These auto-populate per tenant — they MUST sit in the connected / Featured-Talent / Talent-Roster categories so the workspace admin and Max talent can re-bind them.
> - **Authored copy/imagery → FREEFORM.** A plain `sections`/`elements` block with static fields. No data source.
> - **Mixed** (hero, stats, CTAs): shell/copy is freeform but one or two fields bind — bind only those, author the rest.

### Master placement table (per home section)
| Home section | Component | `+` Tab → Category | Data class | Binds to | Min plan |
|---|---|---|---|---|---|
| Header | `site_header` | *site_shell (not a free section)* | semi-connected | `workspace_profile` | free |
| Hero + search | `hero_search` | sections → **Hero** | **mixed** | chips→`tenant_directory_search`·, stat→`featured_talent_profiles` count·; copy freeform | free |
| Marquee | `marquee` | sections → Showcase | freeform (opt. taxonomy) | opt. `tenant_directory_search` | free |
| Roster mosaic | `featured_talent` | sections → **Featured Talent** + connected → **Talent** | **CONNECTED** | `featured_talent_profiles` | free |
| Browse by discipline | `talent_type_grid` (dynamic) | sections → **Talent Roster** + connected → **Talent** | **CONNECTED** | `tenant_directory_search` (taxonomy) | free |
| Plate I | `cta_banner` full-bleed | sections → CTA | freeform | — (authored image) | free |
| Statement | `image_copy_alternating` | sections → About | freeform | — | free |
| Best for | `category_grid` / `blank_section`+nodes | sections → Services / **elements** | freeform (opt. taxonomy) | opt. `tenant_directory_search` | free |
| How it works | `process_steps` | sections → Story | freeform | — | free |
| Inquiry sentence | `cta_banner` | sections → CTA | mixed | CTA→`inquiry_path` | free |
| Stats band | `stats` | sections → About/Trust | **CONNECTED** (numbers) | `featured_talent_profiles` count · `talent_locations` · `custom_field` | free→agency |
| Plate II | `cta_banner` full-bleed | sections → CTA | freeform | — | free |
| For talent | `join_register` | sections → CTA + connected → **Booking & Inquiry** | mixed | `inquiry_path` / registration | free |
| Closing CTA | `cta_banner` | sections → CTA | freeform | CTA→`inquiry_path` | free |
| Footer | `site_footer` | *site_shell* | semi-connected | `workspace_profile` | free |

`·` = connected only if you pick the dynamic/auto mode; manual mode = freeform content.

> **The 3 truly connected pieces to build as connected gallery components:** ① **Roster mosaic** (`featured_talent` → `featured_talent_profiles`), ② **Browse-by-discipline** (`talent_type_grid` dynamic → `tenant_directory_search` taxonomy = the tenant's disciplines/categories), ③ **Stats numbers** (roster count / locations / custom fields). The hero chips, hero stat, and the CTAs are *partially* connected (one field each). Everything else is authored/freeform.

### How the workspace admin controls these components
- **Plan gating (automatic):** a connected component only appears for a tenant whose plan ≥ its source's `requiredPlan` (e.g. `custom_field`-bound stats need **agency**; roster + taxonomy are **free**).
- **Catalog overlay (manual, no-code):** platform admin uses the **Component Catalog** in Builder Lab → writes to **`builder_catalog_overlay`**: `talent_enabled` / `workspace_enabled` (per-surface show/hide), `label_override`, `icon_override`, `category_override` (move it to another gallery category), `required_plan_override` (tighten-only), `availability_override` (hidden/available). So an admin can hide the roster block on the talent surface, rename "Browse by discipline", re-category it, or raise its plan gate — all without code.
- **Template data needs:** the template's `data_binding_requirements` is auto-computed from the tree; RLS hides the whole template from tenants whose plan can't satisfy its sources.

---

## 3. SECTION-BY-SECTION (header → footer)
Build order = this order. Each entry's **Tab/Category & Data class** is in the placement table above. Every section also has the **shared presentation** controls: `background` (use `espresso`/canvas for dark bands), `paddingTop/Bottom` (`editorial`), `containerWidth` (`standard`, or `full-bleed` for plates), `dividerTop`, `animations`, `customCss`, plus `nodePresentation` for per-child (headline/CTA) overrides incl. tablet/mobile.

### 3.1 Header — `site_header`  *(visibleToAgency=false — managed via the site_shell row, not a free section)*
- **Role:** persistent, function-bearing nav; instant editorial tone.
- **Schema fields:** `brand{label, tagline, logoUrl, href}`, `brandDisplay: text`, `navItems[≤8]{label, href}` → Discover · Talent · Start an inquiry, `primaryCta`, `sticky: true`, **`tone: transparent`** (over hero), **`variant: editorial-split`**, `socialLinks[]`, **`authArea{showAccountMenu: true, showLanguageToggle, showDiscoveryTools}`** ← this is the adaptive Guest/Member right slot, `density{logoScale, navDensity, mobileMenuStyle}`.
- **Adaptive auth slot:** `authArea.showAccountMenu` drives logged-out (Sign in + **Register**) ↔ logged-in (**Messages** w/ unread dot · **Dashboard** · avatar). The mockup's "view as Guest/Member" toggle is only a *demo*; the real swap is platform session.
- **Tokens:** `shell.header-*` (variant/sticky/transparent/bg/text/border), nav text `token:color.muted`→`color.ink`, underline+dots `token:color.accent`.
- **Responsive:** ≤1040px → `mobile-nav-variant: full-screen-fade` drawer (editorial index). Never let the bar overflow.

### 3.2 Hero — `hero_search`  *(best match; has search + highlight + chips + stats built in)*
- **Role:** the cover + the no-account inquiry action.
- **Schema fields:** `eyebrow`, `headline` + **`highlight`** (← the gold-warmed word "intention"), `subheadline`, **`search{enabled, mode: directory-query, placeholder, actionHref, submitLabel}`**, `primaryCta/secondaryCta`, **`chipsSource: manual|service_areas|roster_cities` + `chips[]`** (browse-by-discipline can live here or in §3.4), **`statSource: manual|tenant_talent_count` + `statItems[]`**, **`layout: editorial`** (or `split`). `nodePresentation` for the headline scale.
  *Alt:* `editorial_split_hero` if you want the right-side **`mediaStyle: card-stack`** (up to 3 talent codes/captions) instead of one portrait.
- **Layout:** split — left: folio kicker, eyebrow, oversized serif headline with the `highlight` word, sub, search field, no-account line, scroll cue; right: full-height portrait blending to canvas + credit. Parallax on the image.
- **Tokens:** bg `token:color.background`; headline `token:color.ink`, highlight `token:color.accent`; input `token:color.surface-raised` + `token:color.line`; Inquire button `token:color.accent` fill; heading `token:typography.heading-font-family`.
- **Motion:** line-mask rise; the `highlight` word warms to gold one beat after (the page's single gold *motion*); image `parallax-soft`.
- **Responsive:** ≤880px image full-bleed behind, text overlays bottom with scrim.

### 3.3 Discipline marquee — `marquee`  *(exact)*
- **Schema fields:** `items[2–40]{text, href}` (Models, Hostesses, Dancers, Brand Ambassadors, Performers, Promotional), **`speed: slow`**, `direction: left`, **`separator: diamond`** (the ✦), **`variant: text`**.
- **Tokens:** text `token:color.ink`; separators `token:color.accent`; band `token:color.background`; rules `token:color.line`. Serif-italic look via heading font. Pause on hover; stop under reduced-motion.

### 3.4 Discover / Roster — `featured_talent` (+ optional `talent_type_grid` for browse)  *(hasLiveData)*
- **Role:** the casting floor — featured roster mosaic; browse-by-discipline.
- **`featured_talent` schema (use the noir/v11 presets!):** `eyebrow, headline, copy`, **`sourceMode: manual_pick | auto_featured_flag | auto_by_service | auto_recent`** + `manualProfileCodes`, `limit(6)`, `columnsDesktop(4)`, `variant: grid`, **`layoutPreset: v11-showcase`**, `headerAlign: split`, **`cardChrome: v11-noir`**, **`imageTreatment: cinematic`**, `showBookmarkIcon`, `actionStyle`, `cardVariant: editorial`, `showName/showPrimaryType/showCity/showAvailability/showBadge`. → `v11-showcase` + `v11-noir` + `cinematic` ≈ the exact mockup mosaic.
- **Browse chips:** either `featured_talent` header chips, or a `talent_type_grid` (`mode: manual|dynamic`, `desktopLayout: horizontal-rail`, `cardRatio`, `textPosition: overlay-bottom`).
- **Live data:** `sourceMode: auto_*` binds to the real roster; `computeDataBindingRequirements` will record `featured_talent_profiles` etc. so the gallery gates it to plans that have that source. **This is the section that should bind to live roster data once populated.**
- **Casting-light** (desaturate→warm on hover/chip): a CSS-filter behavior — if `v11-noir`/`cinematic` doesn't already do it, add via the section's `customCss`.

### 3.5 Full-bleed plate I ("the runway") — `cta_banner` (full-bleed) or `gallery_strip`
- **`cta_banner` schema:** `headline`(req) or just `reassurance`, **`backgroundImageUrl`** + `overlayOpacity`, **`variant: centered-overlay`**, **`bandTone: espresso`**, `insetCard: false`. Set shared **`containerWidth: full-bleed`**. Put the gold index numeral ("I.") + the one serif-italic line.
- **Tokens:** numeral `token:color.accent` (low opacity); quote `token:color.ink`/white over scrim. `parallax-soft` on the bg. *(Two plates total: this + §3.9.)*

### 3.6 Statement — `image_copy_alternating`  *(strong)*
- **Role:** "the Impronta way" — the human promise.
- **Schema fields:** `eyebrow, headline`, `items[1]{eyebrow, title, **italicTagline** (← the big serif-italic statement), body, imageUrl, iconKey, listItems}`, **`side: image-left`**, **`variant: editorial-alternating`**, `imageRatio: 4/5`.
- **Tokens:** statement `token:color.ink` w/ accent words `token:color.accent`; sub `token:color.muted`; band `token:color.background`. Image side blends to canvas (`customCss` gradient mask). Parallax on image (reveal on copy).

### 3.7 Best for — `category_grid` or `values_trio` or `blank_section` + nodes
- **Role:** find talent by occasion (editorial link list).
- No exact "link-list" section. Closest: `category_grid`, or a `blank_section` housing freeform `nav`/`heading` BuilderNodes for the 3-column hover-slide rows (label + arrow + draw-underline). Items: Fashion Campaigns, Product Launches, Runway & Showroom, Corporate & Galas, Trade Shows, Hospitality & VIP, Luxury Brand Shoots, Automotive & Tech, Music & Performance.
- **Tokens:** labels `token:color.muted`→`color.accent` on hover; row line + underline `token:color.line`/`color.accent`.

### 3.8 How it works — `process_steps`  *(exact)*
- **Schema fields:** `eyebrow, headline, copy`, `steps[2–6]{label, detail}` (Discover / Shortlist / Inquire), **`variant: numbered-column`**, **`numberStyle: serif-italic`** (← the big light-serif numerals).
- **Tokens:** numerals `token:color.accent` (low opacity); titles `token:color.ink`; body `token:color.muted`; connector `token:color.line`; band `espresso`.

### 3.9 Inquiry-as-a-sentence + Stats — `cta_banner` + `stats`
- **`cta_banner` (the sentence):** `headline` = "Tell us who you're looking for — the rest is ours to handle." with two link CTAs (the bracketed magnetic gold-underlined phrases), **`reassurance`** = "No account needed · replies within 24h", `variant: minimal-band`, `bandTone: espresso`.
- **`stats` schema:** `items[2–6]{value, label, caption}` → `101` Talents · `12` Cities · `<24h` First reply · `100%` Agency-managed, **`variant: row`**, `align: center`. **Bind numbers to live counts where possible; show em-dash until resolved — never a fake number.**
- **Tokens:** sentence `token:color.ink`, bracket CTAs `token:color.accent` + underline; stat numbers serif `token:color.accent`/`ink`; labels `token:color.muted`; cell borders `token:color.line`.

### 3.10 Full-bleed plate II ("the room") — same as §3.5
Index "II.", line "Behind every face, a room of people answerable for every detail." `cta_banner` full-bleed + `parallax-soft`.

### 3.11 For talent — `join_register`  *(exact)*
- **Role:** recruit talent (the other audience).
- **Layout/fields:** editorial portrait one side, copy the other; eyebrow `06 — For talent`, serif H2 "Your face belongs on this roster.", paragraph, two CTAs (**Apply as talent** gold fill + **Talent login** hairline).
- **Tokens:** card `token:color.surface-raised` + `token:color.line`; H2 `token:color.ink`; body `token:color.muted`; primary CTA `token:color.accent`; secondary `token:color.line`→`accent`.

### 3.12 Closing CTA — `cta_banner`  *(exact)*
- **Schema fields:** `headline` "The right talent is one search **away.**" (accent word), `copy` sub, `primaryCta` **Browse the roster** (gold) + `secondaryCta` **Start an inquiry** (hairline), `variant: centered-overlay`, `bandTone: espresso`, `insetCard: true`. Bookends the hero's gold-word gesture.

### 3.13 Footer — `site_footer`  *(visibleToAgency=false — site_shell row)*
- **Schema fields:** `brand{label, tagline}`, `columns[≤5]{heading, links[≤8]}` → Discover · For talent · **Account** (swaps logged-out↔in), `social[]` (instagram `@impronta_models`, tiktok), `legal{copyright, links}`, **`variant: editorial`**, **`tone: deep`**.
- **Extras:** the oversized `IMPRONTA` wordmark bleeding off the bottom (`token:color.ink` ~4% opacity) and the EN/ES toggle ("Hecho en CDMX") — wordmark via `customCss`; language toggle wires to the existing `/es` rewrite.
- **Tokens:** `shell.footer-variant: espresso-column`; headings `token:color.accent` (dim); links `token:color.muted`→`ink`; rules `token:color.line`.

---

## 4. Assembling & saving in the Page Builder Lab (verified)
Route: **`/platform/admin/builder-lab`** (super-admin only; mounts the Tulala **hub** tenant, forces plan `network` so all gallery items show). Persistence in the Lab is **ephemeral** — the only durable output is a `builder_templates` row.

1. Use **Talent Lab** (pick a real Max talent) or **Workspace Lab** (pick a workspace) so you preview against real data.
2. Apply the **Editorial-Noir** theme so the canvas resolves the tokens (and seed the template's `theme_tokens` with the noir bundle).
3. Add sections in §3 order from the **"sections"** gallery tab. **Prefer the existing presets**: the `featured_talent` `v11-showcase`/`v11-noir`, the `noir.ts` page design, and `composition-presets` (`agency-search-hero`, `featured-talent-grid`, `editorial-story-split`) — graft and adjust. Use `blank_section` + BuilderNodes only for the "best for" list and the cursor/folio extras.
4. In each section's inspector, **bind colors/fonts to `token:` refs** (§1.2), set shared presentation (`editorial` padding, `reveal-stagger`, `full-bleed` for plates), and `nodePresentation` for headline/CTA per-breakpoint.
5. Header action **"Save as page template"** → `createTemplateDraft` (kind **`page_template`**, gallery_tab `page_templates`, title *"Impronta — Editorial Home"*). `data_binding_requirements` auto-computes from the tree.
6. **`submitTemplateForReview` → `publishTemplate`** (creates an immutable `builder_template_revisions` snapshot). The `builder_catalog_version` counter bumps so live galleries refetch.

## 5. Gating to Talent Max & Admin workspace (verified)
Set on the `builder_templates` row:
- **`target_context`**: `talent` (Max profile pages), `workspace` (admin workspace pages), or **`both`**.
- **`required_plan`**: `free|studio|agency|network` — gates workspace consumption (rank: free<studio<agency<network; user must be ≥).
- **`required_talent_tier`**: for talent, set **`talent_portfolio`** = the **Max** tier. (Only `talent_portfolio` can even open the talent builder — `buildTalentPageBuilderConfig` unlocks motion/`themeTokens`/`customCss` only for Max. So the cursor/folio/customCss extras are Max-capable.)
- **Consumption:** the user opens the page builder gallery (`listPublishedTemplates` filters by target/plan/tier/tab → `mergeGalleryItems` + `applyCatalogOverlay`), inserts the `page_template`; the `builder_tree` is re-minted into their page; publish renders at **`/t/[profileCode]/[pageSlug]`** (talent) or **`/p/[slug]`** (workspace).
- **Visibility overrides:** `builder_catalog_overlay` (per-surface enable, label/icon/category overrides, tighten-only plan override) controls how the template appears in each surface's "+" gallery.

## 6. Resolved / confirm-on-build
- ✅ **Theme binding:** `token:` sentinel on node styles (§1.2). Default accent is blue `#0ea5e9` — **apply Editorial-Noir**.
- ✅ **Existing presets to start from:** `noir.ts` page design; `featured_talent` `v11-showcase`/`v11-noir`; `composition-presets`; `cta_banner.reassurance`; `hero_search.highlight`+search+chips+stats; `site_header.authArea`.
- ✅ **Lifecycle & gating:** §4/§5 verified against `registry-actions.ts`, `builder_templates`/`builder_template_revisions`, the plan/tier predicates.
- ⚠️ **Confirm on build:** (a) whether the template's `theme_tokens` hard-overrides or just seeds the tenant theme; (b) that `customCss` is allowed on the target surface (Max yes; workspace check) for the cursor/folio-rail/bleeding-wordmark extras — they're enhancements, page must look right without them; (c) the "best for" link-list and the hero `highlight`→gold-*motion* may need a small custom node/CSS; (d) casting-light shared state between chips + mosaic if you split them.

---

### Appendix A — Section → component cheat sheet
| # | Home section | Component (key) | Match | Key fields |
|---|---|---|---|---|
| 1 | Header | `site_header` | exact | `tone:transparent`, `variant:editorial-split`, `authArea.showAccountMenu` |
| 2 | Split hero + search | `hero_search` (or `editorial_split_hero`) | exact | `highlight`, `search`, `chips`, `statItems`, `layout:editorial` |
| 3 | Discipline marquee | `marquee` | exact | `separator:diamond`, `variant:text` |
| 4 | Roster mosaic (+browse) | `featured_talent` (+`talent_type_grid`) | exact | `layoutPreset:v11-showcase`, `cardChrome:v11-noir`, `imageTreatment:cinematic` |
| 5 | Full-bleed plate I | `cta_banner` full-bleed / `gallery_strip` | strong | `variant:centered-overlay`, `bandTone:espresso`, `containerWidth:full-bleed` |
| 6 | Statement (split) | `image_copy_alternating` | exact | `italicTagline`, `variant:editorial-alternating` |
| 7 | Best for (link list) | `category_grid` / `blank_section`+nodes | partial | freeform link rows |
| 8 | How it works | `process_steps` | exact | `numberStyle:serif-italic`, `variant:numbered-column` |
| 9a | Inquiry sentence | `cta_banner` | exact | `reassurance`, link CTAs |
| 9b | Stats band | `stats` | exact | `variant:row`, `items{value,label}` |
| 10 | Full-bleed plate II | `cta_banner` full-bleed | strong | as #5 |
| 11 | For talent | `join_register` | exact | dual CTA |
| 12 | Closing CTA | `cta_banner` | exact | accent word, dual CTA |
| 13 | Footer | `site_footer` | exact | `variant:editorial`, `tone:deep` |

### Appendix B — Editorial-Noir token resolution (the mockup's hex, expressed as tokens)
```
color.background  #0a0a0a   color.ink           #f4f4f5    color.line           #1f1f22
color.surface-raised #0f0f0f color.muted        #a1a1aa    color.primary        #c9a227
color.accent      #d4af37
typography.heading-preset cinzel-editorial   (mockup: Cormorant Garamond — BIND to token, don't hard-code)
typography.body-preset    refined-sans       (mockup: Inter)      typography.label-preset uppercase-tracked
typography.scale-preset editorial · tracking wide · radius.base md · shadow.preset ambient · motion.preset refined
density.section-padding editorial · density.container-width standard · motion.stagger-preset editorial · icon.family editorial-line
shell.header-variant editorial-sticky · header-sticky on · header-transparent-on-hero on
shell.footer-variant espresso-column · mobile-nav-variant full-screen-fade · background.mode editorial-noir
```
Default platform tokens (NO theme applied) = `color.primary #111111`, `color.accent #0ea5e9` (blue), `radius.base .5rem` — i.e. apply Editorial-Noir or it won't look like Impronta.

### Appendix C — Key files & identifiers for the builder agent
- Tokens: `src/lib/site-admin/tokens/registry.ts` (`TOKEN_REGISTRY`), `…/resolve.ts` (`COLOR_VAR_NAMES`, `resolveDesignTokens`), `src/app/token-presets.css`.
- Token binding: `src/lib/site-admin/builder-node/style-token-bindings.ts` (`STYLE_TOKEN_REF_PREFIX='token:'`, `STYLE_BINDABLE_TOKENS`, `resolveStyleTokenRef`).
- Presets: `…/presets/theme-presets.ts` (`editorialNoirPreset`); page designs `…/builder-node/page-designs/noir.ts`; `…/builder-node/composition-presets.ts`.
- Sections: `src/lib/site-admin/sections/<key>/` (`schema.ts` props, `presets.ts`, `Component.tsx`, `Editor.tsx`); registry `…/sections/registry.ts` (`SECTION_REGISTRY`); shared `…/sections/shared/presentation.ts`.
- Templates/lifecycle: `builder_templates` + `builder_template_revisions` tables; `…/builder-core/templates/registry-actions.ts` (`createTemplateDraft`, `publishTemplate`, …); gating predicates `templatePlanAllowed`/`templateTalentTierAllowed`/`templateTargetAllowed`; Lab route `src/app/(workspace)/platform/admin/builder-lab/`.
```
