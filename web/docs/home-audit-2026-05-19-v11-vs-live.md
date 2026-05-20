# Impronta Home Audit — Live `/impronta` vs v11 Prototype
*2026-05-19 — comprehensive audit of every section, UX surface, and gap.*

## Method

- **Prototype source-of-truth**: `web/prototypes/impronta-home/v11-features/index.html` (1,359 LOC; canonical static reference).
- **Live source**: `http://localhost:3000/impronta` (current `phase-1` head with 6C complete; Chrome MCP DOM + console inspection).
- Section-by-section side-by-side comparison: structure, copy, controls, interactive surfaces, content.
- All 10 page-builder section instances on live were verified in Chrome (no 500s, zero console errors).

---

## Executive summary

**Section-skeleton parity is excellent.** Every one of the v11 prototype's 10 sections has a corresponding live section in the same order (`site_header → hero_search → editorial_split_hero → talent_type_grid → featured_talent → location_discovery → process_steps → values_trio → cta_banner × 2 → site_footer`). The 6C / Phase 4 LinkRef + shell migration shipped clean — no routing or theming regressions vs the prototype.

**The gaps are about depth of section behavior + Impronta-recipe configuration**, not missing section types. Two of the prototype's most distinctive surfaces are notably shallower on live:

1. **`location_discovery` has no map** — the prototype's signature world map with the "FEATURED MARKET" Riviera Maya pin and clickable market preview is currently a flat card list on live. The prototype HTML even ships an explicit drop-in comment pointing at the existing `LocationMap` component (`web/src/components/home/location-map.tsx` using `@vis.gl/react-google-maps`).
2. **`editorial_split_hero` is a static split-hero** where the prototype's "hero-classic" is an **interactive secondary discovery surface** — category + market dropdowns with an Explore CTA AND a stacked "stage-card" talent visual with a "Selected" badge. Live shows a generic media frame next to copy.

**The footer is half-configured** — 2 columns instead of the prototype's 4; no social row; no legal links (Privacy / Terms / contact email).

**The header social cluster is half-filled** — 2 of 4 prototype icons (WhatsApp + TikTok present; Instagram + phone-with-number missing on live).

Most other gaps are **copy + recipe-data choices** that can be fixed in the `impronta-home` starter recipe (no component code change) — eyebrows, stat-line qualifiers, chip selections, secondary CTA semantics.

**Two pre-existing latent bugs surfaced by other agents during this work cycle (logged separately, not 6C):**
- `share/pitch/[token]/page.tsx:170` queries the wrong table for `brand_mark_svg` (always returns null).
- Concurrent agent's uncommitted edits to `drawers.tsx` carry 4 tsc errors (`ResolvedField.has_value` / `tenant_override` not on the type).

---

## Section-by-section findings

### 1. `site_header`

| Aspect | Prototype | Live | Verdict |
|---|---|---|---|
| Brand mark + logo | ✓ | ✓ (Phase 4 logo bridge fix + W3-I read-fallback shipped) | ✓ |
| Brand tagline ("Agencia de Modelos & Imagen") | shown | shown | ✓ |
| Social cluster | 4 icons: WhatsApp, Instagram, TikTok, phone-with-number | 2 icons: WhatsApp, TikTok | **P2 GAP** — missing IG + phone; cluster feels half-filled |
| Visible phone number ("+52 984 000 0000") | inline next to phone icon | absent | **P3 GAP** — prototype shows the number; live shows icon-only |
| Locale toggle EN/ES | ✓ | ✓ | ✓ |
| Saved + Inquiry + Burger buttons | ✓ | ✓ | ✓ |
| Primary nav | 5 items: Discover · Talent · Services · Markets · About | 6 items: Discover · Talent · Locations · About · Contact · Apply as Talent | **P3 UX DIFFERENCE** — live's nav is more crowded; prototype keeps nav lean and pushes CTAs to drawer + #contact/#join sections |
| Nav item naming | "Services", "Markets" | "Locations" (no Services) | **P3 COPY** — Services link removed (prototype had services band); Markets → Locations |
| Mobile drawer auth links | Client sign in / Talent login / Apply as talent | implicit via Burger → /login + /register | ✓ functional; verify drawer copy matches |

