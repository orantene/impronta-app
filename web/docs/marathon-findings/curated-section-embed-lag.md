# Curated section_embed lag — findings

**Audit date:** 2026-06-05
**Code base:** `impronta-builder-marathon` (origin/main)

---

## Why heroes stay laggy — the causal chain

The page builder splits into two render paths at `homepage-cms-sections.tsx`:

1. **Freeform tree** (a `builderTree` with no slot rows): when `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS=1` the tree paints client-side via `ClientBuilderCanvas` + `useSyncExternalStore`. A tree mutation calls `setBuilderTree` → `publishBuilderCanvasTree()` → canvas repaint. No server round-trip.

2. **Curated slot sections** (the Impronta homepage today): each `section_embed` node is a server-rendered island. The `ClientBuilderCanvas` returns whatever pre-rendered node was handed to it on page load (`sectionEmbedIslands[node.id]`). The canvas **cannot regenerate an island** — it has no access to the registry `Component`, its async DB fetches, or the server-only `SectionEmbedRenderContext`.

When an operator edits a curated section's props (headline, background, card count, etc.) through the inspector, the edit path is:

1. Inspector autosave fires → `patchCmsSectionProps` → `saveSectionDraftAction`.
2. `edit-context.tsx` `~3601`: `void queueRouterRefresh()` is called unconditionally for section prop edits (this is NOT guarded by `isBuilderClientCanvasEnabled()`).
3. `queueRouterRefresh` → RAF-coalesced `router.refresh()` → Next.js re-fetches ALL RSC segments on the page.
4. `AgencyHomeStorefront` re-runs: 9 parallel `await Promise.all(...)` calls (identity, branding, edit-flag, preview-flag, shell-flag, saved IDs, favourite IDs, actor session, public branding).
5. Each `HomepageCmsSections` entry that contains an async section re-executes its `Component.tsx` (e.g. `FeaturedTalentComponent → fetchFeaturedTalentForSection`, `LocationDiscoveryComponent → getHomepageData`, `HeroSearchComponent → fetchTenantTalentCount`).
6. The entire page HTML streams back. React reconciles. The operator sees the result after a full server RTT + DB queries.

Observed: ~300–900 ms per style tweak on a section. The W3 client canvas made freeform tree edits instant but **did not change anything for curated sections**. That is the lag root cause.

There is no per-section Suspense boundary, no section-scoped `revalidateTag`, and no RSC fragment endpoint. `router.refresh()` is a full-page RSC refetch.

---

## Section-by-section classification

The registry contains 46 section types. The Impronta homepage (`improntamodels.com`) as of this audit uses a mix. Below is the classification for **all 46 registered types** and every section that can appear on a homepage composition.

### Classification legend

- **Freeform-convertible** — no async data fetch; pure render from CMS props. Can be replaced with freeform nodes (or rendered optimistically client-side with stale-while-invalidate) for instant paint.
- **Must stay server island** — uses `async` in `Component.tsx`, fetches tenant-scoped live data (Supabase, auth session, request headers).
- **Conditional** — async only on certain config options; pure when those options are off.

