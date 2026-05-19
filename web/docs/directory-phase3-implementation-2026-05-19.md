# Directory Section — Phase 3 Implementation Plan (2026-05-19)

**Status:** Research + file-level plan. Investigation only — no code written.
**Subordinate to:** `web/docs/directory-section-execution-plan-2026-05-19.md` (the binding feature plan; §0.1 portability, Phase 3, Amendment A3).
**Lane boundary:** READ-ONLY for all existing code. The companion lane owns `web/src/lib/site-admin/sections/directory/*` and `web/src/app/(public)/directory/page.tsx`; this plan does not mutate them, it specifies what they must become.

---

## Executive summary

The directory section component, schema, and 7-tab drawer are already built and registered in all three registries (Phases 0–2, done by the companion lane). The remaining Phase-3 work is **not** a renderer problem — the generic builder renderer (`loadPageForRender` → `HomepageCmsSections`) already resolves and renders any registered section instance (including `directory`) for a tenant page keyed by slug, and there is a battle-tested precedent for seeding a *system-owned* page + composition per tenant: the **site-shell backfill** (`system_template_key='site_shell'`, fixed slug, service-role insert + hand-rolled publish). The recommended approach is to **mirror the site-shell pattern**: introduce a `system_template_key='directory'` seeded `cms_pages` row at fixed slug `directory` whose single `main`-slot section is a `directory` instance seeded from `fashionDirectoryPreset`, then **rewrite `app/(public)/directory/page.tsx` to resolve that seeded page through `loadPageForRender` + `HomepageCmsSections`** while keeping all six route-bolted behaviors (gate, metadata, analytics, discovery bridge, guest-merge, inquiry-url-sync) at the route layer wrapping the builder body. Multi-instance ("Our Chefs") then comes for free: it is a *non-system* `standard_page` with slug `our-chefs` carrying a second `directory` section scoped `by_talent_type` — already creatable through the existing page-builder CRUD with zero new code. The single biggest risk is the **`/directory` surface-allow-list collision**: `/directory` is an explicit entry in `AGENCY_STOREFRONT_PREFIXES`, so the request *always* hits the dedicated route file and is *never* CMS-clean-URL-rewritten to `/p/directory` — meaning the rewrite cannot be relied on and the dedicated route file must itself do the seeded-page resolution (a thin adapter, not a delete), and the seeded row must use a system slug that cannot collide with a tenant-authored page at the same slug.

---

## 1. How the generic builder/CMS page renderer works

### 1.1 The two public render entrypoints

| Surface | Route file | Resolution fn | Renderer |
|---|---|---|---|
| Homepage (`/`) | `web/src/app/page.tsx` → `web/src/components/home/agency-home-storefront.tsx` | `loadHomepageForRender(tenantId, locale)` (`web/src/lib/site-admin/server/homepage-reads.ts`) | `HomepageCmsSections` |
| Any other builder page (`/p/<slug>`, and clean URLs rewritten to it) | `web/src/app/(public)/p/[[...slug]]/page.tsx` | `loadPageForRender(tenantId, locale, slug)` (`web/src/lib/site-admin/server/page-reads.ts:381`) | `HomepageCmsSections` |

Both converge on **`HomepageCmsSections`** (`web/src/components/home/homepage-cms-sections.tsx`).

### 1.2 `loadPageForRender` (the function the seeded directory page will use)

`web/src/lib/site-admin/server/page-reads.ts:381-394`:

- `loadPageForRender(tenantId, locale, slug)`:
  - If preview or edit-mode active for the tenant → `loadDraftCmsPageBySlug` (uncached, service-role, draft-first: reads `cms_page_sections WHERE is_draft=TRUE`, falls back to live rows, then `cms_sections.props_jsonb`).
  - Else → `loadPublicPage` (cached via `unstable_cache`, RPC `cms_public_pages_for_tenant`, **published-only**, reads `published_page_snapshot`).
