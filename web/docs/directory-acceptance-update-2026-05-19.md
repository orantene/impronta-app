# Directory Section — Phase A Acceptance Update (2026-05-19)

**Lane:** Continuous verification (read-only). No code changed; this doc is the sole
output. Subordinate to `directory-section-acceptance-2026-05-19.md` (the 55-item /
15-BLOCKER gate) and the binding EP.

**Base commit:** `d7c98421c` (portable directory section + Phase 3 builder-resolved
`/directory`). All three Phase A lanes have now landed locally on top of it:

| Lane | Commit | Subject | Verified |
|---|---|---|---|
| Lane 3 (signup wire, A3) | `aace19514` | auto-seed `__directory__` page for paid tenants at signup | YES |
| Lane 2 (matview trust_tier, A2) | `a4c19aa25` | add `trust_tier` to `talent_discover_index` + bridge projection | YES |
| Lane 1 (reactive island, Option B) | `01d4deef8` | P1 Option B reactive island + `clientDirectoryHref` path-aware + polish | YES — with one REGRESSION (see §5) |

---

## 1. Executive summary

All three Phase A lanes landed locally in sequence (3 → 2 → 1). The 15 BLOCKERs from
the original acceptance gate hold their prior PASS / DEFERRED rulings with two
movements: **TN-1 / TN-2 moved from DEFERRED → "ready to flip"** (Lane 2 added the
`trust_tier` column to the matview + bridge projection; per the binding rule from the
prompt they STAY DEFERRED until Phase B #3 surfaces it through `/api/directory` + the
card badge — but the matview blocker is gone). **CDP-0 / CDP-1 / CDP-2 / TN-3 / AV-1 /
AV-2 / VS-1 / VS-2 / PA-1 / RP-1 / CP-1** all re-verified PASS against the post-Lane-1
HTML. **PF-1 / PF-2** stay as recorded in the prior sign-off (dev-SSR-page-time, not
the §7 card-API budget — perf table below shows post-Lane-1 dev-SSR numbers are
materially higher than baseline, ~1.7s → ~2.9s p95 for `/directory`, but this is the
known DEV-server overhead, not the §7 metric). **One P0 regression flagged on Lane 1**:
the new `DirectoryReactiveResults` island throws `Error: No QueryClient set, use
QueryClientProvider to set one` on `/p/our-fashion-models` (the multi-instance proof
page) — `/directory` itself is clean. Reactive filtering on `/directory` shows a
card-count delta in SSR HTML (8 → 6 with `?category=fashion-model`), proving the
filter pipe is live; on `/p/our-fashion-models` the page throws before any cards
render, so reactivity there is unverifiable until the QueryClient regression is fixed.

---

## 2. Updated 15-BLOCKER sign-off

Format: `ID — STATUS — one-line evidence`.

