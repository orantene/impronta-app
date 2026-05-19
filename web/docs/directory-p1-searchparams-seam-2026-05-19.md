# Directory Section — `searchParams` Reactivity Seam (2026-05-19)

**Status:** Architecture research. No code. Resolves the Phase 1/2b blocker called out in
`web/docs/directory-section-execution-plan-2026-05-19.md` (§Phase 1, §2 reuse map row 1).
Subordinate to that plan + the Discover binding spec. Read those first.

---

## 0. The problem, precisely

The new portable directory section (`web/src/lib/site-admin/sections/directory/Component.tsx`)
renders premium Portrait/Editorial cards from the Discover path, plus a `HeroSearch` band.
It does **not** render a working filter sidebar, talent-type pill bar, sort control, or
pagination — and the inline comment (`Component.tsx:20-23`) explicitly defers them to
"Phase 2b (needs the section↔searchParams reactivity seam)."

Root cause is structural, not cosmetic:

- A page-builder **Section Component** is invoked by `HomepageCmsSections`
  (`web/src/components/home/homepage-cms-sections.tsx:344-355`) with exactly:
  `{ props, tenantId, locale, preview, sectionId, publicPathPrefix, builderNodeBindings }`
  (`SectionComponentProps<T>` — `web/src/lib/site-admin/sections/types.ts:75-102`).
  **No `searchParams`.** `HomepageCmsSections` itself is a server component nested under
  `<main>` — it never receives `searchParams` either, and Next 16 does not give it any.
- Next 16.2.3 contract (verified against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
  and `.../04-functions/use-search-params.md`):
  - `searchParams` is a **Promise prop available ONLY on `page.tsx`** (the route leaf).
    Must be `await`ed / `use()`d. Opts the route into dynamic rendering.
  - **Layouts and arbitrary server components do NOT receive `searchParams`** — explicitly,
    "to prevent stale values during partial rendering."
  - `useSearchParams()` is a **client-only** hook. In a dynamically-rendered route it is
    available on the server during the initial render of a client component and re-renders
    on client navigation.
- The legacy directory worked because `app/(public)/directory/page.tsx` *used to be* a
  monolith page that read `searchParams` and passed them straight into
  `DirectoryDiscoverSection({ searchParams })`
  (`web/src/components/directory/directory-discover-section.tsx:340-394`, which calls
  `parseTaxonomyParam`, `parseDirectorySort`, etc.). Phase 3 retired that: `/directory` is
  now a thin zero-regression adapter that resolves the seeded `__directory__` builder page
  through `HomepageCmsSections`, falling back to a **direct** `<DirectoryComponent>` render
  (`web/src/app/(public)/directory/page.tsx:101-127`). Either way the section no longer
  sees the URL.

So the filter UI can't be wired without first threading request-time query state into the
section. Rendering non-functional filter controls would be fake UI — forbidden by the
"never ship fake affordances" rule.

### 0.1 What the route layer still has (key leverage)

`app/(public)/directory/page.tsx` is a **`page.tsx`** — it is *entitled* to the
`searchParams` prop; it simply doesn't destructure it today. This is the cheapest seam:
the data is one prop declaration away at the route, the only question is how to thread it
down to the section.

Two route facts that de-risk everything below:

1. **`/directory` is an explicit storefront allow-list entry**
   (`web/src/lib/saas/surface-allow-list.ts:92`). The proxy CMS clean-URL rewrite
   (`web/src/proxy.ts:290-310`) only fires for single-segment paths **not** in the
   allow-list, so `/directory` always resolves to the real route file — it is never
   rewritten to `/p/{slug}`.
2. **The query string survives the proxy.** `proxy.ts` rewrites mutate only
   `nextUrl.pathname` on a `request.nextUrl.clone()` (`proxy.ts:468-511`); `.search` is
   carried through untouched. So a page-level `searchParams` prop **is** populated on
   `/directory?tax=…&sort=…`. (Note: `ORIGINAL_PATHNAME_HEADER`, `proxy.ts:433`, is
   pathname-only — **no query string** — so a `headers()`-based read of the query is NOT
   available. `searchParams` at the page is the only server-side source.)

### 0.2 What the legacy reactive engine actually is (the asset to reuse)

