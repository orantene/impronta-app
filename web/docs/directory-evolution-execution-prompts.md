# Directory Evolution — Execution Prompts (2026-05-20)

**Source plan:** `web/docs/directory-evolution-plan-2026-05-20.md`
**How to use this doc:**

1. Pick a move from the tracking table below.
2. Copy its prompt block into a **fresh chat** with another agent.
3. When the agent reports back, paste the report to me — I'll mark it ✅, record the commit hash + any honest gaps, and we move on.
4. Move order matters where **deps** are listed; otherwise pick freely.
5. The first 4 moves (B3 · B1 · B2 · B6) are the **Week 1 visible quality cliff** — those four together transform the page from "mid" to "premium" and unblock everything downstream.

---

## Status tracker

Legend: ⬜ pending · 🟦 in flight · ✅ done · ⚠️ done w/ honest gap · ❌ blocked

| ID | Title | Pillar | Effort | Impact | Deps | Status | Commit |
|---|---|---|---|---|---|:-:|---|
| **B3** | Swap reactive grid to OUR DirectoryCard | Storefront | M (~90 min) | 🔥 transformational | — | ✅ | _pending_ |
| **B1** | Adaptive pill bar (3–6 + More) | Storefront | S | 🔥 | — | ⬜ | |
| **B2** | Editorial skeleton + intentional empty state | Storefront | S | high | — | ⬜ | |
| **B6** | AI hero band → live filter in place | Storefront | M | 🔥 | B3 | ⬜ | |
| **A4** | Drawer micro-copy + grouping rename | Editor | S | high | — | ⬜ | |
| **A1** | Live preview pane in editor | Editor | M | 🔥 | — | ⬜ | |
| **C1** | Field-engine resolver → card hover-reveal | Engine | L | 🔥 | B3 | ⬜ | |
| **C7** | Trust badge data activation (matview column) | Engine | S | medium | — | ⬜ | |
| **B9** | Persistent shortlist + inquiry-from-shortlist | Storefront | M | 🔥 | — | ⬜ | |
| **D2** | Apply Lane 3's signup wire (with paid path) | SaaS | S | high | paid-creation flow exists | ⬜ | |
| **D3** | Track-C plan-gate enforcement | SaaS | M | high | D2 | ⬜ | |
| **D1** | Agency onboarding wizard | SaaS | L | 🔥 | D3 | ⬜ | |
| **D6** | Roster-quality dashboard | SaaS | M | high | — | ⬜ | |
| A2 | In-canvas overlay editing | Editor | L | 🔥 | A1 | ⬜ | |
| A3 | AI-suggested presets at insert time | Editor | M | high | — | ⬜ | |
| A5 | Visual feedback + save toast | Editor | S | medium | — | ⬜ | |
| A6 | Undo + version timeline | Editor | M | medium | — | ⬜ | |
| A7 | Shareable preview link | Editor | M | medium | A1 | ⬜ | |
| B4 | Sidebar default-5 + "More filters" disclosure | Storefront | M | high | — | ⬜ | |
| B5 | Smart filter chips above grid | Storefront | S | high | — | ⬜ | |
| B7 | Card hover-reveal richer fields | Storefront | M | high | B3 · C1 | ⬜ | |
| B8 | Tenant-aware accent layer | Storefront | M | high | — | ⬜ | |
| B10 | Shareable filtered URL → curated view + OG image | Storefront | M | medium | — | ⬜ | |
| C2 | Weighted groups → "Best at" hint on card | Engine | M | high | C1 | ⬜ | |
| C3 | Brought-in-by attribution surfacing | Engine | M | medium | C1 | ⬜ | |
| C4 | Smart card density (per resolved field richness) | Engine | M | high | C1 | ⬜ | |
| C5 | Search ranks by signal completeness | Engine | M | high | C1 | ⬜ | |
| C6 | AI hero band uses resolver (not just taxonomy) | Engine | L | high | C1 | ⬜ | |
| D4 | Pre-built vertical starter packs | SaaS | M | high | D1 | ⬜ | |
| D5 | Agency-to-agency learn loop (anonymized) | SaaS | L | medium | D6 | ⬜ | |

---

## Shared boilerplate (every prompt inherits this)

> **Project:** `/Users/oranpersonal/Desktop/impronta-app/web`
> **Branch:** `phase-1` (shared multi-agent). `git pull --rebase origin phase-1` first; abort the rebase if conflicts on OTHER agents' files and proceed from local HEAD (every other lane did this).
> **Commit:** ONE scoped local commit. **NO PUSH. No force-push. Never edit files you don't own.** Conventional message + end with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
> **Binding plans to honor:**
> - `web/docs/directory-section-execution-plan-2026-05-19.md` (canonical — A1/CDP-0, A2 trust, A3 plan-tier)
> - `web/docs/directory-evolution-plan-2026-05-20.md` (strategic context — pillars + sprint)
> **Visible-truth rule (CRITICAL — the lesson of session 1):** Curl marker grep ≠ visual reality. **Chrome MCP verification (or equivalent visual probe) REQUIRED before commit.** If preview MCP unavailable, document precisely what was unverifiable.
> **Aesthetic rule:** cool-not-warm — use **Tailwind primitives** (`bg-white`, `border-white/15`, `text-foreground`, `bg-card/30`), NOT themed tokens like `--impronta-foreground`/`--impronta-muted` which resolve to GOLD under the Impronta tenant theme.
> **Baseline:** tsc clean repo-wide as of `586d683f1`. Any new errors are yours to fix or honestly defer with a logged amendment.
> **Report back to orchestrator with:** commit hash · what shipped · gate evidence (Chrome MCP measurements) · honest gaps · any binding-spec collisions surfaced.