| Section key | Component async? | Data source | Classification | Notes |
|---|---|---|---|---|
| `hero` | No | None — pure render | **Freeform-convertible** | 100% CMS props: slides, CTAs, media URLs |
| `editorial_split_hero` | No | None | **Freeform-convertible** | |
| `hero_split` | No | None | **Freeform-convertible** | |
| `trust_strip` | No | None | **Freeform-convertible** | |
| `cta_banner` | No | None | **Freeform-convertible** | |
| `process_steps` | No | None | **Freeform-convertible** | |
| `image_copy_alternating` | No | None | **Freeform-convertible** | |
| `values_trio` | No | None | **Freeform-convertible** | |
| `press_strip` | No | None | **Freeform-convertible** | |
| `gallery_strip` | No | None | **Freeform-convertible** | |
| `testimonials_trio` | No | None | **Freeform-convertible** | |
| `marquee` | No | None | **Freeform-convertible** | |
| `stats` | No | None | **Freeform-convertible** | |
| `faq_accordion` | No | None | **Freeform-convertible** | |
| `split_screen` | No | None | **Freeform-convertible** | |
| `timeline` | No | None | **Freeform-convertible** | |
| `pricing_grid` | No | None | **Freeform-convertible** | |
| `team_grid` | No | None | **Freeform-convertible** | |
| `contact_form` | No (captcha key is passed as prop from parent) | Config prop `captcha` passed from `HomepageCmsSections` | **Freeform-convertible** (captcha key resolved once at page level, not in Component) | `captchaConfig` is a prop from the parent; the component itself is sync |
| `anchor_nav` | No | None | **Freeform-convertible** | |
| `before_after` | No | None | **Freeform-convertible** | |
| `content_tabs` | No | None | **Freeform-convertible** | |
| `code_embed` | No | None | **Freeform-convertible** | |
| `blog_index` | No | None | **Freeform-convertible** | |
| `comparison_table` | No | None | **Freeform-convertible** | |
| `lottie` | No | None | **Freeform-convertible** | |
| `sticky_scroll` | No | None | **Freeform-convertible** | |
| `masonry` | No | None | **Freeform-convertible** | |
| `scroll_carousel` | No | None | **Freeform-convertible** | |
| `blog_detail` | No | None | **Freeform-convertible** | |
| `magazine_layout` | No | None | **Freeform-convertible** | |
| `logo_cloud` | No | None | **Freeform-convertible** | |
| `image_orbit` | No | None | **Freeform-convertible** | |
| `video_reel` | No | None | **Freeform-convertible** | |
| `map_overlay` | No | None | **Freeform-convertible** (passes `mapsApiKey` as prop from parent) | Key resolved at page level |
| `donation_form` | No | None | **Freeform-convertible** | |
| `code_snippet` | No | None | **Freeform-convertible** | |
| `event_listing` | No | None | **Freeform-convertible** | |
| `lookbook` | No | None | **Freeform-convertible** | |
| `booking_widget` | No | None | **Freeform-convertible** | |
| `blank_section` | No | None (freeform container) | **Freeform-convertible** — this IS freeform | |
| `hero_search` | **Yes** | `fetchTenantTalentCount(tenantId)` — Supabase roster count | **Must stay server island** when `statSource === "tenant_talent_count"`; **convertible** when `statSource === "manual"` | `hero_search/Component.tsx` line 97. Conditional: only fetches when operator sets `statSource=tenant_talent_count`. If manual, no await. |
| `location_discovery` | **Yes** | `getHomepageData({tenantId})` OR `fetchTenantRosterCities(...)` — Supabase roster + location data | **Must stay server island** when `source === "roster_cities"` or `mapStyle === "talent_orbit"` | `location_discovery/Component.tsx` lines 226, 287. Orbit map also needs Google Maps session key. |
| `featured_talent` | **Yes** | `fetchFeaturedTalentForSection(tenantId, props, locale)` — Supabase talent profile rows | **Must stay server island** always | `featured_talent/Component.tsx` line 317. Always fetches. |
| `directory` | **Yes** | `getPublicTenantScope()` + `getPublicDirectoryFirstPage()` + `getPublicDirectorySidebar()` — Supabase full directory query | **Must stay server island** always | `directory/Component.tsx` line 121. |
| `talent_type_grid` | **Yes** | `fetchTenantTalentCategories({tenantId, ...})` — Supabase talent taxonomy | **Must stay server island** when `source === "roster_derived"`; convertible when `source === "manual"` | `talent_type_grid/Component.tsx` line 355. |
| `join_register` | **Yes** | `loadRegistrationSettings(tenantId)` — tenant config table | **Must stay server island** always | `join_register/Component.tsx` line 28. |
| `site_header` | **Yes** | `getCachedActorSession()`, `headers()`, saved/favourite IDs, brand logo, locale settings | **Must stay server island** always — reads auth session | `site_header/Component.tsx` lines 64, 67. |
| `site_footer` | **Yes** | Similar shell resolution | **Must stay server island** | |

