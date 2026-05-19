# Directory Section — Execution Plan (2026-05-19)

**Status:** BINDING feature plan. Canonical-first scope ratified by product owner 2026-05-19.

## Relationship to canonical plans (read first)

This is a **feature execution plan**, not a parallel refactor plan.

- **Subordinate to** `web/docs/remediation-plan-2026-05-19.md`. That plan refactors the *admin shell / DrawerSwitch internals* (51-case dispatch, shared field-input stash). The Directory section lives in the **public section registry** (`web/src/lib/site-admin/sections/`) and the page-builder Editor surface — a different blast radius. No file overlap with the remediation hot-set. If remediation Phase 0 (its hard gate) is mid-flight, Directory Phase 0 may still proceed because it adds new files rather than mutating `drawers.tsx` internals.
- **Implements** the page-builder surfacing implied by `web/docs/discover-and-unified-inquiry-2026-05-14.md` (the binding Discover spec). §10 below is a hard compliance gate against that spec. Where this plan and the Discover spec disagree, the Discover spec wins — file an amendment, do not silently diverge.

## Product decisions (ratified 2026-05-19)

1. **Canonical-first.** Ship the Impronta look — **Atelier template + Portrait card + AI hero band** — as a real page-builder section *now*, with the **full control drawer wired**. Only 1 template + 1–2 card styles render live; the rest are present in the picker as disabled/"coming soon" tiles. Variations light up incrementally post-launch with **no schema churn**.
2. **Wrap the existing engine — sourced from the Discover data path.** Reuse the connected directory engine + the 3 tenant-scoped config catalogs + `HeroSearch`. The drawer writes to the existing config tables. No data-model rebuild. **AMENDED 2026-05-19 (CDP-0, see below):** the canonical card sources from the **Discover path** (`DiscoverTalentListItem` via the discover bridge / `/api/discover/talents`), **not** the legacy `DirectoryCardDTO` rendered by `talent-card.tsx`. The legacy DTO has no trust-tier / agency-ownership / availability fields, so "wrap unchanged" and §10's mandatory badges are mutually exclusive on the DTO. Path A reuses the *Discover* engine (already built: `src/lib/discover`, `src/app/api/discover`, `_data-bridge/discover.ts`) — still reuse, not rebuild.

### Amendment A1 — CDP-0 data-source resolution (2026-05-19, binding)

Spec-guardian surfaced a contradiction baked into decision #2: `DirectoryDiscoverSection` renders `DirectoryCardDTO` (`web/src/lib/directory/types.ts:30`), which has **no** trust-tier, agency/independent, or availability fields. §10 (binding Discover spec) **requires** all three on the canonical card. Resolution per the §0 rule "the Discover spec wins": **Path A adopted** — the canonical Portrait/Editorial card is fed by `DiscoverTalentListItem` (`_data-bridge/discover.ts:23`, served by `/api/discover/talents`), which carries those fields. Path B (ship on the DTO, accept failing §10 boxes) is **rejected** for the launch-quality premium directory. The new card component must be **prop-driven** (no hard `usePathname()`/`usePublicDiscoveryState()` requirement — degrade gracefully) so it satisfies the T2 "card preview" reuse gate.

### Amendment A2 — trust-tier badge deferred (2026-05-19, binding)

On building Path A it emerged that `DiscoverTalentListItem` (`_data-bridge/discover.ts:23-54`, the Path-A projection from the `talent_discover_index` materialized view) carries `agencyName`/`isExclusive` (agency/independent ✓) and `nextAvailableDate`/`availableDaysInNext30`/`availabilityDots14d` (availability ✓) — **but no trust-tier field**. Surfacing a real Basic/Verified/Silver/Gold badge therefore requires adding `trust_tier` to the shared `talent_discover_index` matview (new migration + `db:push` + perf re-validation) — high blast-radius infra work that is out of scope for canonical-first under launch pressure, and faking a static badge **fails acceptance TN-2 by design**. **Deferred:** acceptance **TN-1, TN-2** are recorded FAIL/deferred for Phase 1. **Still satisfied in Phase 1:** TN-3 (agency/independent), AV-1, AV-2 (availability) — fields exist. **Revisit trigger:** before public launch sign-off, OR when any trust-gated card feature (rate-band, priority placement) is implemented — add `trust_tier` to `talent_discover_index`, then light up TN-1/TN-2 (no card-component change needed; the card already reserves the prop). No fake badge ships in the interim.