- Returns `PublicPageWithSnapshot | null`. `null` ⇒ no page / not published / legacy body-only.
- **Key detail for Phase 3:** `loadDraftCmsPageBySlug` early-returns `null` when `system_template_key === 'homepage'` (`page-reads.ts:246`). It does **not** filter out other system keys — a `system_template_key='directory'` row resolves through this path normally. `loadPublicPage` has no system-key filter at all (it's slug+locale+published).

### 1.3 `HomepageCmsSections` — how a section instance is resolved + rendered

`web/src/components/home/homepage-cms-sections.tsx`:

- Receives a `HomepageSnapshot` (`{ slots: [{ slotKey, sortOrder, sectionId, sectionTypeKey, schemaVersion, name, props }], builderTree }`).
- For each slot entry (`homepage-cms-sections.tsx:226-358`):
  - `SECTION_REGISTRY[entry.sectionTypeKey]` (imported from `web/src/lib/site-admin/sections/registry.ts`) → `registryEntry`. Unknown key ⇒ skipped (edit-mode shows an amber orphan card; view-mode renders nothing).
  - `migrateSectionPayload(registryEntry, entry.schemaVersion, entry.props)` runs the section's migration map.
  - `prefixPublicHrefsDeep(payload, publicPathPrefix)` rewrites internal hrefs for path-based tenant hosts.
  - `const Component = registryEntry.Component;` → rendered with `props`, `tenantId`, `locale`, `publicPathPrefix`, `builderNodeBindings`, `preview`.
- The `directory` section is registered at `web/src/lib/site-admin/sections/registry.ts:552` (`directorySection: SectionRegistryEntry<DirectoryV1>`) and mapped at `registry.ts:806` (`directory: directorySection`). Its `Component` is `DirectoryComponent` (`web/src/lib/site-admin/sections/directory/Component.tsx`), which already consumes `SectionComponentProps<DirectoryV1>`, honors `publicPathPrefix`, embeds `HeroSearch`, and fetches via `loadDirectorySectionTalents` (`web/src/lib/site-admin/sections/directory/fetch.ts`, Discover/Path-A data bridge).

**Conclusion:** the renderer is *already capable* of painting a `directory` section instance for any tenant page with no renderer change. The work is purely (a) get a seeded page row + section pointer into the DB per tenant, and (b) make the `/directory` URL resolve to it.

---

## 2. How a page + section instance is seeded for a tenant

### 2.1 Existing seeding precedents (3 found)

| Precedent | File | What it seeds | Pattern |
|---|---|---|---|
| **Homepage** | `web/src/lib/site-admin/server/homepage.ts:422` `ensureHomepageRow` + `web/src/lib/site-admin/server/onboard-starter-content.ts` | `cms_pages` row `system_template_key='homepage'`, slug `''`, then Free-starter sections + composition + publish | Idempotent ensure → `upsertSection` per entry → `saveHomepageDraftComposition` → `publishHomepage` |
| **Site shell** ★ best match | `web/src/lib/site-admin/edit-mode/site-shell-backfill-action.ts` | `cms_pages` row `system_template_key='site_shell'`, slug `'__site_shell__'`, `is_system_owned=true`, `template_key='page'`, + header/footer section rows, + **hand-rolled publish** | Service-role direct `cms_pages` INSERT (bypasses `upsertPage` template gate) → `upsertSection` for each section → direct `cms_page_sections` INSERT (`is_draft=true`) → hand-rolled snapshot bake + flip to live |
| **Free one-pager** | `web/src/lib/site-admin/server/onboard-starter-content.ts:291` `seedFreeStarterHomepage` | 4 sections (hero/category_grid/featured_talent/cta_banner) into the homepage composition | `getLibraryDefault(typeKey)` for default props → `sectionUpsertSchema.safeParse` → `upsertSection` → `publishSection` → `saveHomepageDraftComposition` → `publishHomepage` |

The **site-shell backfill** is the gold reference for this work because it seeds a *named system page that is not the homepage* with its own composition and an immediate publish — exactly the shape a seeded directory page needs.

### 2.2 The directory section already has a library default

`web/src/lib/site-admin/sections/shared/default-content.ts:279-282`:

```ts
directory: {
  name: "Directory — new",
  props: fashionDirectoryPreset,
},
```

So `getLibraryDefault("directory")` (`default-content.ts:761`) returns `{ name: "Directory — new", props: fashionDirectoryPreset }`. `fashionDirectoryPreset` (`web/src/lib/site-admin/sections/directory/presets.ts`) is the canonical Atelier + Portrait + AI-hero-band config. **No new default content is required** — the seed can use `getLibraryDefault("directory")` directly, identical to how `seedFreeStarterHomepage` seeds its sections.

### 2.3 How to seed a default "directory" page per tenant (recommended shape)

Mirror `seedSiteShellForTenant` (the exported fn in `site-shell-backfill-action.ts`). New module: **`web/src/lib/site-admin/server/onboard-directory-page.ts`** (NEW FILE — outside the companion lane's `sections/directory/` boundary; it lives under `site-admin/server/`).

`ensureDirectoryPage({ admin, tenantId, locale, actorProfileId })` — idempotent:

1. **Load-or-skip:** `SELECT … FROM cms_pages WHERE tenant_id=? AND locale=? AND is_system_owned=true AND system_template_key='directory'`. If found → return it (idempotent, like `ensureHomepageRow`).
2. **Create the directory section:** `getLibraryDefault("directory")` → `sectionUpsertSchema.safeParse({ tenantId, sectionTypeKey:"directory", schemaVersion: directorySection.currentVersion, props: defaults.props, expectedVersion:0, name: defaults.name })` → `upsertSection(admin, …)`.
3. **Create the page row** (service-role direct INSERT, exactly as site-shell does at `site-shell-backfill-action.ts:232`):
   ```
   tenant_id, locale,
   slug: 'directory',                 // see §3.3 + Risk R1 for slug choice
   template_key: 'page',              // matches site-shell; bypasses getTemplate() because this is a direct admin insert, not upsertPage
   template_schema_version: 1,
   system_template_key: 'directory',
   is_system_owned: true,
   title: 'Directory',                // tenant-renameable later via the page-meta editor (system slug stays locked by the trigger)
   status: 'draft', version: 1,
   include_in_sitemap: true, noindex: false,
   created_by/updated_by: actorProfileId
   ```
4. **Insert the section pointer:** `cms_page_sections` INSERT `{ tenant_id, page_id, section_id, slot_key:'main', sort_order:0, is_draft:true }`. (Standard-page composition uses a single `main` slot — confirm against `web/src/lib/site-admin/templates/standard-page/meta.ts`; the renderer does not enforce slot names for non-homepage pages per `composition-actions.ts:1013-1016` "Non-homepage pages have no template restrictions — any section type is valid in any slot", so `main` is safe.)
5. **Hand-rolled publish** (copy the snapshot-bake + `is_draft=false` flip + version bump + cache-bust block from `site-shell-backfill-action.ts:280` onward), because `publishPageSnapshot` in `page-composer-action.ts:157` rejects `system_template_key==='homepage'` and is not wired for arbitrary system keys — the site-shell author hit the same wall and hand-rolled it.

**Wiring the seed call (two integration points, mirrors site-shell + homepage):**
- **New self-serve tenants:** add an `ensureDirectoryPage(...)` call alongside `onboardStarterContent` in the workspace-signup provisioning path (`onboard-starter-content.ts` is called from `workspace-signup.server.ts` per its header doc). For Phase 3 scope, gate it behind the same `seedFreeStarter`-style flag, or call unconditionally for studio/agency (see §5 plan-tier seam).
- **Existing tenants (e.g. Impronta on the shared remote Supabase):** a one-shot backfill action mirroring `site-shell-backfill-action.ts` so Impronta gets the row immediately for QA. The seed is idempotent so re-runs are safe.

**No DB migration required** (Phase 3 manifest §7 says so). `system_template_key` is a free-text column (site-shell added `'site_shell'` with no enum migration). Confirm the `cms_pages_system_ownership_guard` trigger blocks slug/template mutation but allows INSERT of a new system key (site-shell proves it does).

---

## 3. The exact change to make `/directory` resolve to the seeded page

### 3.1 The core constraint (Risk R1, restated as the design driver)

`web/src/lib/saas/surface-allow-list.ts:91-105` — `/directory` is a literal member of `AGENCY_STOREFRONT_PREFIXES`. In `proxy.ts:300-310`, the CMS clean-URL rewrite to `/p/{slug}` **only fires when `!isPathAllowedForHostKind("agency", path)`**. Because `/directory` *is* allowed, it is **never** rewritten — it always lands on the Next route segment `web/src/app/(public)/directory/page.tsx`. Two consequences:

1. We cannot "just delete the route and let the CMS catch-all handle it" — the request would still match `AGENCY_STOREFRONT_PREFIXES` and Next would 404 (no `/directory` segment, and no rewrite to `/p/directory`).
2. The dedicated route file must remain and become a **thin adapter** that performs the same seeded-page resolution `(public)/p/[[...slug]]/page.tsx` does, scoped to the directory system page.

This is the safest path *and* it satisfies §0.1 portability: nothing in the renderer branches on "is /directory" — the route file just calls the generic `loadPageForRender` + `HomepageCmsSections`. The "privileged route" is reduced to a URL alias whose body is 100% builder-resolved.

### 3.2 Target shape of `app/(public)/directory/page.tsx` (companion lane will write this; spec only)

Replace the body (currently `<DirectoryComponent props={fashionDirectoryPreset} tenantId="" .../>`) with seeded-page resolution, preserving every route-bolted behavior:

```
generateMetadata(): keep buildPublicPageMetadata("directory", locale) as the
  fallback, BUT prefer the seeded page's meta (mirror p/[[...slug]]/page.tsx
  generateMetadata: resolve tenant scope → loadPublicPage → meta_title/desc/og).

default export DirectoryPage():
  locale = getRequestLocale()
  if (!isSupabaseConfigured()) → existing config-missing fallback (KEEP)
  publicSettings = getPublicSettings()
  if (!publicSettings.directoryPublic) → existing paused fallback (KEEP)   // gate stays at the route layer
  publicScope = getPublicTenantScope()                                     // { tenantId } from middleware header
  if (!publicScope) → notFound() / neutral state
  sectionPage = loadPageForRender(publicScope.tenantId, locale, "directory")
  if (sectionPage?.snapshot):
     <PublicHeader/>
     <DirectoryAnalyticsMount/>                                           // KEEP
     <DiscoveryStateBridge savedIds={await getSavedTalentIds()}/>          // KEEP
     {actor.user ? <MergeGuestFavorites/> : null}                         // KEEP
     <Suspense><DirectoryInquiryUrlSync/></Suspense>                      // KEEP
     <main><HomepageCmsSections snapshot={sectionPage.snapshot}
            tenantId={publicScope.tenantId} locale={locale}/></main>
     <footer>…PublicCmsFooterNav…</footer>
  else:
     // seeded row missing (un-backfilled tenant) → FALLBACK to the current
     // direct <DirectoryComponent props={fashionDirectoryPreset}/> render.
     // This is the incremental-safety hinge (see §3.4).
```

The directory `(public)/layout.tsx` + `(public)/directory/layout.tsx` providers (`DirectoryQueryProvider`, `PublicDiscoveryStateProvider`, `DirectoryInquiryModalProvider`, `DirectoryInquirySheet`, `PublicFlashHost`) are **unchanged** — they wrap the route either way, so save / add-to-inquiry / AI continue to work identically whether the body is the direct component or the builder-resolved one.

### 3.3 Slug choice — `directory` vs a fenced system slug (Risk R1 mitigation)

Two options:

- **Option A — slug = `directory`.** Clean: the seeded page's natural slug equals the URL. Risk: a tenant could try to create a *second* `standard_page` with slug `directory`, colliding with the system row. Mitigations already in the codebase: (1) `cms_pages` has the unique partial index `cms_pages_system_lookup_idx (tenant_id, locale, system_template_key)` guaranteeing one system directory row; (2) there is a broader `cms_pages` slug-uniqueness constraint per `(tenant_id, locale, slug)` (verify exact constraint name in `supabase/migrations/20260620130000_saas_p5_m3_pages.sql`) — if it exists tenant-side dup creation already fails with `RESERVED_SLUG`/unique violation surfaced by `pages.ts:mapTriggerError`. **Recommended** if that uniqueness constraint exists.
- **Option B — fenced system slug (e.g. `__directory__`), like site-shell's `__site_shell__`.** The route file resolves `loadPageForRender(tenantId, locale, "__directory__")` explicitly; the URL stays `/directory` but the slug is non-collidable and the page is invisible to `/p/__directory__` (double-underscore slugs are filtered by `isValidSlugPath` in `web/src/lib/cms/paths.ts` — the `SLUG_SEGMENT` regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` rejects `__directory__`, so `/p/__directory__` 404s cleanly and can't double-serve). This exactly mirrors the proven site-shell decision.

**Recommendation:** Option B (`__directory__`). It is the *exact* pattern already validated for site-shell, eliminates the tenant-collision class entirely, and the route file already needs to be a bespoke adapter (§3.1) so passing a fixed system slug to `loadPageForRender` costs nothing. Tenant rename of the *display title* still works (the trigger only locks slug/locale/template_key, not `title`). The portability requirement is about the *section instance* being re-scopable/duplicable, not about the system row's slug being human — and the duplicate/"Our Chefs" instance (§4) is a normal slug page anyway.

### 3.4 Incremental safety — never regress the working `/directory`

The hardcoded render works *today*. The plan keeps a working `/directory` at every commit:

1. **Step 1 (additive, no behavior change):** land `onboard-directory-page.ts` + the backfill action. No route change yet. `/directory` still renders the hardcoded `DirectoryComponent`. Verifiable: the seeded row exists in DB; `/p/__directory__` (Option B) 404s, or `loadPageForRender(tenant,locale,'__directory__')` returns a snapshot when probed from a scratch script.
2. **Step 2 (guarded swap):** rewrite the route file with the `if (sectionPage?.snapshot) { …builder… } else { …existing direct DirectoryComponent… }` fork (§3.2). For any tenant whose seed ran, the builder path renders; for any tenant without the row, the **identical current output** renders. Zero-regression by construction — the fallback *is* the old code.
3. **Step 3 (cleanup, optional/Phase 3 tail):** once Impronta (and all live tenants) are backfilled and QA-confirmed, the `else` fallback can be reduced to a neutral empty state, but keeping the direct-component fallback indefinitely is acceptable and is the most conservative choice on shared `phase-1`.

---

## 4. Multi-instance proof — a 2nd "Our Chefs" directory page

This requires **zero new code** — it exercises the existing page-builder CRUD and proves §0.1 portability (two instances of the same section type, differing only in saved config).

### 4.1 Why it already works

- A second directory page is a **non-system `standard_page`** (`template_key='standard_page'`, `is_system_owned=false`), created through the existing flow at `web/src/app/admin/site-settings/pages/new/page.tsx` → `upsertPage` (`web/src/lib/site-admin/server/pages.ts:275`). Slug `our-chefs` is not reserved (`web/src/lib/site-admin/reserved-routes.ts` — `directory` itself isn't even reserved; `our-chefs` certainly isn't).
- Its composition gets a `directory` section via the editor's `createAndInsertSectionAction` (`web/src/lib/site-admin/edit-mode/composition-actions.ts:960`) — the directory section is `visibleToAgency:true, inDefault:true` (`web/src/lib/site-admin/sections/directory/meta.ts`) so it appears in the Add-section picker and is returned by `listAgencyVisibleSections` (consumed at `composition-actions.ts:289`).
- The second instance's drawer (`DirectoryEditor`) sets `scope: "by_talent_type"`, `talentTypeKeys: ["chef"]` (or the tenant's chef taxonomy slug). `loadDirectorySectionTalents` (`web/src/lib/site-admin/sections/directory/fetch.ts:99-146`) filters `DiscoverTalentListItem.primaryTypeSlug` against `talentTypeKeys` — independent per instance, no page-scoped globals.
- It publishes via the normal page publish (`publishPageSnapshot` / `pages.ts:publishPage`), and renders at **`/p/our-chefs`** through `(public)/p/[[...slug]]/page.tsx` → `loadPageForRender` → `HomepageCmsSections` → `DirectoryComponent`. (Or at the clean URL `/our-chefs` via the proxy CMS-rewrite, since `our-chefs` is not in any allow-list and matches the single-segment rewrite regex at `proxy.ts:304`.)