The legacy stack is a **URL-as-state** machine. The pattern, end to end:

- Client controls — `DirectoryTalentTypeBar`
  (`web/src/components/directory/directory-talent-type-bar.tsx`), `DirectorySort`
  (`directory-sort.tsx`), `DirectoryResultsToolbar` (`directory-results-toolbar.tsx`,
  view grid/list), `DirectoryFiltersSidebar` (`directory-filters-sidebar.tsx`, 55 KB),
  `DirectoryMobileFilters`, and `HeroSearch` with `directoryUrlSync`
  (`web/src/components/home/hero-search.tsx`) — all read URL via `useSearchParams()` and
  write it via `commitDirectoryListingUrl(router, pathname, searchParams.toString(), …)`
  (`web/src/lib/directory/directory-url-navigation.ts`), which canonicalizes params and
  calls `router.replace`/`push`.
- The server page re-renders on that navigation (route is `force-dynamic`), re-parses
  `searchParams` via the **pure, server+client-safe** helpers in
  `web/src/lib/directory/search-params.ts` (no `"use client"`; exports `parseTaxonomyParam`,
  `parseDirectorySort`, `parseDirectoryQuery`, `parseDirectoryLocation`,
  `parseDirectoryHeightRange`, `parseDirectoryAgeRange`, `parseDirectoryView`,
  `parseDirectoryAiSummary`, `parseDirectoryFieldFacets`, `serializeCanonical*`,
  `canonicalizeDirectorySearchParams`).
- `DirectoryInfiniteGrid` (`directory-infinite.tsx`) is a client component that *also*
  independently reconciles: it seeds from the SSR `initialPage`, then a TanStack
  `useInfiniteQuery` keyed on every parsed param refetches `GET /api/directory?…` and
  drives infinite scroll via an `IntersectionObserver`. So results re-fetch on the client
  even without a full server round-trip; the server render is the SSR seed + SEO.

**Crucial constraint discovered:** `clientDirectoryHref`
(`web/src/i18n/client-directory-href.ts`) **hardcodes `/directory`** as the navigation
path. Every legacy control therefore pushes `/directory?…` regardless of the page it is
mounted on. This is fine for the seeded `/directory` page but **breaks the multi-instance
portability principle** (§0.1 of the plan: an "Our Chefs" page at an arbitrary slug must
stay on its own URL). Any reuse of the legacy controls on arbitrary builder pages must
parameterize this path.

**Data-source split (decides which API a client island may call):**

| Endpoint | Auth | Returns | Source |
|---|---|---|---|
| `GET /api/directory` | **Public** (gates on `directoryPublic` + host context; `proxy.ts:340` rate-limits) | `DirectoryCardDTO` page (`fetchDirectoryPage`, cursor pagination, full facet/height/age/field-facet filtering) | legacy directory pipeline |
| `GET /api/discover/talents` | **401 if not logged in** (`web/src/app/api/discover/talents/route.ts:32-35`) | `DiscoverTalentListItem` (offset pagination; filters: `country`, `category`, `hub`, `q` only) | `talent_discover_index` matview |

The section's Phase-1 card is fed by **Discover** (`fetch.ts` → `loadDiscoverTalents`,
CDP-0 Amendment A1 — same source as `/t/<slug>`, carries agency/availability). But
`/api/discover/talents` is **login-gated** and the public directory must serve anonymous
visitors, and its filter surface is far narrower than the directory sidebar's
(no taxonomy term ids, height, age, field facets). This asymmetry is the single biggest
design force in the options below.

---

## 1. Options

Four options. Each: mechanism · files · how `searchParams` is threaded · trade-offs ·
blast radius · risk to the zero-regression adapter · reuse vs rebuild.

### Option A — Thread `searchParams` from the route through `HomepageCmsSections` into `SectionComponentProps`

**Mechanism.** Add an optional `searchParams` field to `SectionComponentProps<T>`. Have
`app/(public)/directory/page.tsx` (and, if we want it everywhere, `p/[[...slug]]/page.tsx`)
destructure the page-level `searchParams` promise, `await` it, and pass it into
`<HomepageCmsSections searchParams={…}>`. `HomepageCmsSections` forwards it verbatim into
every `<Component … searchParams={…}>`. The directory `Component.tsx` (server) then parses
it with the existing pure `search-params.ts` helpers and renders the **legacy
`DirectoryDiscoverSection`** (which already takes `{ searchParams, initialSavedIds }`) —
i.e. revert to wrapping the proven engine, now fed by props instead of a route.