**Fix-by-recipe (no code change):**
- Add Instagram + phone to `site_header.socialLinks` / `contactLinks` in the `impronta-home` starter, with the phone number value populated to render the visible "+52 ..." label.
- Trim nav to 5 items matching prototype, OR explicitly decide to keep the extra (Contact/Apply as Talent in nav is a deliberate live preference — document it).

---

### 2. `hero_search` — primary search hero ("hero-find")

| Aspect | Prototype | Live | Verdict |
|---|---|---|---|
| Eyebrow | "Models & Image Agency" | "Models & Image Agency" | ✓ EXACT |
| Headline | "Find the right talent **for your brief.**" (gold span on "for your brief.") | "Find the right talent for your brief." | ✓ EXACT TEXT (verify the gold-display styling for the second span is applied) |
| Sub-headline | "Search the directory by role, location or fit — agency-managed, no direct contact." | (verify) | ✓ likely matches — confirm in next pass |
| Search form (`<form action="directory.html">`) | present, with magnifier icon, ghost text typer, gold Search button | present (form action `/impronta/directory`) | ✓ |
| Hero actions | Primary "Start an Inquiry" (gold) + Secondary text link "Apply as talent →" | "Start Inquiry" + "Explore Talent" | **P2 GAP** — secondary CTA semantic differs: prototype recruits talent; live drives to browse. The prototype's mix (one client CTA + one talent CTA) was deliberate. |
| Hero cities chips | "Riviera Maya · Mexico City · Buenos Aires · More cities coming" (soft) — 4 chips, 3 real + 1 expansion-signal | "Playa del Carmen · Tulum · Riviera Maya" — 3 chips, all Riviera Maya sub-cities | **P2 GAP** — different market positioning. Prototype tells the international story; live tells the local-deep story. Decide on intent; if international remains the brand promise, add Mexico City + Buenos Aires + a "More cities coming" soft chip. |
| Stat line / trust line | "**120+** represented talent · agency-managed from inquiry to confirmation" | "28 represented talent" | **P2 GAP** — full qualifier ("agency-managed from inquiry to confirmation") missing; the number is now real-tenant-derived (good — `statSource: tenant_talent_count` is doing its job) but the agency value-prop tail is lost. Easy recipe fix via `statCountLabel`. |

**Fix-by-recipe**:
- `secondaryCta.label` → "Apply as talent →"; `secondaryCta.href` → talent-register kind (root).
- Reshape `chips`: 4 chips matching the international markets + soft "More cities coming".
- `statCountLabel` → "represented talent · agency-managed from inquiry to confirmation".

---

### 3. `editorial_split_hero` — secondary discover hero ("hero-classic")