### 4.2 Concrete QA steps (localhost dev server)

Dev server on `localhost:3000`. Public routes need the Impronta host. Two equivalent host forms:
- `curl -s -H "Host: impronta.lvh.me" http://localhost:3000/directory` (per task brief; `impronta.lvh.me` resolves via `scripts/local-host-proxy.mjs` / launch.json proxy config to the Impronta agency host).
- or path-based: `http://localhost:3000/impronta/directory` (the per-memory local pattern: `localhost`/`localhost:3000` are `agency_domains` kind=app, so `/impronta/...` is the path-based tenant route).

Steps:

1. **Backfill Impronta's directory system page** (run the Step-1 action against the linked remote Supabase, or a scratch `tsx` script calling `ensureDirectoryPage`).
2. **Verify instance 1 (seeded default):**
   - `curl -s -H "Host: impronta.lvh.me" http://localhost:3000/directory` → 200, returns the Atelier shell (`data-section="directory" data-template="atelier"`), the AI HeroSearch input, the portrait grid. Compare DOM to the pre-change hardcoded render — should be visually identical (same preset, same `DirectoryComponent`, just sourced from the snapshot).
   - Smoke the engine: AI interpret (type a query, confirm URL-sync), save (heart toggles, `DiscoveryStateBridge`), add-to-inquiry (sheet opens via `DirectoryInquirySheet`), result count.