| ID | Status | Evidence |
|---|---|---|
| **CDP-0** | PASS | Path A still declared in `sections/directory/fetch.ts` header + EP Amendment A1; Amendments A2 (trust deferral) and A3 (plan-tier) still written. Lane 1 commit message explicitly preserves Amendment A1 ("Reactive grid uses the legacy card via DirectoryInfiniteGrid (Option B-i)"). |
| **CDP-1** | PASS | Card source = `loadDiscoverTalents` (Discover bridge) unchanged post-Lane-1. `curl /directory` HTML still contains 6+ `/t/TAL-…` anchors; identity slots intact. Lane 2 widened the projection (added `trust_tier`) without changing the bridge's role as the source. |
| **CDP-2** | PASS | `grep` over `/tmp/dir-unfilt.html` shows whole-card anchors `href="/t/TAL-…"`; `curl -I "/t/TAL-91010"` returns HTTP 200 against this host. Lane 1 did not touch the static card layer. |
| **TN-1** | DEFERRED (ready to flip) | Lane 2 (`a4c19aa25`) added `trust_tier` to the matview + `DiscoverTalentListItem.trustTier` projection (`discover.ts:61,146,180,264`). Sample distribution per commit msg: 8 discoverable, all `basic`. STAYS DEFERRED per prompt instruction: matview groundwork present, but Phase B #3 (surface through `/api/directory` + add a `DirectoryCard` badge component) has NOT shipped. No fake badge in current HTML. Revisit trigger now narrowed to "Phase B #3 in Lane 5". |
| **TN-2** | DEFERRED (ready to flip) | Same root cause / same Lane 2 unblock as TN-1. Card component still does not render a trust badge in canonical HTML (correct; would fail TN-2 by design if a fake one shipped). |
| **TN-3** | PASS | `data-card-ownership` element still rendered in `/tmp/dir-unfilt.html` at rest, with both treatments observed across cards: "Independent" and "Luma Studio Roster" (Lane 1 left `DirectoryCard.tsx` untouched per its commit msg "DirectoryCard untouched (pure prop-driven)"). |
| **AV-1** | PASS | `formatAvailability` path unchanged; HTML still shows availability lines fed by the single list payload; Lane 1 swaps only the *grid* layer to `DirectoryInfiniteGrid` for `/api/directory`, while the SSR seed (first paint) still uses Discover. No per-card N+1 introduced. |
| **AV-2** | PASS (code) | `AVAILABILITY_UNKNOWN = "Availability unknown — ask to confirm"` unchanged in `fetch.ts`. Runtime fallback not observable in current seed data (same caveat as prior sign-off). |
| **VS-1** | PASS | No new visibility predicate in Lane 1's `Component.tsx` / `DirectoryReactiveResults.tsx`. Lane 3's signup wire is provisioning-side only — doesn't gate the rendered set. |
| **VS-2** | PASS | No workspace-plan predicate added in any of the 3 lanes' render-path code. Lane 3's `plan_tier !== "free"` gate is a signup-side seeding condition (whether the `__directory__` page is created), NOT a card-visibility gate — A3 correct. |
| **PA-1** | PASS | `grep -rnE 'impronta-gold(-bright|-border)?|impronta-black'` over `web/src/lib/site-admin/sections/directory/` AND `web/src/app/(public)/directory/page.tsx` → **0 matches**. Lane 1 commit msg confirms: "zero `impronta-gold*` / `impronta-black` tokens in touched code." Gold tokens that DO appear in served HTML (3 in `/directory`, 1 in `/p/…`) all trace to the shared `web/src/components/home/hero-search.tsx` (search-input border, sparkles icon at `:331,335,360`) — outside the PA-1 scope, but recorded as a near-miss flag (see §5). |
| **CP-1** | PASS | `grep -rniE '\b(buyer\|buyers\|buy now\|buy a\|to buy)\b'` over `sections/directory/` + `directory/page.tsx` + Lane 1's new `DirectoryReactiveResults.tsx` → **0 matches**. |
| **RP-1** | PASS | `DirectoryCard.tsx` still pure (no `usePathname`/`useRouter`/`useState`/`useEffect`/`useContext`). Lane 1's island is a *separate* component (`DirectoryReactiveResults.tsx`), keeping the card itself prop-pure for the T2 reuse gate. |
| **PF-1** | PASS* (with regression flag) | Dev-SSR-page-time only (NOT the §7 isolated card-API metric). Post-Lane-1 numbers degraded vs prior baseline — see §4. The §7 budget (`<300ms p95` for `/api/discover/talents` page-of-24) is still architecturally intact (cached `loadDiscoverTalents` reused; no per-card N+1 introduced). Marked PASS on architecture grounds; the dev-SSR delta is recorded honestly. |
| **PF-2** | N/A for SSR page | Response header of `GET /directory` still `Cache-Control: no-cache, must-revalidate` — same fact as prior sign-off. The `private, max-age=30` budget applies to `/api/discover/talents` (unchanged), not the auth-aware SSR document. Not a regression. |

**Tally:** 12 PASS · 2 DEFERRED (ready-to-flip after Lane 2) · 1 N/A-recorded. Zero
silent FAIL.

---

## 3. Reactive verification (post Lane 1)