**Summary:** 37 of 46 sections are sync (freeform-convertible). 9 are async server components that must stay as islands for data integrity.

### The Impronta homepage specifically

Impronta's published homepage (as of audit) uses the curated slot path. The hero slot almost certainly uses `hero` or `editorial_split_hero` or `hero_search`. Of those:

- `hero` / `editorial_split_hero` / `hero_split`: pure render → currently triggers full `router.refresh()` for ANY prop edit even though there is zero async work needed.
- `hero_search` with manual stat chips: same — pure render on the typical config.
- `featured_talent`: truly async (DB fetch every time).

**This is the core waste: 37 sections pay the full `router.refresh()` tax despite having no async data dependency.**

---

## Optimistic scoped-refresh design (for sections that must stay server)

For the 9 truly async sections, a full SSR re-render is unavoidable on the first render, but editing the section's CMS _props_ (headline, card count, layout) does not need to refetch DB data. The DB data is the talent list / location list / registration settings — those don't change because the operator typed a new headline.

### Approach: two-tier section island refresh

**Tier 1 — Optimistic DOM patch for pure-prop edits (no DB data change)**

A section edit only changes CMS `props` (headline, background, layout). The DB-derived data (talent cards, city list, registration settings) is unchanged. The strategy:

1. When the inspector fires `patchCmsSectionProps`, also fire a **client-side optimistic re-render** of the section's presentational skeleton using the new props against the same stale data already on the page.
2. The true server island is still re-fetched (for correctness), but the operator sees the result instantly in the DOM via the optimistic layer.
3. The server island update arrives asynchronously and reconciles (no flicker because it matches the optimistic render).

**Implementation sketch:**

- Each async section Component has a `*Skeleton` or `*Optimistic` variant that accepts `(props, cachedDataSnapshot)` and renders synchronously.
- The inspector, when editing a `section_embed`, invokes the skeleton client-side against the `dataSources` snapshot already in memory (the same snapshot `ClientBuilderCanvas` holds — `BuilderNodeRenderDataSources`).
- The `sectionEmbedIslands` map for that node id is updated to the optimistic JSX immediately; the canvas re-renders the island slot from the updated map (no network RTT).
- In the background, `queueRouterRefresh()` fetches the true server island and reconciles.

**Files affected:**
- `web/src/components/edit-chrome/client-builder-canvas.tsx` — expose a `setOptimisticIsland(nodeId, node)` callback.
- `web/src/components/edit-chrome/edit-context.tsx` — `patchCmsSectionProps` path calls the optimistic setter before `queueRouterRefresh()`.
- `web/src/lib/site-admin/sections/featured_talent/Component.tsx` + others — extract a `FeaturedTalentSkeleton` that renders the card grid from stale data.

**Tier 2 — Scoped RSC fragment refresh**

Rather than `router.refresh()` which re-runs `AgencyHomeStorefront` (9 parallel awaits) + all 15+ `HomepageCmsSections` instances, introduce a per-section RSC endpoint:

```
GET /api/cms/section-fragment?tenantId=…&sectionId=…&locale=…
```

This endpoint runs only the single section's async Component with its current props + DB fetch. The response is streamed HTML. The client canvas swaps the island HTML on arrival (targeted DOM patch, not whole-page refresh).

**This alone would cut section-edit latency from ~900ms (full page) to ~150–300ms (single section).**