3. **Create instance 2 ("Our Chefs"):**
   - Sign in as Impronta admin (`/api/dev/signin`, creds in `reference_qa_credentials.md`).
   - `admin/site-settings/pages/new` → title "Our Chefs", slug `our-chefs`, template Standard page → create (draft).
   - Open it in the page builder/editor, Add section → Directory (showcase tab, "premium" pill).
   - In the Directory drawer Source & Audience tab: scope = By talent type, talent types = Chef. Save.
   - Publish the page.
4. **Verify instance 2 independent:**
   - `curl -s -H "Host: impronta.lvh.me" http://localhost:3000/p/our-chefs` (and `…/our-chefs`) → 200, directory grid containing **only chefs** (or the AVAILABILITY_UNKNOWN empty state if no chef talent — still proves the scope filter ran).
   - Re-`curl` `/directory` → still the full unscoped roster. **Both render independently; instance 2's `by_talent_type` config does not leak to instance 1.** This is the portability proof.
5. **Rename/duplicate/delete sanity (optional, proves "like any builder page"):** rename "Our Chefs" → "Our Lawyers" + rescope talentTypeKeys; duplicate the page; archive it — all via existing page CRUD, no directory-specific code.

> tsc note: per the task brief, `npx tsc --noEmit` currently has ~25 unrelated baseline errors from the companion lane's `talent_type_grid` work — ignore those; only regressions introduced by Phase 3 files matter.