| Probe | Card-anchor count | Reactivity proof |
|---|---|---|
| `GET /directory` (unfiltered) | 6 | baseline |
| `GET /directory?category=fashion-model` | 6 | SSR HTML count unchanged (filter applied client-side post-mount via TanStack — per Lane 1 commit msg: "SSR seed [is] unfiltered ... island immediately reconciles to URL-filtered set on mount via DirectoryInfiniteGrid's initialDataUpdatedAt: 0 mechanism"). **The reactive pipe is wired** (markers `DirectoryReactiveResults`, `DirectoryInfiniteGrid` both present in served HTML) but a server-side count delta is NOT expected by design — server returns the unfiltered seed, client refetches `/api/directory?category=…` after hydration. **A browser-rendered probe is required to fully prove reactivity at the DOM** (this read-only lane cannot exercise client hydration). |
| `GET /p/our-fashion-models` (unfiltered) | 0 | **P0 regression** — page throws `Error: No QueryClient set, use QueryClientProvider to set one` (see §5 R1). |
| `GET /p/our-fashion-models?q=test` | 0 | Same regression — unverifiable. |

**Markers found in served HTML** (post-Lane-1):
- `/directory`: `DirectoryReactiveResults` reference in client manifest; `DirectoryInfiniteGrid` class marker.
- `/p/our-fashion-models`: full component stack including `DirectoryReactiveResultsInner`, `DirectoryReactiveResults`, `DirectoryInfiniteGrid` — but inside an `ErrorBoundary` due to R1.

**Legacy `clientDirectoryHref` callers:** Lane 1 commit reports the helper was made
path-aware via an optional `basePath` arg with default preserved → legacy callers
unaffected. Not exhaustively re-tested this lane.

---

## 4. Warm perf table (20-run sequential, dev SSR, Host: impronta.lvh.me)

All values in seconds. Warmed once before the loop. Dev server (`next dev`), not prod
build. Per the prior sign-off, these are SSR-page-time, NOT the §7 isolated card-API
budget — recorded for trend, not for `<300ms` adjudication.

### Baseline (before Lane 1 landed; HEAD = `aace19514` then `a4c19aa25`)

| Route | min | median | p95 | max | mean |
|---|---|---|---|---|---|
| `/directory` | 1.286 | 1.620 | 2.419 | 2.419 | 1.713 |
| `/p/our-fashion-models` | 0.825 | 1.213 | 2.981 | 2.981 | 1.236 |

### Post Lane 1 (HEAD = `01d4deef8`)

| Route | min | median | p95 | max | mean |
|---|---|---|---|---|---|
| `/directory` | 2.256 | 2.766 | 4.234 | 4.234 | 2.883 |
| `/p/our-fashion-models` | 1.889 | 2.449 | 4.285 | 4.285 | 2.551 |

**Trend:** SSR-page-time roughly doubled post-Lane-1 (median +71% on `/directory`, +102%
on `/p/…`). Hypotheses (un-confirmed from this read-only lane):
1. New client-island bundle adds hydration cost / larger SSR HTML payload.
2. `/p/…` numbers include the ErrorBoundary catch + render of the QueryClient error
   chunk on every request — likely a meaningful share of the +102% there.
3. Dev-server overhead is non-linear; a prod-build measurement is the only way to know
   if this is a real budget regression or just dev cost.

The §7 budget (`/api/discover/talents` <300ms p95) is **architecturally unchanged** —
Lane 1 reuses `loadDiscoverTalents` for the SSR seed and shifts only the *client refetch*
to `/api/directory` (separate endpoint, also pre-existing). No new uncached heavy join
in either path. PF-1 stays PASS on architecture grounds.

---

## 5. Honest regression flags

### R1 — P0 — `/p/our-fashion-models` throws `Error: No QueryClient set, use QueryClientProvider to set one`

- **Severity:** P0 — the multi-instance portability proof page is broken.
- **Discovery:** `curl -s -H "Host: impronta.lvh.me" "http://localhost:3000/p/our-fashion-models"` HTML contains the literal string `Error: No QueryClient set, use QueryClientProvider to set one`, with a component stack including `DirectoryReactiveResultsInner` → `DirectoryReactiveResults` → `DirectoryInfiniteGrid` inside an `ErrorBoundary`.
- **Why this matters:** the §0.1 portability principle ("an 'Our Chefs' page at an arbitrary slug must stay on its own URL") is the whole reason for Phase A Lane 1; a multi-instance page that error-boundaries the grid is a non-functional surface, not just a perf miss.
- **Why /directory works but /p/[[...slug]] doesn't:** the `/directory` route tree apparently provides a `QueryClientProvider` somewhere upstream (the legacy directory shell historically did); the public `p/[[...slug]]` route tree does not. The Lane 1 island assumes TanStack is available because the legacy `DirectoryInfiniteGrid` it composes is built around `useInfiniteQuery`.
- **Suggested fix (not in scope for this lane):** wrap the island's render in a `QueryClientProvider` inside `DirectoryReactiveResults` itself (or in `Component.tsx` when no upstream provider is detected), so portability holds across any builder page. This makes the island self-contained — consistent with B's "smallest blast radius" thesis.