**Files to change.**
- `web/src/lib/site-admin/sections/types.ts` — add
  `searchParams?: Record<string, string | string[] | undefined>` to
  `SectionComponentProps`.
- `web/src/components/home/homepage-cms-sections.tsx` — accept an optional
  `searchParams` prop on `HomepageCmsSectionsProps`; pass it into the `<Component>` JSX
  (`:344-355`). Default `undefined` so all other call sites and tests are untouched.
- `web/src/app/(public)/directory/page.tsx` — add
  `searchParams: Promise<…>` to the page signature; `await` it; pass into the
  `<HomepageCmsSections>` branch **and** the direct `<DirectoryComponent>` fallback.
- `web/src/app/(public)/p/[[...slug]]/page.tsx` — (optional, only if we want
  reactive directory instances on arbitrary builder pages) same treatment.
- `web/src/lib/site-admin/sections/directory/Component.tsx` — consume
  `searchParams`; either (A1) render `DirectoryDiscoverSection` from
  `web/src/components/directory/directory-discover-section.tsx`, or (A2) keep the new
  Atelier shell + new `DirectoryCard` and pass parsed filters into `fetch.ts`.
- `web/src/lib/site-admin/sections/directory/fetch.ts` — (A2 path) extend
  `loadDirectorySectionTalents` to accept parsed filters.

**How `searchParams` is threaded.** Route `page.tsx` (the only Next 16 entity that gets it)
→ explicit prop on `HomepageCmsSections` → explicit prop on every section `Component`. The
section becomes URL-aware without violating the Next constraint (the page is still the sole
reader; everything below is plain prop drilling — exactly the pattern Next's own docs
recommend, `use-search-params.md:75`, "read the `searchParams` prop … and pass it down").

**Trade-offs.**
- (+) Smallest *conceptual* change; matches the framework's prescribed pattern.
- (+) Sub-option **A1 reuses the entire legacy reactive engine unchanged** — sidebar,
  pill bar, sort, infinite scroll, AI strip, mobile filters — the single biggest reuse win.
  `DirectoryDiscoverSection` already has the exact `{ searchParams }` signature.
- (−) A1 renders `DirectoryCardDTO` via `talent-card.tsx`, which **fails the §10 Discover
  gate** (no trust tier, agency/independent, availability) — the explicit reason Amendment
  A1 (CDP-0) chose the Discover path for the canonical card. A1 = reverting that decision.
  A2 keeps the premium card but then you must extend `fetch.ts`/Discover to filter, and
  `/api/discover/talents`'s filter surface is too thin for the sidebar.
- (−) `SectionComponentProps` is a **platform-wide type** consumed by every section +
  test harnesses + the registry. Widening it is low-risk (optional field) but it is a
  shared-surface edit on a multi-agent branch — coordinate.
- (−) Server-only reactivity: every filter click is a full server round-trip + re-render
  unless `DirectoryInfiniteGrid` (client) is also in the tree to reconcile. A1 brings that
  for free; A2 does not.
- (−) The `searchParams` prop opts **every page that passes it** into dynamic rendering.
  `/directory` is already `force-dynamic`; `p/[[...slug]]` is already `force-dynamic`
  (`page.tsx:15`). No new perf cliff there, but threading it through the *generic*
  `HomepageCmsSections` means **every** section on **every** builder page would receive it
  — harmless (sections ignore unknown props) but it muddies the contract: most sections are
  not URL-reactive and shouldn't appear to be.

**Blast radius.** Medium-wide *surface* (shared type + generic renderer + 2 route files),
but shallow *behavior* (additive optional field; existing callers unaffected). Touches
files in no other agent's hot-set per the plan's §1 relationship note.

**Risk to the zero-regression adapter.** Low–moderate. The adapter's six route-bolted
behaviors (gate, metadata, analytics, discovery bridge, guest-merge, inquiry-url-sync) are
untouched — they wrap whichever body resolves. Risk is concentrated in the
`HomepageCmsSections` signature change (it is the storefront's universal renderer; a
regression there is site-wide). Mitigated by the field being optional + defaulted.