---

## 5. Risks, plan-tier gating seam, and ordered task list

### 5.1 Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| **R1** | `/directory` is in `AGENCY_STOREFRONT_PREFIXES` → never CMS-rewritten; deleting the route 404s; tenant could author a colliding `directory` slug. | **High** (the central design constraint) | Keep the route file as a thin seeded-page adapter (§3.1–3.2); use fenced system slug `__directory__` (Option B, §3.3) — eliminates tenant collision, mirrors proven site-shell. |
| R2 | `publishPageSnapshot` (`page-composer-action.ts:157`) hard-rejects non-`homepage`… actually rejects only `homepage`, but is **not wired** for arbitrary system keys; reusing it for the seed may misbehave. | Medium | Hand-roll the publish in the seed, copying `site-shell-backfill-action.ts:280+` (that author hit the identical wall). Do not extend the shared helper under this lane. |
| R3 | `loadDraftCmsPageBySlug` early-returns `null` for `system_template_key==='homepage'` only — a future guard could add `'directory'`. | Low | Documented here; the directory system row must remain resolvable through both `loadPublicPage` (published) and `loadDraftCmsPageBySlug` (preview/edit). Add a regression note, not code. |
| R4 | Seeded row not present for already-live tenants (Impronta) → builder path no-ops. | Medium | The guarded fork (§3.4 Step 2) falls back to the **exact current** `DirectoryComponent` render — zero regression. Backfill action makes it idempotent + safe to re-run. |
| R5 | Perf: `DirectoryComponent` already fetches via the Discover bridge (`fetch.ts` → `loadDiscoverTalents`); routing through the snapshot adds a `loadPageForRender` DB read. | Low | `loadPublicPage` is `unstable_cache`-wrapped + tag-invalidated (`page-reads.ts:90,133`). Discover spec §perf budget (24 cards <300ms p95) is about card data, unchanged. Confirm in QA, do not regress. |
| R6 | `cms_pages` slug-uniqueness / reserved-slug constraint behavior under a system slug. | Low | Site-shell already inserts `__site_shell__` system-owned with no issue; `__directory__` is the same class. Verify the exact constraint name in `supabase/migrations/20260620130000_saas_p5_m3_pages.sql` during implementation. |
| R7 | Two agents on `phase-1`; companion lane owns `sections/directory/*` + the route file. | Process | This plan's new code lives in `site-admin/server/onboard-directory-page.ts` + a backfill action (+ wiring in signup provisioning) — **no file overlap** with the companion lane except the route file, which is *theirs to write* per §3.2 spec. Coordinate the route-file rewrite handoff explicitly. |