### Amendment A3 — plan-tier model (2026-05-19, binding; product-owner directive)

The Directory is a **plan-gated** capability:

| Plan | Directory experience |
|---|---|
| **Free** | NO dedicated directory page. ~5 people shown **inline on the one-pager landing** (existing `featured_talent`-style block). Considered DONE — do not build a Free directory. |
| **Studio** | Gets **one directory landing page** — the canonical Directory section (Atelier + Portrait + AI). |
| **Agency** | **Full flexibility** — unlimited Directory instances on any builder page, the complete 7-tab drawer, per-instance scope/label/style (the "Our Chefs" + "Our Models" multi-page pattern). |

**Enforcement note (do NOT silently flip):** `src/lib/access/plan-capabilities.ts` is *deliberately permissive* in Phase 1 (`PLAN_CAPABILITIES`: every plan = `ALL_CAPS`; the file's own contract says per-plan tightening is **Track C**, at which point "the resolver starts denying automatically"). Activating the first differentiated denial is a platform-wide product switch owned by Track C, **not** a directory side-effect. So:
- This plan **records** the gate; it does not unilaterally enable it.
- **When Track C activates plan gating**, wire it as: a capability key (e.g. `directory_page`) granted to `studio`/`agency`/`network` but **removed from `free`**; enforce at the section-availability seam — `listAgencyVisibleSections` consumers (`src/lib/site-admin/index.ts`, `src/lib/site-admin/edit-mode/composition-actions.ts`) filter out `directory` when the tenant plan lacks the capability. Studio-vs-Agency instance-count differentiation = a `PLAN_LIMITS` entry (Studio→1 directory page, Agency→null/unlimited).
- Until then the section is plan-neutral in the picker (consistent with the rest of the inert capability map) — acceptable pre-launch.

**Scope impact:** Free needs no work. Studio's directory landing page == the canonical render (Phase 1, ✅ done). Agency flexibility == the drawer + multi-instance (Phase 2 core ✅; Phase 2b/3 pending). This directive *confirms* current direction and assigns the gate to Track C.
3. **Portable, multi-instance component — NOT a fixed `/directory` page.** The Directory is a section a tenant drops onto *any* builder page, as many times as they want. Each instance is independently scoped, labeled, and styled. There is no privileged hardcoded directory route. The legacy `app/(public)/directory/page.tsx` monolith is retired; in its place a tenant gets a **seeded starter page** (built from this component, Fashion preset) that they can rename ("People" / "Models" / "Our Chefs" / "Our Lawyers"), re-scope (e.g. `scope=byTalentType` → chefs only), duplicate, or delete like any builder page. Gating/metadata/analytics behaviors are preserved at the builder-page layer, not bolted to one route.

### 0.1 Portability principle (binding)

A "Our Chefs" page and a "Our Models" page on the same site are **two instances of the same section type**, differing only in saved config (`scope`, `talentTypeKeys`, `heading.title`, template, card, filters). No page-scoped globals; no per-vertical forks; nothing reads "am I /directory". Every capability is per-instance. This is the whole product — full flexibility, one engine.

---

## 1. The product model — 3 orthogonal axes

| Axis | Controls | Schema field |
|---|---|---|
| **Template** | Macro layout (grid/sidebar/topbar/hero composition) | `template: enum` |
| **Card** | Talent tile micro-unit | `card.style: enum` |
| **Controls** | Records, fields, filters, sort, AI | the rest of the schema |

Decoupling Template from Card is the core decision: a model agency (`Atelier`+`Portrait`) and a law firm (`Practice`+`Profile`) share one engine, look nothing alike. This mirrors how Framer CMS / Webflow Collection Lists scale.

### 1.1 Templates (macro layout)

| Template | Vibe | Vertical | v1 |
|---|---|---|---|
| **Atelier** ★ | Editorial gallery, big 4:5 portraits, minimal chrome | Model / fashion / talent — **Impronta default** | **LIVE** |
| **Studio** | Balanced marketplace: left sidebar + grid + sort bar | General talent, creators | stub |
| **Roster** | Dense list rows: thumb + name + inline specs + quick-action | Athletes, large casts, casting | stub |
| **Practice** | Trust-forward professional, consultation CTA | Dentists, lawyers, doctors | stub |
| **Field** | Service dispatch: area + rating + price-from + availability, map toggle | Cleaners, trades, home services | stub |
| **Showcase** | One hero feature + supporting grid | Boutique spotlight | stub |
| **Mosaic** | Masonry portrait wall | Portfolio-led creative | stub |
| **Map-first** | Map primary, list secondary rail | Location-bound services | stub |

### 1.2 Card styles (micro-unit, mix with any template)

| Card | Anatomy | v1 |
|---|---|---|
| **Portrait** ★ | Full-bleed 4:5, name+type on bottom gradient, hover→traits+save | **LIVE** |
| **Editorial** | Display-serif name, oversized index number, thin rules | LIVE (2nd, cheap) |
| **Portfolio** | Hero + 3-thumb filmstrip peek, hover swap | stub |
| **Profile** | 1:1 avatar left, credential + tags + CTA right | stub |
| **Stat** | Image + tidy spec table | stub |
| **Service** | Image + rating + price-from + availability + area + CTA | stub |
| **Minimal** | Image + name only | stub |

`Editorial` is the cheap 2nd live card (same data, different CSS) so the picker proves the orthogonality from day one.

---

## 2. Reuse map (do NOT rebuild)

| Need | Existing asset | How the section uses it |
|---|---|---|
| Grid + filters + infinite scroll + inquiry actions | `components/directory/directory-discover-section.tsx` (394 LOC) | `Component.tsx` renders it; passes `searchParams`, `initialSavedIds`, tenant |
| Which fields show on cards | `lib/directory/directory-card-display-catalog.ts` (`field_definitions.card_visible`) | Drawer "Card → Fields" reads/writes catalog flags |
| Sidebar facet order / per-field hide / collapse / top bar | `lib/directory/directory-sidebar-layout.ts` (`directory_sidebar_layout` table) | Drawer "Filters & Sidebar" reads/writes this row |
| Active filters + bounds | `lib/directory/directory-filter-catalog.ts` (`directory_filter_visible`) | Drawer "Filters & Sidebar" toggles |
| AI search | `components/home/hero-search.tsx` + `DirectoryAiStrip` + `/api/ai/interpret-search` | "AI Search" tab toggles placement/copy; component embedded conditionally |
| Talent picker (feature-first / exclude) | `featured_talent/Editor.tsx` talent-picker | Lift the picker pattern for `pinnedTalentIds` / `excludedTalentIds` |
| Preset packs | `featured_talent/presets.ts` (37 LOC) | Same shape; vertical one-click presets |
| Section contract | `featured_talent/*` (gold reference) | Mirror file-for-file |

**Section contract** (`sections/types.ts`): `schema.ts` (Zod per version) · `migrations.ts` · `meta.ts` (`SectionMeta`) · `Component.tsx` (server render) · `Editor.tsx` (drawer form). Register in `registry.ts` + `registry-editors.ts` + `section-meta-registry.ts`.

---

## 3. Schema v1 (`sections/directory/schema.ts`)

Single Zod object, every drawer knob, Impronta-default values. Additive enums for templates/cards so future variations need **no migration** (a migration is only required if a *default* changes).

```ts
directoryV1 = {
  // — Source & Audience —
  entityLabel: enum(["talent","team","members","professionals","providers"]).default("talent"),
  scope: enum(["all","byTalentType","byTag","manual"]).default("all"),
  talentTypeKeys: string[].default([]),
  tagKeys: string[].default([]),
  manualTalentIds: string[].default([]),
  pinnedTalentIds: string[].default([]),        // feature-first, ordered
  excludedTalentIds: string[].default([]),      // hide specific talent
  requirePhoto: boolean.default(true),
  excludeUnavailable: boolean.default(false),
  minTrustTier: enum(["any","basic","verified","silver","gold"]).default("any"),
  defaultSort: enum(["recommended","newest","az","availability","curated"]).default("recommended"),
  pagination: enum(["loadMore","infinite","paged"]).default("infinite"),
  pageSize: number.int().min(6).max(60).default(24),   // Discover spec perf budget = 24

  // — Template —
  template: enum([...8]).default("atelier"),
  columns: { desktop:1..6=4, tablet:1..4=3, mobile:1..2=2 },
  density: enum(["comfortable","compact"]).default("comfortable"),
  heading: { show:boolean=true, title:string, subcopy:string, align:enum=["center"] },
  containerWidth: enum(["boxed","full"]).default("boxed"),
  background: enum(["coolGround","plain","subtle"]).default("coolGround"),

  // — Card —
  card: {
    style: enum([...7]).default("portrait"),
    aspect: enum(["4:5","1:1","3:4","16:9"]).default("4:5"),
    show: {                                     // per-element visibility
      name:boolean=true, talentType:boolean=true, location:boolean=true,
      attributes:boolean=true, rating:boolean=false, priceFrom:boolean=false,
      availability:boolean=true, badges:boolean=true, save:boolean=true,
      addToInquiry:boolean=true, hoverReveal:boolean=true,
    },
    nameFallback: enum(["code","role","firstName","hidden"]).default("firstName"),
    fieldKeys: string[].default([]),            // overrides card display catalog order; empty = catalog default
    maxFieldLines: number.int().min(1).max(6).default(3),
    cta: { label:string, behavior:enum(["profile","inquiry","external"]).default("profile"), externalHref:string? },
    hover: enum(["zoom","swap","revealTraits","none"]).default("revealTraits"),
  },

  // — Filters & Sidebar —
  sidebar: {
    show:boolean=false,                         // Atelier default = collapsed/off
    position:enum(["left","right"]).default("left"),
    sticky:boolean=true,
    defaultCollapsed:boolean=true,
    filterSearchBox:boolean=true,
  },
  topBar: { mode:enum(["none","talentType","field"]).default("talentType"), fieldKey:string? },
  sortControl: { show:boolean=true, allowed:string[] },
  showResultCount:boolean=true,
  showActiveChips:boolean=true,
  mobileFilterStyle:enum(["sheet","drawer","inline"]).default("sheet"),

  // — AI Search —
  ai: {
    mode:enum(["off","inlineStrip","heroBand","floating"]).default("heroBand"),
    placement:enum(["aboveCenter","aboveLeft","inSidebar","replaceHeading"]).default("aboveCenter"),
    title:string, body:string, placeholder:string,
    examplePrompts:string[].default([]),
    behavior:enum(["interpret","rerank"]).default("interpret"),
  },

  // — Empty / Loading / SEO —
  empty: { title:string, body:string, ctaLabel:string?, ctaHref:string? },
  structuredData:boolean.default(true),
}
```

`migrations.ts` ships empty (`{}`) like `featured_talent/migrations.ts`. `currentVersion = 1`.

---

## 4. The control drawer (`Editor.tsx`) — 7 tabs

Mirror `featured_talent/Editor.tsx` structure (tabbed, `onChange(next)` on every field, `tenantId`-scoped pickers, degraded path when `tenantId` undefined).

1. **Source & Audience** — scope, talent-type/tag multiselect, **feature-first picker** (ordered), **exclude picker**, requirePhoto, minTrustTier, excludeUnavailable, defaultSort, pagination, pageSize, entityLabel.
2. **Template** — template picker (live thumbnail; stubs greyed "Coming soon"), columns/breakpoint, density, heading show/text/align, containerWidth, background.
3. **Card** — style picker (thumbnail), aspect, per-element show toggles, **Hide name → nameFallback**, field chooser + order (reads `directory-card-display-catalog`), maxFieldLines, CTA, hover.
4. **Filters & Sidebar** — sidebar show/position/sticky/collapsed, filter-search box, facet order + per-field hide + collapse defaults (writes `directory_sidebar_layout`), **top bar mode** (`none`/`talentType`/`field`→`top_bar_facet_key`), sort control + allowed sorts, result count, active chips, mobile filter style.
5. **AI Search** — mode (off/inline/hero/floating), placement, editable title/body/placeholder, example-prompt repeater, behavior. Disabled state when `ai_master_enabled` is false (drawer shows the flag is off; does not silently no-op).
6. **Empty / Loading / SEO** — empty-state copy + CTA, structured-data toggle. (Skeleton auto-matches template; not a knob.)
7. **Presets** — vertical one-click packs (sets defaults, every knob still editable):

| Preset | Sets |
|---|---|
| Fashion / Model Agency ★ | atelier + portrait + requirePhoto + height/location facets + ai.heroBand |
| Professional Practice | practice + profile + specialty/location facets + cta=inquiry "Book consultation" |
| Home Services | field + service + map + rating/price/area + availability-first |
| Sports Roster | roster + stat + position/age facets |
| Creative Studio | mosaic + portfolio |
| Boutique Spotlight | showcase + editorial |

---

## 5. Premium design spec — the Impronta canonical look (non-negotiable)

The launch look = **Atelier + Portrait + ai.heroBand + topBar.talentType + sidebar.show=false**.

- **Tokens:** cool-not-warm only. `card-on-faint-cool-ground`, hairline borders, shadow on hover only. **Remove every `var(--impronta-gold-*)` usage on the directory surface** (currently in `directory/page.tsx:120` — a violation of the no-gold rule). Match the New Inquiry composer's token palette.
- **Type:** `font-display` headings, refined tracking; small-caps eyebrow for talent type; generous negative space.
- **Imagery:** figurative editorial portraits only — never placeholder boxes. Consistent 4:5, subtle `scale(1.0→1.03)` on hover, gradient scrim for name legibility.
- **Motion:** restrained — fade/translate-in on scroll, no bounce.
- **Card anatomy (Portrait):** full-bleed 4:5 image · bottom gradient · name (display) + talent-type eyebrow · trust badge (top-left, prominent — Discover spec) · agency/independent badge · availability pill (semantic, restrained — *not* loud red; "Unavailable {date}" or "Availability unknown — ask to confirm") · hover reveals 1–2 traits + save · whole card → `/t/<slug>`.

---

## 6. Phases

### Phase 0 — Scaffold + engine wrap (foundation gate)
- Create `web/src/lib/site-admin/sections/directory/`: `schema.ts`, `migrations.ts`, `meta.ts`, `Component.tsx`, `Editor.tsx`, `presets.ts`, `fetch.ts` (+ `directory-section.css` if needed). File-for-file mirror of `featured_talent/`.
- `meta.ts`: `{ key:"directory", category:"showcase", tag:"premium", inDefault:true, visibleToAgency:true, businessPurpose:"feature" }`.
- `Component.tsx` (server): reads `props/tenantId/locale/preview/publicPathPrefix`, renders the Atelier shell wrapping `DirectoryDiscoverSection` + conditional `HeroSearch`.
- Register: `registry.ts` (import block + `SectionRegistryEntry<DirectoryV1>` + map entry `directory: directorySection`), `registry-editors.ts`, `section-meta-registry.ts`.
- **Gate:** `cd web && npx tsc --noEmit && npm run lint` green. Section appears in Add-section picker (showcase tab, "premium" pill).

### Phase 1 — Canonical render (Atelier + Portrait + Editorial)
- Atelier shell: centered `font-display` header, AI hero band slot, slim talent-type pill bar, sidebar off, 4-col 4:5 portrait grid.
- Portrait + Editorial cards per §5. Trust/agency/availability per §10.
- Strip gold tokens; cool-not-warm only.
- **Verify in preview at 4 viewports** (mobile/tablet/desktop/wide). Screenshot proof to user. No "check it yourself."

### Phase 2 — Drawer wired to existing catalogs
- Build all 7 tabs (§4). Wire feature-first/exclude pickers (lift from `featured_talent`). Wire sidebar/card-field/filter tabs to the existing tenant-scoped tables (read + write).
- AI tab: modes/placement/copy/prompts; honor `ai_master_enabled` (visible disabled state, never silent).
- Live builder preview reflects every knob.

### Phase 3 — Retire the monolith; seed a portable starter page
**Goal: the directory becomes a builder page like any other, NOT a privileged route.**
- Confirm the generic builder-page renderer (the `[...slug]`/CMS page path other tenant pages already use) renders the Directory section instance correctly, scoped/labeled per its saved config.
- Replace the hardcoded composition in `app/(public)/directory/page.tsx`: it should resolve to a **seeded builder page** (default slug `directory`, Fashion preset) — tenant-renameable/re-scopable/duplicable/deletable. Nothing in the renderer may branch on "is this /directory".
- Verify multi-instance: create a 2nd page ("Our Chefs", `scope=byTalentType` chefs only) — proves independence from the 1st.
- Preserve at the builder-page layer (not bolted to one route): `directoryPublic` gate, `generateMetadata`, `DirectoryAnalyticsMount`, `DiscoveryStateBridge`, `MergeGuestFavorites`, `DirectoryInquiryUrlSync`, Supabase-not-configured + paused fallbacks.
- **QA on the localhost dev server** (preview tools): filters, AI interpret, infinite scroll, save, add-to-inquiry on the seeded page AND the 2nd scoped page. Deploy/promote/`deploy:smoke` is a **separate, user-authorized step** — not done autonomously on shared `phase-1`.

### Phase 4 — Variation system (incremental, post-launch-safe)
- Light up remaining templates/cards one PR each behind the picker. Schema already supports them → **no migration, no schema churn**.
- Ship the 6 preset packs.
- Order by demand: Practice (lawyers/dentists), Field (services), Roster (sports), then Studio/Mosaic/Showcase/Map-first.

---

## 7. File manifest

```
web/src/lib/site-admin/sections/directory/
  schema.ts          NEW   Zod v1 (§3)
  migrations.ts      NEW   {} (empty, like featured_talent)
  meta.ts            NEW   SectionMeta
  presets.ts         NEW   6 vertical packs (§4.7)
  fetch.ts           NEW   server data hooks if Component needs them beyond DiscoverSection
  Component.tsx      NEW   server render — Atelier shell + DiscoverSection + HeroSearch
  Editor.tsx         NEW   7-tab drawer (§4)
  DirectoryCard.tsx  NEW   Portrait + Editorial (v1); switch on card.style
  directory-section.css  NEW (opt) scoped premium styling
web/src/lib/site-admin/sections/registry.ts            EDIT  import + entry + map
web/src/lib/site-admin/sections/registry-editors.ts    EDIT  Editor registration
web/src/lib/site-admin/sections/section-meta-registry.ts EDIT meta registration
web/src/app/(public)/directory/page.tsx                EDIT (Phase 3) → resolves to a seeded builder page (no privileged route)
```

No new DB migration required for Phases 0–3 (drawer writes to existing `directory_sidebar_layout` / `field_definitions` / config). If feature-first ordering needs persistence beyond section props, evaluate in Phase 2 — prefer storing in section payload, not new tables.

---

## 8. Section-contract conformance checklist

- [ ] `schema.ts` exports `directoryV1` Zod + `type DirectoryV1`
- [ ] `migrations.ts` exports `directoryMigrations = {}`
- [ ] `meta.ts` exports `directoryMeta: SectionMeta` (category `showcase`, `inDefault:true`, tag `premium`)
- [ ] `Component` is a server component, consumes `SectionComponentProps<DirectoryV1>`, honors `preview` + `publicPathPrefix` + `builderNodeBindings`
- [ ] `Editor` consumes `SectionEditorProps<DirectoryV1>`, calls `onChange(next)` on every change, degrades when `tenantId` undefined
- [ ] Registered in all 3 registries; `currentVersion = 1`
- [ ] Passes `node-presentation-render.test.ts` + `section-meta-registry.test.ts`

## 9. Branch / shipping discipline

`phase-1` is shared/multi-agent. Per repo CLAUDE.md + branch-governance memory:
- `git pull --rebase origin phase-1` before every edit.
- Scoped commits only; never touch other agents' in-flight work; **never force-push** `phase-1`.
- `cd web && npx tsc --noEmit && npm run lint` before every commit (gate for the next agent).
- No new migration expected; if one is added, unique `date -u +%Y%m%d%H%M%S` + `npm run db:push` before commit (per schema-shipping protocol).
- Pre-launch: ship straight to prod, one canonical version, no parallel mockups (the variation *system* is productized config, not throwaway mockups).
- Report a status check (tsc/lint/smoke) before declaring each phase done; demonstrate visible QA-proven UX, not tsc-clean commits.

## 10. Discover binding-spec compliance gate (HARD — `discover-and-unified-inquiry-2026-05-14.md`)

Phase 1 cannot be declared done until every box is true:

- [ ] **Same source as profile** (§2.8): card data pulls from the same source as `tulala.digital/t/<slug>`; "View profile" → that URL.
- [ ] **Trust badge prominent on card** (§ trust pillar, §5.3): not hidden; top-region placement.
- [ ] **Agency vs independent** (§ network pillar): first-class card badge ("Hub Milan · exclusive" form) **and** a filter facet.
- [ ] **Availability signal** (§5.4): denormalized — date-conflict pill when event dates set; **"Availability unknown — ask to confirm"** fallback for talents who don't block dates. Restrained semantic styling (no loud red — honors the no-red-orange aesthetic rule; status ≠ decorative accent).
- [ ] **`is_discoverable` sovereign** (§ open-decision RATIFIED): a talent's personal opt-in always wins; workspace plan tier never gates *visibility*, only admin-side tools. The section must not add a visibility gate that overrides this.
- [ ] **Verification-gated premium card features** (§ open-decision RATIFIED): rate-band visibility / priority placement gate on verification + trust tier; unverified still appear with a "Basic" badge.
- [ ] **Perf budget** (§ perf): page of 24 cards < 300ms p95; preserve `Cache-Control: private, max-age=30` on card data. Do not regress with the shell rewrite.
- [ ] **T2 reuse** (§ talent-dash audit): the same `DirectoryCard` component is renderable with a single talent's own data for the future "how my card looks to clients" preview — keep it prop-driven, no page-scoped globals.
- [ ] **No "buyer/buy" language** anywhere in copy or drawer (dignity rule). Use "client" / persona titles.

---

*Author: directory-section design pass, 2026-05-19. Supersedes nothing; subordinate to remediation-plan-2026-05-19 and the Discover binding spec.*