**Reuse vs rebuild.** A1 = **maximum reuse** (whole legacy engine) but abandons the
premium Discover card + §10 compliance. A2 = keeps premium card, **rebuilds** filter wiring
on the thin Discover API. A1's reuse is its strength and its disqualifier.

---

### Option B — Client results island reading `useSearchParams()`, fetching the existing API

**Mechanism.** The directory `Component.tsx` stays a server component for the shell
(heading, AI band, SEO/structured data, empty state) but delegates the **reactive
subtree** (pill bar + sidebar + sort + result count + grid + pagination) to a `"use client"`
island. That island reads the URL with `useSearchParams()` directly (no prop threading
needed — the hook works because `/directory` is dynamically rendered), parses it with the
pure `search-params.ts` helpers, fetches results client-side, and writes the URL back via
`commitDirectoryListingUrl`. The section passes its **config** (`props`: scope, pageSize,
which facets, card style, etc.) into the island as plain props; the island reconciles
config + URL filters.

**Files to change.**
- `web/src/lib/site-admin/sections/directory/Component.tsx` — render the new
  client island instead of the static grid; pass `props` + server-fetched `initialItems`
  (SSR seed for first paint / SEO) + `publicPathPrefix`.
- **New** `web/src/lib/site-admin/sections/directory/DirectoryResultsIsland.tsx`
  (`"use client"`) — owns `useSearchParams()`/`useRouter()`, the filter controls, the
  TanStack infinite query, the `IntersectionObserver`. Reuse legacy client components by
  composition where possible (see reuse note).
- `web/src/lib/directory/directory-url-navigation.ts` **or**
  `web/src/i18n/client-directory-href.ts` — parameterize the hardcoded `/directory`
  path so the island navigates relative to its **own** page (portability fix). Lowest-risk
  form: add an optional `basePath` arg threaded from `usePathname()`; legacy callers keep
  the `/directory` default.
- No `SectionComponentProps` / `HomepageCmsSections` change. No route change.

**How `searchParams` is threaded.** It isn't threaded — the client island reads it from
the live URL via `useSearchParams()`. This sidesteps the "sections don't get searchParams"
constraint entirely: the constraint is on **server** components/layouts; a client component
anywhere in the tree can read the URL on a dynamic route.

**Trade-offs.**
- (+) **Zero platform-surface change.** No shared-type edit, no generic-renderer edit, no
  route edit. Smallest blast radius. Best for the multi-agent branch.
- (+) Naturally portable/multi-instance: an island reading `useSearchParams()` +
  `usePathname()` works identically on `/directory` and an arbitrary "Our Chefs" builder
  page — *if* the hardcoded-path fix lands.
- (+) Snappy: filter changes are client fetches (TanStack), not full server round-trips —
  same UX the legacy `DirectoryInfiniteGrid` already delivers.
- (+) Keeps the premium Discover card + §10 posture: the island can render the new
  `DirectoryCard`/`DirectoryCardActions` over whatever data source is chosen.