### 5.2 Plan-tier gating seam (Amendment A3 — record only, enforcement is Track C)

Per the binding plan §Amendment A3 + the branch-governance memory: **do not unilaterally flip plan gating.** `web/src/lib/access/plan-capabilities.ts` is deliberately permissive (`PLAN_CAPABILITIES`: every plan = `ALL_CAPS`); first differentiated denial is a platform-wide Track-C switch. The Phase-3 seams to *leave in place* (not activate):

- **Seeding seam:** the `ensureDirectoryPage` call in the signup provisioning path is where Studio/Agency get the seeded directory page and **Free does not** (Free = ~5 inline on the landing one-pager, already done — A3 says build nothing for Free). For Phase 3, gate the seed call behind the same predicate the Free-starter uses, or seed unconditionally and rely on Track C to gate *visibility* later. Either is acceptable pre-launch (the section is plan-neutral in the picker today, consistent with the inert capability map).
- **Section-availability seam (future, Track C):** when Track C activates, add capability key `directory_page` granted to `studio`/`agency`/`network`, removed from `free`; filter at `listAgencyVisibleSections` consumers (`web/src/lib/site-admin/index.ts`, `web/src/lib/site-admin/edit-mode/composition-actions.ts:289`) so `directory` drops from the picker when the tenant plan lacks it.
- **Instance-count seam (future, Track C):** Studio→1 directory page, Agency→unlimited as a `PLAN_LIMITS` entry, enforced where `upsertPage` already calls `cmsAdditionalPageDeniedReason(plan)` (`web/src/lib/site-admin/server/pages.ts:316-322`) — the additional-page denial hook already exists; a directory-page-count limit would extend that same gate.