**Files:**
- `web/src/app/api/cms/section-fragment/route.ts` — new RSC endpoint.
- `edit-context.tsx` `queueRouterRefresh()` call sites for section prop edits → replaced by `patchSectionFragment(sectionId, newProps)`.
- `ClientBuilderCanvas` or a new `SectionIslandManager` — subscribes to fragment responses and swaps island HTML.

### Why this is not trivial (honest)

1. `router.refresh()` currently updates **both** the section HTML AND the editor's `HomepageSnapshot` state (via `refreshComposition`). The fragment endpoint would need to return the updated snapshot row too, or the editor's local state would drift from the server.
2. The `sectionEmbedIslands` prop is rendered server-side and passed to `ClientBuilderCanvas` as React children — it is a frozen snapshot from page load. Dynamically swapping islands requires either (a) making the islands map a ref/state in `ClientBuilderCanvas` and exposing a setter, or (b) using a portal / `document.getElementById` DOM swap. Both are surgical but non-trivial.
3. React's reconciler will not "adopt" raw HTML from a fetch — you need either RSC streaming (`createFromFetch`) or an imperative DOM swap (`innerHTML`). The latter breaks React's virtual DOM. The former requires RSC plumbing.

### Recommended implementation order

1. **Quick win (2–4 days):** For the 37 pure-render sections: intercept `queueRouterRefresh()` in the section-prop edit path and skip it when the edited section has no async Component (add a `hasAsyncData` flag to `SectionRegistryEntry.meta`). These sections already re-render via `ClientBuilderCanvas` from the tree snapshot. **No server round-trip needed at all for style/copy edits on `hero`, `cta_banner`, `trust_strip`, etc.**

2. **Medium (1–2 weeks):** Optimistic skeleton for `featured_talent` — the most-edited async section on Impronta. Stale talent cards show instantly; re-fetch only runs for card count/filter changes.

3. **Longer (2–4 weeks):** RSC fragment endpoint for full scoped refresh on the 9 async sections, replacing `router.refresh()` in the section-prop edit path.

---

## The `meta.hasAsyncData` flag approach (quick win, detailed)

Add a boolean to `SectionMeta`:

```ts
// web/src/lib/site-admin/sections/types.ts
export interface SectionMeta {
  // ...existing fields...
  /** True when the section Component does async DB work at render time.
   *  False = pure render from CMS props; no server refresh needed for prop edits.
   */
  hasLiveData?: boolean;
}
```

Set it to `true` on: `hero_search` (conditional), `location_discovery`, `featured_talent`, `directory`, `talent_type_grid` (conditional), `join_register`, `site_header`, `site_footer`.

Leave it unset/false on all 37 others.

In `edit-context.tsx`, the `saveSectionDraftAction` success path at ~line 3601 currently calls `void queueRouterRefresh()` unconditionally. Add:

```ts
const sectionEntry = getSectionType(editedSectionTypeKey);
if (!sectionEntry?.meta.hasLiveData) {
  // Pure-render section — the server HTML won't change; skip the refresh.
  // The client canvas already reflects the prop change via the composition
  // snapshot update.
} else {
  void queueRouterRefresh();
}
```

**Expected outcome:** hero, cta_banner, trust_strip, editorial_split_hero, and 32 other sections stop triggering a full page re-render on every prop edit. The builder feels instant for those sections. The 9 data-bound sections still refresh (correct). **Effort: S (1–2 days). Zero regression risk on the flag-off SSR path.**

---

## Remaining open question: curated slots vs freeform migration

The deeper answer to "heroes stay laggy" is that Impronta's homepage is still 100% curated slots (`section_embed` islands in the slot table), not freeform `BuilderNode` tree entries. The W3 client canvas only accelerates the **freeform** path. If the homepage migrated to pure freeform nodes (hero → `container` + `text` + `image` + `button` nodes), edits would be instant without any of the above complexity. The `blank_section` eject path (`sectionEjected` flag in `homepage-cms-sections.tsx` line 480) is the migration on-ramp. That is a larger product and content migration decision, not a code fix.