---

# 🟢 Week 1 — Visible Quality Cliff

## ▶ MOVE B3 — Swap reactive grid to OUR DirectoryCard

> **Pillar:** Storefront · **Effort:** M (~90 min focused) · **Impact:** 🔥 transformational · **Deps:** none

### Mission
Today the reactive grid mounts the **legacy `talent-card.tsx`** (zinc-gradient, busy, recently-cleaned-of-gold but still legacy). Our new `DirectoryCard` (already built — premium 4:5 portrait, cool-not-warm, prop-driven, RP-1 safe, §10-ready) only renders once as the SSR seed. Swap the reactive grid to render the new card. Single biggest visible leap in the entire plan.

### Read first
- `web/src/lib/site-admin/sections/directory/DirectoryCard.tsx` (the target card — already built, premium)
- `web/src/lib/site-admin/sections/directory/DirectoryReactiveResults.tsx` (Lane 1's island)
- `web/src/lib/site-admin/sections/directory/fetch.ts` (the `DirectoryCardData` shape the new card expects)
- `web/src/lib/directory/types.ts:30` (`DirectoryCardDTO` — what legacy InfiniteGrid passes)
- `web/src/components/directory/directory-infinite.tsx` (the legacy grid render — see how it currently maps to `<TalentCard>`)

### Files you own
- NEW `web/src/lib/site-admin/sections/directory/DirectoryCardAdapter.tsx` — small client component that takes `DirectoryCardDTO` + maps to `DirectoryCardData` + renders `<DirectoryCard>` with the §10 badges + saved/inquiry handlers
- `web/src/lib/site-admin/sections/directory/DirectoryReactiveResults.tsx` — render the adapter instead of letting `DirectoryInfiniteGrid` paint legacy cards

### Forbidden
- `web/src/components/directory/talent-card.tsx` (legacy — leave alone for non-section consumers)
- `web/src/components/directory/directory-infinite.tsx` (legacy — don't fork its render; instead let it pass items, and YOU render them via the adapter)
- Other agents' M files in `git status`

### Strategy
The legacy `DirectoryInfiniteGrid` renders its own cards inside its `<div className="grid grid-cols-2 …">`. **Two viable approaches**, pick whichever requires LESS surgery:

- **Path α** — InfiniteGrid accepts a `renderCard` prop. Pass `<DirectoryCardAdapter card={c} />`. Need a small modification to InfiniteGrid OR a fork.
- **Path β** — Don't use InfiniteGrid at all on the reactive path. Use React Query directly (`useInfiniteQuery`) with the same `queryKey` + fetch, render your own grid inside `DirectoryReactiveResults`, no legacy chrome. Cleaner result.

Path β is recommended — InfiniteGrid carries legacy chrome you'd want to escape anyway. Reuse the *queryFn* (`fetchDirectoryPageClient`) — it's exported & pure.

### Build steps
1. Build `DirectoryCardAdapter.tsx`: input `DirectoryCardDTO`, output `<DirectoryCard data={mapped} style="portrait" show={…} aspect="4:5" />`. Map: `card.displayName`→name, `card.profileCode`→profileCode (derive profileHref using `clientLocaleHref`), `card.thumbnail.url`→photoUrl, `card.primaryTalentTypeLabel`→primaryType, `card.locationLabel`→location, etc. Trust/agency/availability come from Lane 5's enriched DTO — pass through.
2. In `DirectoryReactiveResults`, replace `<DirectoryInfiniteGrid …>` with your own `useInfiniteQuery` + grid render that uses the adapter. Reuse `fetchDirectoryPageClient` from `directory-infinite.tsx` (extract if needed; otherwise inline the same fetch shape).
3. Preserve infinite-scroll sentinel + save state (`usePublicDiscoveryState`).
4. Empty state during loading: render 6 skeleton cards (cool-shimmer 4:5 boxes), NOT the legacy `<EmptyState>`. (This delivers part of B2 for free.)
5. Empty state on resolved-zero-items: render an editorial "Our roster is fully booked this week — refine or check back" (not the error-y "No talent matches" copy).

### Gates (MUST pass before commit)
- `npx tsc --noEmit` clean on your surface
- `npx eslint <touched files>` exit 0
- `npm run test:node-presentation` → 94/96 baseline preserved
- **Chrome MCP verification (REQUIRED):**
  - Navigate to `http://localhost:3000/impronta/directory` in Chrome via `tabs_create_mcp` + `navigate`
  - `javascript_tool`: confirm `document.querySelectorAll('[data-card-style="portrait"]').length >= 6` AND `document.querySelectorAll('.talent-card').length === 0` (NO legacy cards rendered)
  - `getComputedStyle` on a card: should be the cool DirectoryCard treatment, not the legacy `bg-gradient-to-b from-zinc-900/95 to-black`
  - Same probe on `/impronta/p/our-fashion-models` AND `/impronta/p/faces-of-fall-26`
  - Network: confirm `/api/directory` (or whatever endpoint) returns items + cards render

### Commit
- Message: `feat(directory): premium DirectoryCard on reactive grid (B3)`
- Body: path chosen (α vs β), Chrome MCP measurements (cardCount, talent-card count = 0), what's deferred.

### Report back
Commit hash, Chrome MCP measurements, before/after screenshots if available, honest gaps.

---

## ▶ MOVE B1 — Adaptive pill bar (3–6 + "More disciplines")

> **Pillar:** Storefront · **Effort:** S · **Impact:** 🔥 · **Deps:** none

### Mission
Replace the **21-pill horizontal scroll** above the grid with the top 4–6 most-populated facets for this tenant + a "More disciplines" disclosure that reveals the rest in a searchable popover/sheet. Restraint over expressiveness.

### Read first
- `web/src/components/directory/directory-talent-type-bar.tsx` (the current 21-pill renderer — your edit target)
- `web/src/lib/directory/field-driven-filters.ts:1184` (where `topBarFacet.options` is built; counts are already on each option)
- `web/src/lib/site-admin/sections/directory/DirectoryReactiveResults.tsx:222` (where the bar is mounted; props passed)

### Files you own
- `web/src/components/directory/directory-talent-type-bar.tsx` (the pill bar component)
- Optionally NEW `web/src/components/directory/directory-talent-type-overflow.tsx` (the "More" popover, searchable)

### Forbidden
- The section files (Lane 1's directory section)
- `field-driven-filters.ts` (the model is correct; only the renderer changes)
- Other agents' M files

### Build steps
1. In the pill bar, take `options.sort((a,b)=>b.count-a.count).slice(0, 5)` as visible pills + always include "ALL" first.
2. If `options.length > 5`, append a `<MorePillsDisclosure>` button: "More disciplines (N)". Click → popover/sheet with all remaining options, **searchable** by label, each with count badge.
3. Tiny count badges on visible pills (muted, after the label: `Models 12 · Hosts 8`).
4. Keep selected-state visual.
5. Mobile: the visible 5 pills already fit horizontally; the disclosure works as a sheet.

### Gates
- tsc + eslint clean
- Chrome MCP: navigate to `/impronta/directory`, confirm `document.querySelectorAll('[role="tab"]').length <= 7` (ALL + 5 + More). The visible bar must NOT scroll horizontally.
- Click "More disciplines" → confirm popover/sheet opens with the remaining facets, search input filters them.

### Commit
- Message: `feat(directory): adaptive pill bar — top-5 + More (B1)`

---

## ▶ MOVE B2 — Editorial skeleton + intentional empty state

> **Pillar:** Storefront · **Effort:** S · **Impact:** high · **Deps:** none (but coordinates with B3)

### Mission
Replace the loading-time empty paragraph ("No talent matches these filters yet — try clearing filters") with **portrait-shaped skeleton cards** during fetch. When fetch genuinely resolves to zero items, render an **editorial** empty state ("Our roster is fully booked this week — would you like us to suggest similar talent?"), not an error-y "No talent matches."

### Read first
- `web/src/components/directory/directory-infinite.tsx:439-446` (current empty-state branch — `EmptyState` from `ui/empty-state`)
- `web/src/components/ui/empty-state.tsx`
- `web/src/components/directory/directory-skeleton.tsx` (existing skeleton — extend or replace)

### Files you own
- NEW `web/src/lib/site-admin/sections/directory/DirectoryCardSkeleton.tsx` — a single portrait-shaped skeleton card with cool shimmer
- `web/src/components/directory/directory-infinite.tsx` — change the loading-state branch to render 6 skeletons; change the resolved-zero branch to use editorial copy

### Forbidden
- Other agents' M files

### Build steps
1. `DirectoryCardSkeleton.tsx`: aspect-ratio 4/5 div with `bg-card/30 animate-pulse` and a name-block placeholder. Cool-not-warm, no gold.
2. In `DirectoryInfiniteGrid`'s render, before the `if (items.length === 0)` branch, check `isLoading || (isFetching && items.length === 0)` → render 6 skeletons.
3. For the resolved-zero branch: change `title={ui.emptyResults}` to use copy like `"Our roster is fully booked — refine or check back soon"` (move to a new i18n key `public.directory.ui.empty.fullyBooked`).
4. Remove the gold-leaning EmptyState classes you can see today.

### Gates
- Chrome MCP: trigger a slow fetch (e.g. navigate `/impronta/directory?category=non-existent-tax-id` to force loading state) → confirm 6 skeleton boxes render
- After fetch resolves zero → confirm new copy, no "No talent matches these filters yet" string
- Normal load (`/impronta/directory`) → skeletons appear briefly then real cards

### Commit
- Message: `feat(directory): editorial skeletons + intentional empty state (B2)`

---

## ▶ MOVE B6 — AI hero band → live filter in place

> **Pillar:** Storefront · **Effort:** M · **Impact:** 🔥 · **Deps:** B3 (clean grid render)

### Mission
Today the AI hero band's submit interprets a query → routes to `/directory?…`, full-page navigation, filters reset. Should feel like a magic wand that **refines the page in place**. After AI interprets, the URL updates via shallow routing, the reactive island re-fetches, a chip row above the grid shows "AI applied: hosts in Riviera Maya next month — [clear AI]".

### Read first
- `web/src/components/home/hero-search.tsx` (submit + interpret flow)
- `web/src/lib/directory/directory-url-navigation.ts` (`commitDirectoryListingUrl`)
- `web/src/lib/site-admin/sections/directory/DirectoryReactiveResults.tsx` (the consumer of useSearchParams)
- `web/src/app/api/ai/interpret-search/route.ts` (the interpret endpoint — confirm what it returns)

### Files you own
- `web/src/components/home/hero-search.tsx` (change the submit-success path from `router.push` to `router.replace` on the **current** pathname)
- NEW `web/src/lib/site-admin/sections/directory/AIInterpretChip.tsx` — the "AI applied: …" chip above the grid with a clear button
- `web/src/lib/site-admin/sections/directory/DirectoryReactiveResults.tsx` (mount the chip)

### Forbidden
- The legacy directory route (`app/(public)/directory/page.tsx`) — leave its semantics intact
- Other agents' M files

### Build steps
1. In `HeroSearch` submit: when the interpret returns parsed filters, call `router.replace(pathname + '?' + params, { scroll: false })` instead of pushing to `/directory`. This keeps the visitor on `/impronta/directory` or `/p/<slug>` exactly where they were.
2. Add an `?ai=<summary>` URL param carrying the AI's interpretation summary string.
3. In `DirectoryReactiveResults`, read `ai` param via `useSearchParams()`. When present, render `<AIInterpretChip summary={ai} onClear={...} />` above the grid (or below the pill bar, above the toolbar).
4. The chip's "Clear AI" button: `router.replace(pathname + '?' + paramsWithoutAi, { scroll: false })`.

### Gates
- Chrome MCP: navigate to `/impronta/directory`, type a real query into the hero search ("hosts in Riviera Maya available next month"), submit, confirm:
  - URL changes shallowly (still `/impronta/directory?...&ai=...`)
  - The grid filters in place (visible card count changes)
  - The AI chip appears with the interpretation summary
  - Clicking "Clear AI" removes the chip + restores unfiltered view

### Commit
- Message: `feat(directory): AI hero band filters in place (B6)`

---

# 🟦 Week 2 — Operator Confidence

## ▶ MOVE A4 — Drawer micro-copy + grouping rename

> **Pillar:** Editor · **Effort:** S · **Impact:** high · **Deps:** none

### Mission
The drawer today exposes engineering vocabulary to non-engineer operators. Rename every label to product-spec. Group decisively. Inline help under tricky knobs.

### Read first
- `web/src/lib/site-admin/sections/directory/Editor.tsx` (the 7-tab drawer; ~600+ LOC)

### Files you own
- `web/src/lib/site-admin/sections/directory/Editor.tsx` (rename labels, regroup, add help text)

### Forbidden
- The server actions (Lane 6's `directory-catalogs.ts`)
- The schema (`schema.ts`) — labels here are just UI strings
- Other agents' M files

### Build steps
1. Tab labels: `Source` → "Who's in this directory" · `Template` → "Layout" · `Card` → "How talent appears" · `Filters` → "How visitors narrow" · `AI` → "AI search behavior" · `Empty/SEO` → "Edge cases" · `Presets` → "Starter kits"
2. Inside each tab, rename machine-spec field labels. Examples:
   - `topBarMode` → "Pill bar above results"
   - `topBarFacetKey` → "Which field powers the pill bar"
   - `filter_option_search_visible` → "Show filter search box"
   - `sidebarShow` → "Show filter sidebar"
   - `nameFallback` → "When name is hidden, show…"
   - `manualProfileCodes` → "Hand-pick talent (by profile code)"
   - `pinnedProfileCodes` → "Feature first (pin to top, in order)"
   - `excludedProfileCodes` → "Hide these talent"
   - `cardFieldKeys` → "Card fields (override catalog order)"
3. Add inline `<HelpText>` under non-obvious knobs (one-line "why this matters"). Use the `HELP` constant already in the file.
4. NEVER rename schema keys — only the visible label strings. Schema stays untouched.

### Gates
- tsc clean
- Chrome MCP (if the admin editor is reachable in the connected browser): open the drawer, confirm new labels render. If admin auth is required and not available, accept tsc + visual code review as the gate, document honestly.

### Commit
- Message: `feat(directory-editor): operator-friendly drawer copy + grouping (A4)`

---

## ▶ MOVE A1 — Live preview pane in editor

> **Pillar:** Editor · **Effort:** M · **Impact:** 🔥 · **Deps:** none

### Mission
Drawer collapses to a left rail (or a sliver). Right 60–70% of viewport renders an iframe of the section's preview with the operator's current (debounced) draft applied. Every drawer change appears in <200ms.

### Read first
- `web/src/lib/site-admin/sections/directory/Editor.tsx` (where the drawer is mounted in admin shell — find the admin shell wrapper)
- The admin shell drawer mount point (grep `DrawerSwitch` or `EditorPanel` in `src/components/admin/shell/`)
- Any existing preview-iframe pattern in the repo (grep `preview-iframe`, `LivePreview`, `EditPreview`)

### Files you own
- A new component, e.g. `web/src/lib/site-admin/sections/directory/DirectoryLivePreview.tsx` (iframe + debounced postMessage)
- Editor.tsx (split-pane layout)
- Possibly a new `/api/preview/section` route OR a `(preview)/section/<id>` route that renders a single section with given draft props

### Strategy
The iframe loads a preview URL that renders the section in isolation. Draft props are passed via:
- option α: URL-encoded JSON in a query param (limited size, GET-friendly)
- option β: `postMessage` from parent (drawer) to iframe; iframe applies the props

Option β is cleaner. Iframe URL is stable; parent sends `{type: 'updateProps', props: …}` on every debounced drawer change.

### Build steps
1. Build a `(preview)/section/directory-live` route or repurpose the existing `(public)/p/[[...slug]]` route. The page mounts `<DirectoryComponent>` with props received via postMessage. Wrap in `<DirectoryQueryProvider>`.
2. `DirectoryLivePreview.tsx`: an iframe pointing at the preview route. On every `props` change from Editor, debounce 150ms, postMessage `{type:'updateProps', props}` to iframe.
3. Editor.tsx: split-pane CSS — `flex` with drawer 35% / preview 65%. Collapsible to icon-rail (60px).
4. Loading skeleton inside the iframe.
5. On publish, the live storefront updates (the existing save path).

### Gates
- Chrome MCP: open the admin builder for an Impronta directory page (if auth available), confirm the preview iframe renders the section, change a drawer knob (e.g. headline), confirm preview updates within ~200ms.
- If admin auth unavailable for QA: structural tsc + isolated mount test + honest note.

### Commit
- Message: `feat(directory-editor): live preview pane (A1)`

---

# 🟪 Week 3 — Engine Depth

## ▶ MOVE C1 — Field-engine resolver → card hover-reveal

> **Pillar:** Engine · **Effort:** L (~3–4 sessions) · **Impact:** 🔥 transformational · **Deps:** B3

### Mission
Today the card shows 5 of ~50 properties the field-engine knows. Connect `field-engine/resolve-talent-fields.ts` to the card data path so:
- `workspace_profile_field_settings.enabled_override` decides which fields the card MAY surface (agency gate)
- talent's `tenant_override` / `has_value` filters what they personally suppressed
- Weighted groups → ranked "best at" attributes
- Brought-in-by attribution annotates origin
- Card hover-reveal layer shows top 2–3 curated attributes

### Read first
- `web/src/lib/field-engine/resolve-talent-fields.ts` (the resolver)
- `web/src/lib/talent-field-values-catalog.ts` (the catalog feeding the resolver)
- `web/src/lib/site-admin/server/admin-taxonomy.ts` (workspace_profile_field_settings related)
- `web/src/lib/directory/types.ts` (DirectoryCardDTO — extend additively)
- `web/src/lib/directory/talent-card-dto.ts` (mapper — extend with resolver call)
- `web/src/lib/site-admin/sections/directory/DirectoryCard.tsx` (hover-reveal slot)

### Files you own
- `web/src/lib/directory/types.ts` (extend DirectoryCardDTO additively with `richFields?: { weighted: [...], curated: [...], attribution?: {...} }`)
- `web/src/lib/directory/talent-card-dto.ts` (call resolver per page of items; batch by tenant; respect overrides)
- `web/src/lib/site-admin/sections/directory/DirectoryCard.tsx` (render hover-reveal layer)
- NEW migration if resolver needs index hints

### Forbidden
- Mutating canonical `field_definitions` rows (per Lane G3+G7 — clone-to-tenant-local only)
- Breaking existing DirectoryCardDTO consumers (additive only)

### Build steps
1. Resolver call: batch by page, fetch all 6–24 talents at once; respect `workspace_profile_field_settings.enabled_override` filtering at the resolver level.
2. Output shape on `richFields`:
   ```
   weighted: [{ groupKey: "editorial_fit", score: 0.9, label: "Editorial-leaning" }, ...]
   curated:  [{ fieldKey: "languages", label: "Languages", value: "EN, ES, IT" }, ...]
   attribution: { broughtInBy: { tenantId, displayName }, isExternal: true } | null
   ```
3. Card hover-reveal: when card receives focus or hover, transition to a layer that shows top 1 weighted label + top 2 curated rows. Soft, fast, accessible.
4. Drawer knob: `cardHoverAttributes` (existing? or add) controls max count to surface.
5. NEVER fake data. If resolver returns null for a talent, hover reveal is empty (the card stays restrained).

### Gates
- Resolver respects all three gates (enabled_override, tenant_override, has_value): write a small integration test.
- Chrome MCP: hover a card on `/impronta/directory`, confirm a hover-reveal layer appears with at least 1 attribute. Confirm a talent with sparse fields shows a minimal hover (not fake data).
- Performance: page of 24 cards still <500ms p95 warm (resolver batched correctly).

### Commit
- Message: `feat(directory): field-engine resolver → card depth (C1)`

---

## ▶ MOVE C7 — Trust badge data activation

> **Pillar:** Engine · **Effort:** S · **Impact:** medium · **Deps:** none

### Mission
Lane 5 built the TrustTierBadge UI; data was the gap (matview projection lacks `trust_tier` in usable form for ranking beyond `basic`). Add `trust_tier` to talent_discover_index in a richer projection (or activate the badge-counting ladder for verified/silver/gold) and verify the badge appears on the appropriate cards.

### Read first
- `web/src/lib/directory/types.ts` (DirectoryCardDTO trust fields)
- `supabase/migrations/20260520000921_directory_trust_tier.sql` (current matview)
- `web/src/components/directory/talent-card.tsx` (current TrustTierBadge usage)
- Lane 2's report in the marathon close doc — what's already there + the badge-count ladder

### Files you own
- NEW migration `supabase/migrations/<ts>_trust_tier_promotion.sql` if needed to upgrade `basic` talents to higher tiers based on verification events
- The DTO mapper if any trust-related field is missing in projection

### Build steps
1. Find talents who SHOULD have higher trust tiers (verified emails, ID verifications, etc. — grep `talent_verification` or `verified_at` flags).
2. Manually verify a handful of Impronta talents to higher tiers (via service-role script, idempotent) — to create visual proof of the spectrum.
3. Refresh matview; confirm distribution `{basic: X, verified: Y, silver: Z, gold: W}`.
4. Curl/Chrome confirm verified+ badges render with different visual treatment than basic.

### Gates
- DB probe: `select trust_tier, count(*) from talent_discover_index group by trust_tier` returns at least 2 tiers
- Chrome MCP: on a tenant where verified+ talents exist, confirm at least 1 card shows a non-basic trust badge

### Commit
- Message: `feat(discover): activate trust tier spectrum on Impronta seed (C7)`

---

## ▶ MOVE B9 — Persistent shortlist + inquiry-from-shortlist

> **Pillar:** Storefront · **Effort:** M · **Impact:** 🔥 · **Deps:** none

### Mission
Today a visitor saves talents; the saved set is invisible until they navigate to a saved-list page. Add a **floating shortlist FAB** (bottom-right) that shows count + opens a side-drawer with mini-cards + "Start inquiry with these" CTA pre-filling the inquiry composer.

### Read first
- `web/src/components/directory/public-discovery-state.tsx` (`usePublicDiscoveryState`, savedIds tracking)
- `web/src/components/directory/directory-inquiry-actions.tsx` (`ContactTalentButton`, inquiry composer entry)
- `web/src/lib/site-admin/sections/directory/DirectoryCardActions.tsx` (where the save toggle lives today)

### Files you own
- NEW `web/src/components/directory/ShortlistFab.tsx` (floating button + side-drawer)
- Possibly extend `public-discovery-state.tsx` if shortlist needs more API (`savedTalents` cache, not just ids)
- Wire into `app/(public)/directory/page.tsx` or the section's Component so the FAB mounts on directory pages

### Build steps
1. FAB: position fixed bottom-right, hidden when `savedIds.length === 0`, shown with count badge otherwise
2. Side-drawer (slide from right) with:
   - Header: "Your shortlist (N)"
   - List of mini-cards (photo + name + type + remove button)
   - Footer CTA: "Start an inquiry with these N talents" → opens inquiry composer with profileCodes pre-filled
3. Persist saved ids in localStorage (already done) + when authed, sync to `talent_saved` table
4. Survive navigation across directory pages (state is global)

### Gates
- Chrome MCP: navigate `/impronta/directory`, click save on 2-3 cards, confirm FAB appears with count
- Click FAB → drawer opens with mini-cards
- Navigate to `/impronta/p/our-fashion-models` → FAB still shows same count
- Click "Start inquiry" → inquiry composer opens with pre-filled talents

### Commit
- Message: `feat(directory): persistent shortlist FAB + inquiry pre-fill (B9)`

---

# 🟧 Week 4 — SaaS Flywheel

## ▶ MOVE D2 — Apply Lane 3's signup-wire (with paid path)

> **Pillar:** SaaS · **Effort:** S · **Impact:** high · **Deps:** a paid-creation or upgrade flow exists

### Mission
Lane 3 wrote the ready-to-apply diff in `directory-signup-provisioning-wire-2026-05-19.md` §5. Today it's a no-op because all signups hard-code `plan_tier='free'`. Apply the diff so new Studio/Agency tenants auto-get a seeded directory page.

### Read first
- `web/docs/directory-signup-provisioning-wire-2026-05-19.md` §5 (the precise ready diff)
- `web/src/lib/site-admin/server/onboard-starter-content.ts` (the target — confirmed clean per Lane 3's analysis)
- `web/src/lib/site-admin/server/onboard-directory-page.ts` (the `ensureDirectoryPage` function)

### Files you own
- `web/src/lib/site-admin/server/onboard-starter-content.ts` (single ~10-line edit)

### Build steps
1. Apply §5a, §5b, §5c verbatim from the spec doc
2. Confirm `plan_tier !== "free"` gate is in place
3. Wrap in non-fatal `logServerError` guard

### Gates
- tsc clean
- For each provisioning path (workspace-signup, talent-workspace-provision), confirm the call site receives the gate correctly. If no paid-creation path exists, this is dormant by design — log that honestly.

### Commit
- Message: `feat(directory): apply signup-provisioning wire (D2)`

---

## ▶ MOVE D3 — Track-C plan-gate enforcement

> **Pillar:** SaaS · **Effort:** M · **Impact:** high · **Deps:** D2

### Mission
Activate the A3 plan-tier capability gates: Free → no directory page, Studio → 1 directory page, Agency → unlimited. Picker filter + `cmsAdditionalPageDeniedReason` extension.

### Read first
- `web/src/lib/access/plan-capabilities.ts` (PLAN_CAPABILITIES — today all permissive)
- `web/src/lib/access/plan-limits.ts` (PLAN_LIMITS — add directory_page entry)
- `web/src/lib/site-admin/index.ts` + `composition-actions.ts` (listAgencyVisibleSections consumers)
- `web/src/lib/site-admin/server/pages.ts` (`cmsAdditionalPageDeniedReason`)

### Files you own
- `web/src/lib/access/plan-capabilities.ts` (add capability `directory_page`, removed from `free`)
- `web/src/lib/access/plan-limits.ts` (add `directory_page` limit: studio:1, agency:null)
- `web/src/lib/site-admin/index.ts` + composition-actions (filter Directory from picker for free tier)
- `web/src/lib/site-admin/server/pages.ts` (extend additional-page denial reason for directory)

### Build steps
1. Add `directory_page` to capability keys
2. PLAN_CAPABILITIES: remove from free, keep for studio/agency/network/legacy
3. PLAN_LIMITS: studio:1, agency:null (unlimited), free:0
4. Picker filter: `directory` section hidden when capability missing
5. CMS additional-page denial: when tenant tries to create a 2nd directory page on Studio, return a friendly "Studio plan includes 1 directory page — upgrade to Agency for unlimited" message
6. Test on a Free tenant (set plan_tier='free' on a test agency) → confirm picker hides Directory section

### Gates
- Switch a test tenant to `plan_tier='free'` → confirm `/impronta/directory` (theirs) gets the free-tier inline experience, picker hides the section
- Switch to `plan_tier='studio'` → 1 directory page allowed, 2nd attempt blocked
- Switch to `plan_tier='agency'` → unlimited

### Commit
- Message: `feat(saas): activate A3 plan-tier enforcement for directory (D3)`

---

## ▶ MOVE D1 — Agency onboarding wizard

> **Pillar:** SaaS · **Effort:** L (~2 sessions) · **Impact:** 🔥 · **Deps:** D3

### Mission
Post-signup wizard: 3 steps (what kind of talent · primary markets · plan tier confirmation) → generates the storefront with sane defaults (seeded directory page, configured field catalog visibility, matching landing copy). 30 seconds to a live storefront they're proud of.

### Read first
- `web/src/lib/saas/workspace-signup.server.ts` (current signup path)
- `web/src/lib/site-admin/server/onboard-starter-content.ts` (current starter content seeding)
- `web/src/lib/site-admin/sections/directory/presets.ts` (verticals to inform the wizard)

### Files you own
- NEW `web/src/app/(public)/onboarding/wizard/*` (the wizard UI)
- NEW server actions for each step
- Possibly extend `onboard-starter-content.ts` to take wizard-output config

### Build steps
1. Wizard step 1 — "What kind of talent?" — multi-select chips (Models, Hosts, Performers, Creators, Services, Mixed)
2. Step 2 — "Primary markets" — autocomplete from a curated list, multi-select
3. Step 3 — "Plan tier" — confirm or upgrade
4. On submit: seed the directory page with the matching vertical preset, configure field_definitions visibility based on talent type selection, seed a relevant starter homepage section, ensure the storefront is live
5. Show a "Your storefront is ready" final step with the URL

### Gates
- E2E: create a fresh tenant (or staging), run through the wizard with "Models" + "Mexico City" + "Studio" → confirm directory page exists at `/<tenant>/directory`, renders cards, has appropriate facets

### Commit
- Message: `feat(saas): agency onboarding wizard (D1)`

---

## ▶ MOVE D6 — Roster-quality dashboard

> **Pillar:** SaaS · **Effort:** M · **Impact:** high · **Deps:** none

### Mission
Per-tenant admin page showing roster completeness %, missing-fields list, predicted Discover-rank impact. "Adding `next_available_date` to 3 talents moves your average Discover-rank from 6.2 to 4.1." Quantified, actionable, with deep-links to fix.

### Read first
- `web/src/lib/field-engine/resolve-talent-fields.ts` (what counts as "complete")
- `web/src/lib/talent-field-values-catalog.ts` (field universe)
- Admin shell routing (where to mount the new admin page)

### Files you own
- NEW `web/src/app/(workspace)/[tenantSlug]/admin/roster-quality/page.tsx`
- NEW computation lib for completeness % + impact prediction

### Build steps
1. Compute per-talent: count of resolved (non-default) field values / count of enabled fields = completeness %
2. Aggregate: per-tenant overall %, per-field gap analysis
3. Predict impact: hypothetical re-rank if missing fields were populated
4. Deep-link each gap to the talent's edit form pre-positioned on the missing field

### Gates
- Auth-required admin page; structural tsc + page renders for Impronta with real data; deep-link clicks navigate correctly

### Commit
- Message: `feat(saas): roster-quality dashboard (D6)`

---

# 🔵 Beyond the top 10 (Pillar overflow)

Each below is a focused prompt — same template, condensed. Pick the ones that matter and I'll expand to full prompt on request.

## A2 — In-canvas overlay editing
> **Effort:** L · **Deps:** A1
> Mission: clicking the section's headline in the live preview triggers an inline edit (no drawer). Click a card → "show/hide this field" popover. Drawer becomes the secondary surface for advanced. Implement by mounting hidden "edit slots" on the preview side that the parent drawer hooks into.

## A3 — AI-suggested presets at insert time
> **Effort:** M
> When operator inserts a Directory section, server analyzes their roster (taxonomy distribution, completeness, location spread) and proposes a preset. "You have 65% models, 25% hosts — try Atelier + pill bar [Fashion, Runway, Hosts]." One-click apply.

## A5 — Visual feedback + save toast
> **Effort:** S
> Every drawer change shows a green pulse on the saved field + a "Saved · view live" toast. Audit trail captured in browser session.

## A6 — Undo + version timeline
> **Effort:** M
> Every drawer change writes an audit row. "Revert to 4 minutes ago" button. Critical for agency confidence on shared edits.

## A7 — Shareable preview link
> **Effort:** M · **Deps:** A1
> Operator generates a one-time, scoped, unlisted preview URL with their unsaved-yet config. Share with a client for sign-off without publishing.

## B4 — Sidebar default-5 + "More filters" disclosure
> **Effort:** M
> Sidebar shows top 5 highest-signal facets by default; "More filters (15)" disclosure for the rest. Each filter remembers last-used state via cookie. Avoid the 20-facet wall.

## B5 — Smart filter chips above grid
> **Effort:** S
> When any filter is active, render a tidy chip row above the grid: "Models × Tulum × Available in May × clear all". Visible memory of what narrows the grid.

## B7 — Card hover-reveal richer fields
> **Effort:** M · **Deps:** B3 · C1
> Card shows editorial at rest; on hover, soft top-layer reveals 2–3 high-signal attributes. Drawer knob decides which attributes hover-reveals.

## B8 — Tenant-aware accent layer
> **Effort:** M
> Section reserves a "tenant accent" CSS variable used ONLY for focus rings, active-pill underline, primary CTA. Tenant can theme it (Impronta's amber, another's teal). Bulk of section stays editorial neutral.

## B10 — Shareable filtered URL → curated view + OG image
> **Effort:** M
> Build a sophisticated filter set, copy URL, share. Receiver lands on that exact filtered state. Generate a branded OG image from the filter (e.g. "Available Models · Tulum · May 2026 · Impronta").

## C2 — Weighted groups → "Best at" hint
> **Effort:** M · **Deps:** C1
> Surface engine-known weighted groups as one restrained label under talent type: "Carmen Díaz · Fashion Model · Editorial-leaning". Drawer toggle controls display.

## C3 — Brought-in-by attribution
> **Effort:** M · **Deps:** C1
> When `brought-in-by` differs from current tenant, discreet line on profile expansion: "Represented by Impronta; you're seeing her via Agency X's curated discover view." Trust + transparency.

## C4 — Smart card density
> **Effort:** M · **Deps:** C1
> Card density adapts to resolved field richness per talent. Rich → "rich card" with 3 hover-reveals. Sparse → "minimal card" focused on portrait + name + type. No broken-looking sparse cards.

## C5 — Search ranks by signal completeness
> **Effort:** M · **Deps:** C1
> Talent with more resolved field values ranks higher in default sort. Drives engine adoption flywheel.

## C6 — AI hero band uses resolver
> **Effort:** L · **Deps:** C1
> Today AI search hits LLM with raw query → taxonomy term IDs. Future: it uses resolver's field universe (weighted groups, scalar fields) → richer match capability.

## D4 — Pre-built vertical starter packs
> **Effort:** M · **Deps:** D1
> Beyond "Fashion preset": "Modeling Agency starter pack" / "Live Production Roster" / "Event Hospitality" / "Creator Network". Each = curated pages + section presets + facet defaults. One-click apply during onboarding.

## D5 — Agency-to-agency learn loop
> **Effort:** L · **Deps:** D6
> "Top-performing directories this month: 3 agencies whose visitors converted at >18%. Their configurations: pill bar set to X, sidebar limited to Y." Aggregated, anonymized. Helps newer agencies copy what works.

---

## Reporting format (what to send back to orchestrator)

After each agent run, paste back to me:

```
MOVE: <ID>
COMMIT: <hash> or BLOCKED
SHIPPED: <bullet list>
GATES: tsc=<status> · eslint=<status> · chrome-mcp=<key measurement>
HONEST GAPS: <anything not done or not verified>
SURFACED ISSUES: <new bugs/concerns/binding-spec collisions>
```

I'll update this doc's tracking table + commit it so we have a durable record.

---

*Source: directory-evolution-plan-2026-05-20.md · Tracker: this file · Orchestrator: Claude in main chat*