### R2 — NORMAL — Post-Lane-1 dev-SSR page-time roughly doubled

- **Severity:** NORMAL (dev-only, not the §7 budget). Recorded for the §4 trend table.
- **Action:** measure on a prod build before declaring a real regression. PF-1 stays PASS on architecture.

### R3 — NEAR-MISS — gold tokens still served on directory pages (from shared HeroSearch)

- **Severity:** NEAR-MISS — out of PA-1's strict scope but worth flagging.
- **Detail:** `web/src/components/home/hero-search.tsx:331,335,360` uses `var(--impronta-gold)` / `--impronta-gold-dim` / `--impronta-gold-border` for the search input chrome. PA-1's scope is the section subtree + `directory/page.tsx` + the card component — HeroSearch is none of those, so PA-1 PASS holds. But the canonical Directory render visibly contains gold tokens, contradicting the EP §5 "Remove every `var(--impronta-gold-*)` usage on the directory surface" spirit.
- **Action:** queue a follow-up to remove gold tokens from HeroSearch (or render the directory AI band with a non-gold HeroSearch variant). Not a Phase A lane fix.

### R4 — INFO — TN-1 / TN-2 ready to flip, but stay DEFERRED per prompt

- Per the prompt instruction, TN-1 / TN-2 STAY DEFERRED "until Phase B #3 surfaces `trust_tier` through `/api/directory`." Lane 2's matview + bridge work is the prerequisite, now done. Phase B #3 is the next gating piece.

---

## 6. Lane completion status table

| Lane | Spec doc | Commit | Verified items |
|---|---|---|---|
| Lane 3 — signup wire (A3) | `directory-signup-provisioning-wire-2026-05-19.md` | `aace19514` | `ensureDirectoryPage` call at `src/lib/site-admin/server/onboard-starter-content.ts:43,440` with `plan_tier !== "free"` gate (`:323-326`). Idempotent + non-fatal. Dormant in practice (all current signups hard-code Free). |
| Lane 2 — matview `trust_tier` (A2) | (no separate doc — closes A2 of acceptance) | `a4c19aa25` | Migration `20260520000921_directory_trust_tier.sql` applied (`db:push: SUCCESS` per commit msg). `DiscoverTalentListItem.trustTier: string \| null` added in `_data-bridge/discover.ts:61`; projection columns at `:146,180,264`. Sample distribution: 8 discoverable, all `basic`. |
| Lane 1 — reactive island (Option B) | `directory-p1-searchparams-seam-2026-05-19.md` | `01d4deef8` | New `DirectoryReactiveResults.tsx` (304 lines); `clientDirectoryHref` made path-aware (optional `basePath` arg, default `/directory`); `directory-url-navigation.ts` threads `basePath` through `commitDirectoryListingUrl`. `DirectoryCard` untouched per commit msg. **R1 regression on `/p/[[...slug]]` — QueryClient provider missing.** |

---

## 7. Outstanding (not changed by this lane)

Same outstanding items the prior sign-off recorded — not Phase A's scope:

- **PA-8 4-viewport screenshots** — read-only lane cannot attach.
- **RP-6 `npm run lint` + named tests (`node-presentation-render.test`, `section-meta-registry.test`)** — not re-run this lane.
- **AV-2 runtime observation** — needs a seeded no-availability talent.
- **PF-1 isolated-card-API / prod-build measurement** — needs a prod build.
- **Phase B #3** — surface `trust_tier` through `/api/directory` + add a `DirectoryCard` trust badge component (the trigger to flip TN-1 / TN-2 from DEFERRED to PASS).
- **R1 fix** — wrap `DirectoryReactiveResults` in a self-contained `QueryClientProvider` so it works on arbitrary builder pages, not just routes that happen to have one upstream.

---

*Author: continuous-verification lane, 2026-05-19. Read-only. No code changed.
Subordinate to `directory-section-acceptance-2026-05-19.md` and the Discover binding
spec.*