- (−) **Data-source problem is now load-bearing and unsolved.** The premium card is fed by
  `loadDiscoverTalents` (Discover). `/api/discover/talents` is **login-gated (401)** and
  exposes only `country/category/hub/q` filters — it cannot back an anonymous public
  directory with a taxonomy/height/age/field-facet sidebar. Options:
  (b-i) point the island at the **public** `GET /api/directory` and accept
  `DirectoryCardDTO` (re-introduces the §10 gap the card was built to fix — but the card
  is prop-driven, so it can show whatever the DTO has and gracefully omit trust/agency);
  (b-ii) add a **new public, anonymous-safe Discover listing endpoint** that mirrors the
  directory filter surface over the matview (real new infra — migration-adjacent, perf
  re-validation; out of canonical-first scope, see Amendment A2's analogous reasoning);
  (b-iii) restrict Phase-1 reactive filters to what Discover supports
  (talent-type/category + text query only) and defer height/age/field-facet filtering.
  None is free; this is the crux.
- (−) Two sources of truth for "results" if both the SSR seed (server) and the island
  (client) fetch — must reconcile exactly like `DirectoryInfiniteGrid` already does
  (`initialDataUpdatedAt: 0` trick, `directory-infinite.tsx:371`). Reusing that component
  inherits the solution; a fresh island re-derives it.
- (−) SEO/no-JS: the reactive grid is client-rendered. The SSR seed must render *real*
  first-page cards (not a skeleton) so crawlers and no-JS visitors get content. Legacy
  already does this via `getPublicDirectoryFirstPage` SSR + client reconcile.

**Blast radius.** Smallest of all options *as a platform change* (section-local + one
shared nav helper made path-aware). The island itself is net-new code, but contained.

**Risk to the zero-regression adapter.** Lowest. Nothing in the adapter, the generic
renderer, or shared types changes. The only cross-cutting edit is making
`clientDirectoryHref`/`commitDirectoryListingUrl` path-aware — that helper is used by
~6 legacy components; a default-preserving optional arg keeps `/directory` behavior
byte-identical (regression-test the legacy `/directory` page after).

**Reuse vs rebuild.** High reuse if the island **composes the legacy client components**
(`DirectoryTalentTypeBar`, `DirectoryFiltersSidebar`, `DirectoryResultsToolbar`,
`DirectoryInfiniteGrid`) rather than re-implementing them — they are already
`useSearchParams`-driven and only need the path-aware nav fix + the data-source decision.
If it instead points at `/api/directory` (b-i) it can reuse `DirectoryInfiniteGrid`
**verbatim** (it already fetches `/api/directory`). Rebuild risk is concentrated in the
card layer only (premium `DirectoryCard` vs legacy `talent-card.tsx`).

---

### Option C — Hybrid: server shell + server-rendered filter chrome from `searchParams` prop + reused legacy client results island

**Mechanism.** Combine A's prop-threading (so the **server** can SSR the correct
filter/sidebar state and first page of results for SEO + no-JS + correct initial paint)
with B's client island for interactivity. Concretely: thread `searchParams` to the
section (Option A's type + renderer + route edits), and have `Component.tsx` mirror what
`DirectoryDiscoverSection` already does — server-parse params, server-fetch the first page
+ sidebar model, render the legacy `DirectoryTalentTypeBar` / `DirectoryFiltersSidebar` /
`DirectoryResultsToolbar` (all client, but SSR'd with correct selected state) wrapping
`DirectoryInfiniteGrid` (client, seeded by the SSR page, reconciles via `/api/directory`).
This is, in effect, **"render `DirectoryDiscoverSection` but inside the premium Atelier
shell, with the premium card."**

**Files to change.** Union of A's (type + `HomepageCmsSections` + both routes) **and**
B's path-aware nav fix. `Component.tsx` becomes a thin premium-shell wrapper around a
parametrized variant of `directory-discover-section.tsx` (or a copy specialized to the
section: same data calls — `getPublicDirectoryFirstPage`, `getCachedDirectoryFilterSidebarModel`,
`getCachedTaxonomyFilterOptions` — but emitting the premium `DirectoryCard` and Atelier
layout instead of the legacy gold-token markup).

**Trade-offs.**
- (+) Best UX + SEO: correct server-rendered initial state *and* snappy client refetch.
  Exactly the proven legacy behavior, re-skinned premium.
- (+) Maximum reuse of the **filter + data** machinery (sidebar model builder, taxonomy
  options, first-page cache, infinite grid) while still satisfying §10 if the card layer
  is the premium Discover-fed `DirectoryCard`.
- (−) Largest blast radius: every file A touches **plus** B's nav fix **plus** a
  card-adapter layer mapping `DirectoryCardDTO` (what the legacy first-page/infinite
  pipeline returns) onto the premium `DirectoryCard` — or a parallel first-page loader
  that returns the Discover shape with full directory filtering (which doesn't exist;
  that's the Amendment-A2-class infra lift).
- (−) Highest coordination cost on the shared branch; most moving parts to QA across
  5 roles × 4 viewports.
- (−) Reintroduces the `DirectoryCardDTO` vs `DiscoverTalentListItem` tension at the data
  layer: the legacy filter pipeline is built around the DTO; the premium card wants the
  Discover projection. You either adapter-map (lossy: DTO has no trust/agency/availability —
  the §10 fields) or fork the pipeline.

**Blast radius.** Widest.

**Risk to the zero-regression adapter.** Moderate-to-high — it has all of A's
shared-surface risk plus the most new behavior. Adapter wrapper behaviors stay intact, but
the surface area for a site-wide regression (shared type + generic renderer) is the same as
A, with more code riding on it.

**Reuse vs rebuild.** Highest *infrastructure* reuse, but forces a rebuild/fork at the
exact seam (card data shape) the plan's Amendment A1 already adjudicated. Risks
re-litigating CDP-0.

---

### Option D — Defer reactivity to Phase 2b as currently scoped; ship Phase 1 honest-static (no-op baseline)

**Mechanism.** Do nothing to the seam now. Keep Phase 1 as the comment already states:
premium cards + real AI `HeroSearch` (which *does* navigate via `directoryUrlSync`), with
**no** non-functional filter UI rendered (no fake sidebar/pills/sort). Schedule the seam
as the explicit first task of Phase 2b.

**Trade-offs.**
- (+) Zero risk, zero blast radius, zero regression surface. Phase 1 stays shippable and
  honest (no fake affordances — compliant with the no-fake-UI rule).
- (+) Buys time to resolve the genuinely hard, non-cosmetic question (the Discover-vs-
  directory data-source split + the anonymous-public endpoint gap) deliberately rather
  than under launch pressure.
- (−) Phase 1's directory has **no filtering/sort/pagination** — a materially incomplete
  directory. The §10 gate ("agency vs independent … **and a filter facet**") cannot pass,
  so Phase 1 cannot be declared done against the binding Discover spec regardless.
- (−) Pure deferral; not a solution. Listed for completeness and as the honest status quo.

---

## 2. Cross-cutting findings that constrain any option

1. **The data-source split is the real problem; the prop-threading is the easy part.**
   Threading `searchParams` to the section (Option A) is mechanically small and
   framework-blessed. The hard, unavoidable question every option must answer:
   *what backs a reactive, anonymous-public, fully-filterable directory grid?*
   - `/api/directory` (public, full filters) → `DirectoryCardDTO` → **fails §10**
     (no trust/agency/availability) but works anonymously with the whole sidebar.
   - `/api/discover/talents` (Discover, §10-capable shape) → **login-gated + thin filters**
     → cannot back the public sidebar as-is.
   - The plan's Amendment A1 picked Discover *for card data*; nobody has reconciled that
     with *filtered, paginated, anonymous* listing. A new public Discover-listing endpoint
     with the directory's filter surface over the `talent_discover_index` matview is the
     clean fix but is **Amendment-A2-class infra** (migration-adjacent, perf re-validation,
     out of canonical-first scope under launch pressure).
2. **`clientDirectoryHref` hardcodes `/directory`** (`client-directory-href.ts`, last
   function). Any reuse of legacy controls on a portable multi-instance section is a lie
   until this is path-aware (it would push visitors off "Our Chefs" back to `/directory`).
   This is a prerequisite for the plan's §0.1 portability principle, independent of which
   option is chosen.
3. **`search-params.ts` parsers are pure and server+client safe** — reuse them in both the
   server shell and any client island. No duplication of parse logic is necessary or
   acceptable.
4. **`DirectoryInfiniteGrid` already solves SSR-seed↔client-refetch reconciliation**
   (`directory-infinite.tsx:355-371`) and infinite scroll. Reusing it (Option B-i / C)
   inherits that; a fresh island re-derives a solved problem.
5. **`DirectoryCard`/`DirectoryCardActions` are already prop-driven** with a
   `SilentBoundary` for missing providers (`DirectoryCardActions.tsx:24-36`) — they slot
   into either a server or client parent and satisfy the §10 T2 "card preview" reuse gate.
   The premium card layer is **not** the blocker; the data feeding it is.
6. **`SectionComponentProps` is platform-shared.** Widening it (Option A/C) is additive +
   low-risk but is a coordinated edit on `phase-1`. Option B avoids it entirely.

---

## 3. RECOMMENDATION

**Adopt Option B (client results island reading `useSearchParams()`), reusing the legacy
client components by composition, with the data source resolved as B-i for Phase 1 and
B-ii scheduled.** Concretely:

- **Phase 1/2b (now):** Build `DirectoryResultsIsland.tsx` as a `"use client"` subtree of
  the section. **Compose the existing legacy client components** — `DirectoryTalentTypeBar`,
  `DirectoryFiltersSidebar`, `DirectoryResultsToolbar`/`DirectorySort`,
  `DirectoryMobileFilters`, and **`DirectoryInfiniteGrid` verbatim** (it already fetches
  the **public** `/api/directory` and already does SSR-seed reconciliation + infinite
  scroll). Feed the grid the premium look by selecting card rendering at the grid's card
  layer where the plan wants the premium card; where the §10 fields are absent on
  `DirectoryCardDTO`, the prop-driven `DirectoryCard` degrades gracefully (no fake badges —
  consistent with Amendment A2's "no fake badge ships in the interim"). This is **B-i**:
  honest, anonymous-public, fully-filterable *now*, with the premium shell + AI band the
  section already renders, and **zero platform-surface / zero adapter risk**.
- **Make the nav helper path-aware** (`commitDirectoryListingUrl` /
  `clientDirectoryHref`): optional `basePath` from `usePathname()`, default `/directory`.
  This unblocks the plan's portability principle and is required regardless of option.
- **Schedule B-ii as the deferred infra item** (mirrors Amendment A2's pattern): a public,
  anonymous-safe Discover listing endpoint over `talent_discover_index` exposing the
  directory's filter surface, so the premium card's §10 fields (trust tier — also pending
  per A2 — agency/independent, availability) can be served *with* full filtering. Gate this
  behind the same trigger as A2 ("before public launch sign-off, or when any trust-gated
  card feature is implemented"). When it lands, the island swaps its fetch endpoint; the
  filter components and URL machinery do not change.

**Why B over A/C:** the §10 gate, the Discover-card decision (Amendment A1), and the
anonymous-public requirement are in tension no matter what. A1 maximizes engine reuse but
re-opens CDP-0 and fails §10 on the DTO. C has the widest blast radius and forces a
data-shape fork. B isolates the unavoidable hard problem (data source) behind a single
swappable fetch call, costs **zero** platform-surface or adapter-zero-regression risk
(the dominant risk on a shared multi-agent branch), reuses the legacy reactive components
*and* the grid's solved reconciliation, and is the only option whose portability story is
native rather than bolted. It also degrades honestly: full filtering works on day one via
the public endpoint; premium §10 badges light up when the deferred matview work lands —
no fake UI at any point.

**Why not D:** D is the honest status quo but ships a directory with no filtering/sort/
pagination and definitionally cannot pass §10. Acceptable only as the explicit fallback if
B's nav-helper change is judged too risky to land this cycle — in which case Phase 1 stays
as-is and the seam is the first Phase 2b task (still Option B).

---

## 4. Ordered implementation task list (Option B, exact paths)

> Research only — this is the build plan, not code. Pre-edit ritual on `phase-1`:
> `git pull --rebase origin phase-1`; gate with `cd web && npx tsc --noEmit && npm run lint`
> before every commit (ignore the ~25 pre-existing baseline TS errors from the concurrent
> `talent_type_grid` work — confirm any new errors are yours). QA on localhost:3000 with
> `Host: impronta.lvh.me`; deploy/promote is a separate user-authorized step.

1. **Make directory navigation path-aware (portability prerequisite).**
   - `web/src/lib/directory/directory-url-navigation.ts` — add an optional
     `basePath` parameter to `commitDirectoryListingUrl` (default keeps current
     `/directory` behavior via `clientDirectoryHref`).
   - `web/src/i18n/client-directory-href.ts` — add a variant of
     `clientDirectoryHref` that takes an explicit base path instead of the hardcoded
     `/directory`; keep the existing export untouched for the ~6 legacy callers.
   - **Regression-gate:** the legacy `/directory` page must behave byte-identically
     (filters/sort/infinite scroll) — QA before moving on.

2. **Create the client island.**
   - **New** `web/src/lib/site-admin/sections/directory/DirectoryResultsIsland.tsx`
     (`"use client"`). Owns `useSearchParams()` + `usePathname()` + `useRouter()`.
     Parses URL via `web/src/lib/directory/search-params.ts` (pure helpers — import,
     do not reimplement). Composes:
     `DirectoryTalentTypeBar`, `DirectoryFiltersSidebar`, `DirectoryMobileFilters`,
     `DirectoryResultsToolbar` (→ `DirectorySort`), and `DirectoryInfiniteGrid`
     (`web/src/components/directory/*`). Pass the section `props`
     (scope/pageSize/which-facets/card style) + the SSR-seeded first page + the
     path-aware `basePath` (from `usePathname()`) so all controls navigate relative to
     the section's own page.
   - Wrap the island in a `<Suspense>` boundary (Next 16 requirement for
     `useSearchParams()` in any route that could be statically rendered;
     `use-search-params.md:82-86`).

3. **Wire the section server shell to the island + SSR seed.**
   - `web/src/lib/site-admin/sections/directory/Component.tsx` — keep the server
     shell (heading, AI `HeroSearch` band, structured data, empty state). Replace the
     current static grid (`Component.tsx:156-211`) with `<DirectoryResultsIsland>`.
     Server-fetch the first page (SSR seed for SEO/no-JS/initial paint) using the
     **public** directory path (`getPublicDirectoryFirstPage` +
     `getCachedDirectoryFilterSidebarModel` + `getCachedTaxonomyFilterOptions`, the same
     calls `directory-discover-section.tsx:132-176` makes) — parse the *current*
     `searchParams` for that seed. **Note:** the section still does not receive
     `searchParams`; for the SSR seed the server can read filters via the request only at
     the page. Therefore the seed is computed in the **island's parent route is the page**
     — but since the section isn't the page, the SSR seed must be fetched **unfiltered
     (page 1, section scope only)** and the island immediately reconciles to the
     URL-filtered set on mount via `DirectoryInfiniteGrid`'s existing
     `initialDataUpdatedAt: 0` mechanism. (If a *filtered* SSR seed is required for SEO on
     deep-linked filtered URLs, that requires Option A's prop threading — record as a
     known Phase-2b limitation; the legacy `/directory` retains filtered SSR via its own
     adapter until then.)

4. **Card layer.**
   - `web/src/lib/site-admin/sections/directory/DirectoryCard.tsx` /
     `DirectoryCardActions.tsx` — confirm prop-driven rendering over whatever the grid
     supplies. Where `DirectoryCardDTO` lacks §10 fields (trust tier, agency/independent,
     availability), **omit** them (graceful) — do **not** synthesize fake badges
     (Amendment A2 rule). Keep the cool-not-warm tokens; strip any residual gold.

5. **QA (localhost:3000, `Host: impronta.lvh.me`).**
   - Seeded `/directory` page: pill bar, sidebar facets, sort, result count, infinite
     scroll, AI interpret, save, add-to-inquiry — all functional and **navigating within
     `/directory`** (not bouncing).
   - A second directory instance on an arbitrary builder slug (e.g. "Our Chefs",
     `scope=by_talent_type`): same controls functional and **staying on that slug's URL**
     (proves the path-aware nav fix + portability).
   - Anonymous (logged-out) visitor: grid + filters work (confirms the public
     `/api/directory` path — not the 401 Discover endpoint).
   - 4 viewports (mobile/tablet/desktop/wide); screenshot proof to user.

6. **Schedule the deferred infra item (do NOT build now).**
   - File the B-ii task: a public, anonymous-safe Discover listing endpoint over
     `talent_discover_index` exposing the directory filter surface, so the premium card's
     §10 trust/agency/availability fields can be served *with* full filtering. Same
     revisit trigger as Amendment A2 (pre-launch sign-off, or first trust-gated card
     feature). When it lands: swap the island's fetch endpoint only — filter components,
     URL machinery, and the path-aware nav fix are unchanged. Light up §10 TN-3/AV-1/AV-2
     on the card (trust tier TN-1/TN-2 remain blocked on the matview `trust_tier` column
     per A2).

---

*Author: directory-section architecture research pass, 2026-05-19. No code changed.
Subordinate to `directory-section-execution-plan-2026-05-19.md` and the Discover binding
spec; honors Amendments A1 (CDP-0 Discover card) and A2 (deferred trust tier / no fake
badge).*