No Phase-3 code activates any of the above. This plan only documents the seam locations.

### 5.3 Ordered task list (exact file paths)

1. **Confirm DB invariants (read-only, no code):**
   - `supabase/migrations/20260620130000_saas_p5_m3_pages.sql` — confirm `cms_pages` per-`(tenant_id,locale,slug)` uniqueness + the `cms_pages_system_lookup_idx (tenant_id,locale,system_template_key)` partial unique index + the system-ownership trigger allows INSERT of a new `system_template_key`.
   - `web/src/lib/site-admin/templates/standard-page/meta.ts` — confirm the slot key used for single-section standard pages (expected `main`).
2. **NEW: `web/src/lib/site-admin/server/onboard-directory-page.ts`** — `ensureDirectoryPage({ admin, tenantId, locale, actorProfileId })`. Mirror `seedSiteShellForTenant` in `web/src/lib/site-admin/edit-mode/site-shell-backfill-action.ts`: load-or-skip by `system_template_key='directory'`; `getLibraryDefault("directory")` → `sectionUpsertSchema.safeParse` → `upsertSection` (`web/src/lib/site-admin/server/sections.ts`); direct `cms_pages` INSERT (`system_template_key='directory'`, slug `__directory__`, `is_system_owned=true`, `template_key='page'`); `cms_page_sections` INSERT (`slot_key:'main'`, `is_draft:true`); hand-rolled snapshot bake + live flip + version bump + cache-bust (copy `site-shell-backfill-action.ts:280+`). Idempotent.
3. **NEW: backfill server action** (e.g. `web/src/lib/site-admin/edit-mode/directory-page-backfill-action.ts`, mirroring `site-shell-backfill-action.ts`'s exported action) — `requireStaff` + `requireTenantScope` → `ensureDirectoryPage(...)`. Used to backfill Impronta (and any existing tenant) for QA without a signup.
4. **WIRE: signup provisioning** — add an `ensureDirectoryPage(...)` call next to `onboardStarterContent` wherever `workspace-signup.server.ts` provisions a new workspace (grep `onboardStarterContent(` call sites). Phase-3: behind the studio/agency predicate or unconditional (§5.2). (This file is outside both lanes' section boundaries — confirm no concurrent edit before touching.)
5. **HANDOFF spec to companion lane — rewrite `web/src/app/(public)/directory/page.tsx`** per §3.2: keep `isSupabaseConfigured` + `directoryPublic` + analytics/bridge/guest-merge/url-sync wrappers; resolve `loadPageForRender(getPublicTenantScope().tenantId, locale, "__directory__")`; render `<HomepageCmsSections snapshot=… />` when present; **else fall back to the existing `<DirectoryComponent props={fashionDirectoryPreset}/>` block verbatim** (zero-regression hinge). Also prefer seeded-page meta in `generateMetadata` (mirror `(public)/p/[[...slug]]/page.tsx:31-83`), `buildPublicPageMetadata("directory", locale)` as fallback. *(This is the only existing-file edit, and it belongs to the companion lane per the lane boundary — coordinate.)*
6. **GATE:** `cd web && npx tsc --noEmit && npm run lint` — only Phase-3-introduced errors block; ignore the ~25 baseline `talent_type_grid` errors.
7. **QA on localhost (§4.2):** backfill Impronta → `/directory` (seeded path) AND create+publish "Our Chefs" `standard_page` with a `by_talent_type` directory instance → confirm both render independently; smoke filters/AI/save/add-to-inquiry on both. Screenshot proof (no "check it yourself" per the visible-QA memory).
8. **Do NOT** deploy/promote/`deploy:smoke`/push — shared `phase-1`; user-authorized step only (per branch-governance memory + Phase-3 plan §6/§9).

---

## Appendix — key file/function index (all paths absolute-relative to repo root)

- Generic builder renderer: `web/src/components/home/homepage-cms-sections.tsx` (`HomepageCmsSections`, dispatch loop L226-358; `SECTION_REGISTRY` lookup L230).
- Page resolution (slug-keyed): `web/src/lib/site-admin/server/page-reads.ts` (`loadPageForRender` L381, `loadPublicPage` L84, `loadDraftCmsPageBySlug` L154, homepage early-return L246).
- CMS public route (the model adapter): `web/src/app/(public)/p/[[...slug]]/page.tsx` (`loadPageForRender` L104, `HomepageCmsSections` L110, meta L31-83).
- Hardcoded directory route (to become a thin adapter): `web/src/app/(public)/directory/page.tsx` (`DirectoryComponent` + `fashionDirectoryPreset` L95-101; the 6 route-bolted behaviors L88-93).
- Section registry (directory already registered): `web/src/lib/site-admin/sections/registry.ts` (`directorySection` L552, map entry `directory:` L806).
- Directory section component: `web/src/lib/site-admin/sections/directory/Component.tsx`; data: `web/src/lib/site-admin/sections/directory/fetch.ts`; preset/default: `web/src/lib/site-admin/sections/directory/presets.ts` + `web/src/lib/site-admin/sections/shared/default-content.ts:279`; meta: `web/src/lib/site-admin/sections/directory/meta.ts`.
- **Seeding gold reference (mirror this):** `web/src/lib/site-admin/edit-mode/site-shell-backfill-action.ts` (page INSERT L232, section-pointer INSERT L258, hand-rolled publish L280+, `RESERVED_SHELL_SLUG='__site_shell__'` L54).
- Other seeding precedents: `web/src/lib/site-admin/server/onboard-starter-content.ts` (`seedFreeStarterHomepage` L291), `web/src/lib/site-admin/server/homepage.ts` (`ensureHomepageRow` L422).
- Surface allow-list (R1 root cause): `web/src/lib/saas/surface-allow-list.ts` (`AGENCY_STOREFRONT_PREFIXES` L91, `isPathAllowedForHostKind` L348).
- Proxy CMS clean-URL rewrite: `web/src/proxy.ts` L290-323.
- Slug rules: `web/src/lib/cms/paths.ts` (`SLUG_SEGMENT` regex, `isValidSlugPath`); reserved: `web/src/lib/site-admin/reserved-routes.ts`.
- Page CRUD (multi-instance): `web/src/lib/site-admin/server/pages.ts` (`upsertPage` L275, additional-page gate L316), `web/src/app/admin/site-settings/pages/new/page.tsx`, `web/src/lib/site-admin/edit-mode/composition-actions.ts` (`createAndInsertSectionAction` L960, `listAgencyVisibleSections` consumer L289).
- Route-layer gate: `web/src/lib/public-settings.ts` (`getPublicSettings`/`directoryPublic`); tenant scope: `web/src/lib/saas/scope.ts` (`getPublicTenantScope` L356, `getPublicHostContext` L295).