| Aspect | Prototype | Live | Verdict |
|---|---|---|---|
| Layout | 2-column grid (text + visual stage) | 2-column split-hero | ✓ structure |
| Heading | "Discover premium talent across **destination cities.**" (gold display) | "Premium talent for events, shoots, and brand experiences." | **P2 COPY DIFFERENCE** — prototype positions destinations; live positions use-cases. Different message. |
| Sub-headline | "Premium models, hosts, performers and creators for events, productions and brand experiences — Riviera Maya, Mexico City, Buenos Aires & beyond." | (verify) | check |
| **Interactive discovery form** (Category select + Market select + Explore submit) | **YES** — `<form action="directory.html">` with `<select>` for Category (All / Models / Hosts / Performers / Creators) and `<select>` for Market (All / Riviera Maya / Mexico City / Buenos Aires / soft "More cities coming") | **MISSING** | **P1 MAJOR GAP** — this is a primary conversion surface in the prototype. The schema for `editorial_split_hero` currently doesn't have a "discovery form" mode. Either: (a) extend editorial_split_hero schema with an optional `discoveryForm` block; or (b) create a new section type `hero_discovery` for this pattern; or (c) decide to drop the discovery form pattern entirely. |
| **Stage cards visual** (3 layered talent face cards with "Selected" badge tab + talent name + "Editorial · Tulum" caption) | **YES** — `.stage-cards` with `sc-b`, `sc-c`, `sc-main` stacked frames + scrim + sheen | replaced with a single `MediaFrame` (static image) | **P1 GAP** — visually distinctive prototype element absent. W3-G (#14 editorial_split_hero `selected`/`dynamic` talent-preview media modes) was planned to address this but is held; this audit re-prioritizes it. |
| Background overlay grade | dark cinematic | medium soft scrim | ~ matches |

**Recommendation**:
- Decide on intent for the hero-classic surface. If keeping the editorial-split-hero pattern (current live), explicitly drop the discovery-form from the spec. If pursuing the prototype's interactive secondary, **extend schema + Component** in W3-G with `discoveryFormMode` + a stage-card media mode.
- Reconcile copy: pick "destination cities" framing vs "events/shoots/brand experiences" framing (or layer them).

---

### 4. `talent_type_grid` — "Talent, by discipline"

| Aspect | Prototype | Live | Verdict |
|---|---|---|---|
| Eyebrow | "The roster" | "The roster" | ✓ |
| Title | "Talent, by discipline" | "Talent, by discipline" | ✓ EXACT |
| Cards (7) | Dynamic from CATS[] (Models / Hosts & Promoters / Performers / Creators in JS) | Static recipe (7 v11 preset cards: Models, Hosts & Promo, Chefs & Culinary, Performers, Wellness & Beauty, Music & DJs, Photo, Video & Creative) | **P3 IMPROVEMENT** — live has 7 disciplines vs prototype's 4; live is richer. ✓ |
| Rail controls (prev/next) | ✓ | ✓ (`showRailControls: true`) | ✓ |
| "See all →" link | ✓ → directory.html | ✓ → /impronta/directory | ✓ |
| Card hover behavior | shimmer / hover lift | (verify visually) | ✓ likely |
| Card images | curated Unsplash (per Visual Polish Pass 1; sanctioned) | ✓ live (per Plan doc 2026-05-18 Polish Pass) | ✓ |
| Editor — visual taxonomy picker | not applicable (static) | **MISSING** — manual term-id text field today | **P2** — W3-D pending (after W2-B) |
| Glyph library breadth | the 7 v11 disciplines use ◑ ✦ ✷ ♪ ❀ ♫ ◉ | same 8-item preset library | **P3 IMPROVEMENT** — W2-B in flight expanding to 16–20 glyphs |

**Status**: closest-to-prototype section. Two follow-ons in motion (W3-D taxonomy picker, W2-B glyph expansion).

---

### 5. `featured_talent` — "Featured talent" / "Selected"

| Aspect | Prototype | Live | Verdict |
|---|---|---|---|
| Eyebrow | "Selected" | "Selected" | ✓ EXACT |
| Title | "Featured talent" | "Featured Talent" | ✓ (capitalization only) |
| Card count | 4 (TALENT[] in JS) | 8 cards rendered | live richer ✓ |
| Card fields | name, category, city, image | name, primary type, secondary type, city, languages, image | ✓ — live richer (W3-H just shipped `parentCategoryDisplay` backing) |
| Card "Request" / "Add to inquiry" CTAs | structural option (`requestCta` on the schema) | (verify if requestCta enabled on this composition) | ✓ schema supports |
| Card layout | masonry-ish ft-grid | grid (configurable columns) | ~ matches |
| Bookmark glyph | structural option | structural option | ✓ |
| Availability | NEVER fabricated — toggle structural only until reliable source exists | same — `availabilityLabel: null` always (W3-H confirmed) | ✓ honored |
| Center "Explore Talent →" link below grid | ✓ | ✓ (via footerCta) | ✓ |

**Status**: solid — W3-H just enhanced the DTO. No prototype-vs-live gap of concern.

---

### 6. `location_discovery` — "Local faces, international reach"

| Aspect | Prototype | Live | Verdict |
|---|---|---|---|
| Eyebrow | "Talent network" | "Markets" | **P3 COPY DIFF** |
| Title | "Local faces, international reach." | "Find Talent Near Your Event Location" | **P2 COPY DIFF** — prototype positions network reach; live positions buyer convenience |
| Lead paragraph | "Starting with Riviera Maya, expanding across Mexico City, Buenos Aires, and other creative markets. Click a market to preview available talent." | (verify) | check |
| **WORLD MAP with featured market pin** | **YES** — SVG world map (or Google Maps drop-in via `LocationMap` component reference in the HTML comment) with Riviera Maya `featured` pin (gold ring + glow + "FEATURED MARKET" label) and `cdmx` / other dotted pins | **MISSING — flat card list only** | **P1 MAJOR GAP** — single biggest visual departure from the prototype. The prototype even includes an explicit drop-in comment in the HTML pointing at the existing `web/src/components/home/location-map.tsx` (`@vis.gl/react-google-maps`, `LocationItem[]` props). The component to drop in already exists. |
| Pin → preview UX | click pin → reveals featured-talent faces for that market | not applicable | follows from map being absent |
| Card list (manual mode) | not in prototype (map IS the discovery) | ✓ live | **direction divergence** — live shows cards; prototype shows map. Both have value. |

**Recommendation**:
- W3-F (held in plan) becomes **P1**. Wire `LocationMap` into `location_discovery` as an optional `showMap: true` rendering mode (schema flag already exists per the section's schema — verify). Keep the card list as a fallback / accompaniment.
- Update eyebrow + title to align with prototype positioning OR document the deliberate departure.

---

### 7. `process_steps` — "A clear, professional process"

| Aspect | Prototype | Live | Verdict |
|---|---|---|---|
| Eyebrow | "How it works" | "How booking works" | **P3 COPY DIFF** |
| Title | "A clear, professional process" | "A Clear, Professional Process" | ✓ (capitalization only) |
| Steps (4) | 01 "Tell us the brief" → 02 "We shortlist options" → 03 "Confirm talent" → 04 "Coordinate the booking" | 01 "Tell Us the Brief" → 02 "We Shortlist Options" → 03 "Confirm Talent" → 04 "Coordinate the Booking" | ✓ EXACT MATCH (capitalization only) |
| Numbered badges | ✓ | ✓ | ✓ |

**Status**: ✓ MATCH (cosmetic only).

---

### 8. `values_trio` — "An agency, not a directory" (#about)

| Aspect | Prototype | Live | Verdict |
|---|---|---|---|
| Eyebrow | "Why Impronta" | "What we believe" | **P3 COPY DIFF** |
| Title | "An agency, not a directory" | "An Agency, Not a Directory" | ✓ (capitalization only) |
| Lead | "Every booking is supported by real coordination, local knowledge, and reviewed, agency-approved talent — in every market we operate." | (verify) | likely matches |
| Pillars (3) | "Verified profiles" / "Local coordination" / "Booking support" | "Verified Profiles" / "Local Coordination" / "Booking Support" | ✓ EXACT (capitalization only) |
| Pillar icons | inline SVGs (check, pin-with-dot, clipboard-check) | (verify visually) | likely matches |

**Status**: ✓ MATCH. Eyebrow tweak is the only delta.

---

### 9. `cta_banner` #1 — "For talent" / #join

| Aspect | Prototype | Live | Verdict |
|---|---|---|---|
| Eyebrow | "For talent" | "For talent" | ✓ EXACT |
| Heading | h3 "Are you a model, host, performer or creator?" | h2 "Are you a model, host, performer, or creator?" | ✓ (h-level + Oxford comma only) |
| Body copy | "Build your agency-managed profile — availability, portfolio and rates in one place — and be considered for selected opportunities across our growing network of markets." | (verify; likely matches) | check |
| CTAs | "Apply as Talent" (gold) + "Talent Login →" (text) | "Apply as Talent" + "Talent Login" — `/register` + `/login` (root, ✓ Finding-B-safe) | ✓ |

**Status**: ✓ MATCH.

---

### 10. `cta_banner` #2 — "Planning an event..." / #contact

| Aspect | Prototype | Live | Verdict |
|---|---|---|---|
| Eyebrow | "Start" | "For clients" | **P3 COPY DIFF** — both work; "Start" is more action-oriented; "For clients" pairs symmetrically with cta_banner #1's "For talent" |
| Heading | h2 "Planning an event, shoot, activation, or private experience?" | h2 "Planning an event, shoot, activation, or private experience?" | ✓ EXACT |
| Body | "Tell us the brief and your market. We'll match the right talent — a coordinator replies personally." | (verify) | likely matches |
| CTAs | "Start an Inquiry" (gold) + "Explore Talent" (line) → both → directory.html in prototype | "Start Inquiry" → `/impronta/contact` + "Explore Talent" → `/impronta/directory` | ✓ — and live's `Start Inquiry` → contact route is BETTER than prototype's directory.html (which is a copy-paste artifact in the prototype) |

**Status**: ✓ MATCH (with live slightly better routing).

---

### 11. `site_footer`

| Aspect | Prototype | Live | Verdict |
|---|---|---|---|
| Brand block (logo + IMPRONTA + tagline + body) | ✓ | ✓ | ✓ |
| Tagline | "An international talent network — launching in Riviera Maya, expanding across Mexico City, Buenos Aires and beyond." | "Premium talent for events, shoots, and brand experiences across the Riviera Maya." | **P2 COPY DIFF** — prototype frames as international expansion; live is local-first |
| Columns | **4**: Brand block + "Explore" (3 links) + "Agency" (3 links) + "Account" (3 links) | **2**: "Discover" (Directory, Contact, About) + "Talent" (Apply as Talent, Talent Login) | **P1 GAP** — missing 2 columns. Brand block exists separately ✓ but the structured nav is half-built. |
| Social row | inline with brand: WhatsApp + IG + TikTok + phone | **0 social links** | **P1 GAP** — entire social row missing in live |
| Legal links row | Privacy · Terms · hello@impronta.studio | **0 legal links** | **P1 GAP** — required for production launch |
| Copyright | "© 2026 Impronta — International Talent Network" | "© 2026 Impronta. All rights reserved." | **P3 COPY DIFF** |

**Fix-by-recipe** (no code change — all configurable in the footer schema's `columns`, `social`, `legal.links`, `legal.copyright`):
- Add 2 missing columns ("Agency": About / For talent / Contact; "Account": Client sign in / Talent login / Apply as talent).
- Populate `social[]` with WhatsApp, Instagram, TikTok, email entries.
- Populate `legal.links[]` with Privacy / Terms / contact-email.
- Update copyright copy.
- Update brand tagline to match international positioning OR keep deliberate.

---

## Cross-cutting findings

### Routing / Finding-B safety — ✓ INTACT
Verified in Chrome on the live home: `/register` + `/login` resolve to **ROOT** (not tenant-prefixed); every internal link resolves through `resolveLinkRef` correctly. Zero `/impronta/<auth>` mis-prefixing anywhere on the page.

### Console / runtime — ✓ CLEAN
Zero console errors during a full page navigation cycle (verified twice in Chrome MCP). No 500s on the canonical render path.

### Locale / EN-ES toggle
- Prototype: client-side EN/ES toggle with `data-en` / `data-es` attributes on every translatable string.
- Live: locale toggle button present in header. **Functional verification not completed in this audit** — recommend a follow-up: confirm locale switching actually swaps copy on every section, and that all the i18nString fields (eyebrows, headlines, bodies) are populated for `es`.

### Image quality / cinematic grade
- Prototype: dark cinematic grade via overlay tokens; curated Unsplash crops on every visual.
- Live: same crops applied per the 2026-05-18 Visual Polish Pass 1 (curated Unsplash sources, IMGQ profile, cinematic via existing overlay tokens). ✓

### Mobile / responsive
- Phase 4 verified no horizontal overflow at 390 / 834 / 1440 px viewports.
- 6C didn't touch CSS; baseline holds.
- **Recommended follow-up**: re-verify after every audit-fix lands (visual regression).

---

## What's needed to complete the home product

Categorized + prioritized list. Sub-items map onto specific actions; everything that's already on the multi-agent plan (#1–#18) is cross-referenced; **new items from this audit are marked `[NEW]`**.

### P1 — Critical (visible product gaps; needed for prototype parity)

**H1. Wire `LocationMap` into `location_discovery`** `[NEW]` (was W3-F deferred — promote to P1)
- Mount the existing production component `web/src/components/home/location-map.tsx` (`@vis.gl/react-google-maps`, `LocationItem[]` props) into `location_discovery`'s rendering path under a `showMap: true` schema flag.
- Wire pin click → feature talent preview overlay (matches prototype UX).
- Tenant-scope locations via `listTalentIdsOnTenantRoster` (existing pattern).
- Requires `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` env var in Vercel (verify present).

**H2. Decide + implement `editorial_split_hero` discovery form + stage-cards** `[NEW + W3-G]`
- Either (a) extend `editorial_split_hero` schema to add an optional `discoveryForm` block (category select + market select + Explore submit) AND a stage-cards media mode, OR
- (b) Create a new section type `hero_discovery` for this pattern + retire `editorial_split_hero`'s use in the home slot, OR
- (c) Document the deliberate departure from the prototype hero-classic pattern and update the prototype reference doc.

**H3. Complete footer recipe** `[NEW]`
- Add 2 missing columns ("Agency" + "Account") to `site_footer.columns[]` in `impronta-home` recipe.
- Populate `site_footer.social[]` with WhatsApp / Instagram / TikTok / email.
- Populate `site_footer.legal.links[]` with Privacy / Terms / contact-email.
- Update `site_footer.legal.copyright` to prototype string OR a deliberate alternative.
- This is **recipe data only — no component code change** (the schema already supports all fields).

### P2 — Important (UX/positioning gaps; needed for brand parity)

**H4. Complete header social/contact cluster** `[NEW]`
- Add Instagram + phone-with-number to `site_header.socialLinks[]` / `contactLinks[]` in `impronta-home` recipe.
- Confirm the phone number renders as visible text (the schema already supports inline label).
- Recipe-only fix.

**H5. Tune `hero_search` recipe copy** `[NEW]`
- `statCountLabel` → "represented talent · agency-managed from inquiry to confirmation" (preserve the agency-value-prop tail).
- `chips[]` → 4 entries (Riviera Maya, Mexico City, Buenos Aires, "More cities coming" soft chip — schema supports soft state via the chip schema).
- `secondaryCta` → "Apply as talent →" linking to talent register (root), restoring the recruit-side secondary semantic.
- Recipe-only fix.

**H6. Align `location_discovery` + `editorial_split_hero` headline copy** `[NEW]`
- `location_discovery`: title → "Local faces, international reach."; eyebrow → "Talent network"; align lead.
- `editorial_split_hero`: align with chosen direction from H2 (destinations-framed vs use-cases-framed).
- Recipe-only fix.

**H7. Map embed env var + production verification** `[NEW]`
- After H1 lands: confirm `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set in Vercel prod; deploy-smoke covers map render in prod.

### P3 — Polish (copy + minor UX)

**H8. Eyebrow + title alignment** `[NEW]`
- `process_steps` eyebrow: "How booking works" → "How it works" (or document deliberate).
- `values_trio` eyebrow: "What we believe" → "Why Impronta" (or document).
- `cta_banner #2` eyebrow: "For clients" → "Start" (or document the symmetry preference — current "For clients" pairs nicely with "For talent" on the sibling cta_banner #1).
- `site_footer.legal.copyright`: "© 2026 Impronta — International Talent Network".

**H9. Header nav trim** `[NEW]`
- Decide: keep live's 6-item nav (Discover · Talent · Locations · About · Contact · Apply as Talent) or trim to prototype's 5 (Discover · Talent · Services · Markets · About). Document the choice in the plan.

**H10. Locale-toggle functional test** `[NEW]`
- Verify EN/ES toggle in the live header actually swaps copy across every section (every i18nString field on every section). Add Playwright `e2e/locale-toggle.spec.ts` if missing.

### Already on the multi-agent plan (#1–#18)

**O1 / #1**: Approve push of the 17 (now 21+) local 6C + multi-agent commits.
**O2 / #2**: Vercel prod env vars `ENABLE_SITE_SHELL=tenants`, `SITE_SHELL_TENANT_IDS=00000000-0000-0000-0000-000000000001`.
**O3 / #3**: Apply `impronta-home` starter in real Impronta tenant (post-push).
**#4–#7 / Wave 1**: rebase → re-Chrome-QA → push → promote → smoke.
**#8 / Wave 4**: Phase 5 legacy fallback removal (post-O2).
**#9 / W3-I ✓ DONE** `b1d8935b9` — logo single-source bridge.
**#10 / W2-C — RUNNING**: ThemeFoundationsDrawer cleanup.
**#11 / W3-D — pending W2-B**: talent_type_grid taxonomy picker.
**#12 / W3-E ✓ DONE** `abec20183` — hero_search roster_cities derived chips.
**#13 / W3-F**: location_discovery map embed → **PROMOTED TO P1 (= H1)** by this audit.
**#14 / W3-G**: editorial_split_hero dynamic media → **EXPANDED TO H2** (discovery form + stage cards, not just media modes).
**#15 / W3-H ✓ DONE** `ea18776c4` — featured_talent parentCategoryDisplay.
**#16 / W2-B — RUNNING**: discipline glyph library expansion.
**#17 / W2-A — RUNNING**: builder-capabilities `server-only` harness fix.
**#18**: Directory-section agent coordination (sequence Wave-1 rebase around their commits; their work is unrelated to the home audit but they're touching shell internals).

### Out-of-scope but worth tracking

**B1**: Pre-existing wrong-table query in `app/share/pitch/[token]/page.tsx:170` (`agency_business_identity` lacks `brand_mark_svg` — always null). Flagged by W3-I.
**B2**: Write-side mirror `agency_branding.logo_media_asset_id` → `theme_json.logo_url` on save (complement to W3-I's read-side fallback).
**B3**: 4 pre-existing tsc errors in `drawers.tsx` — `ResolvedField.has_value` + `tenant_override` not on the type at `admin-taxonomy.ts:780`. Concurrent agent's regression. Flagged by W3-H + W3-E.
**B4**: Phase 1 Talent Collection DTO extension full coverage (W3-H scoped down to `parentCategoryDisplay` since `secondaryType` + `languages` were already populated; `availability` deliberately never-invented).

---

## Recommended next-step ordering

Given Wave 2 + 3 are still in flight and owner gates remain on push/deploy, the highest-value path is:

1. **Finish Wave 2 + 3 agents** (3 still running: W2-A harness, W2-B glyphs, W2-C drawer). Integrate, Chrome-QA, commit.
2. **Owner action**: approve push + set Vercel prod env vars (`O1`, `O2`).
3. **Wave 1**: rebase → push → promote → smoke (single agent, serial).
4. **Promote H1 (map embed)** to a new spawned agent — this is the biggest visible parity gain.
5. **Recipe-only fixes H3 + H4 + H5 + H6 + H8** — a single agent can batch these as a "recipe polish" pass touching only `web/src/lib/site-admin/edit-mode/starter-action.ts` (or the equivalent `impronta-home` recipe definition). No component code; can be done independently of any in-flight section work.
6. **H2 (editorial_split_hero discovery form + stage cards)** — design decision needed first (extend vs new section). Once decided, scoped agent.
7. **H10 locale test** — Playwright spec; small scope.

The audit confirms the home is in **strong shape** — the gaps are about completing the brand recipe and adding the map, not about missing infrastructure. Most of the work is **data, not code**.

*End — Home audit 2026-05-19.*
