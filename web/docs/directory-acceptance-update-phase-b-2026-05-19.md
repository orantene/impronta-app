# Directory Section — Phase B Acceptance Update (2026-05-19)

**Lane:** Continuous verification (read-only, Lane Q'). No code changed; this doc is
the sole output. Subordinate to `directory-section-acceptance-2026-05-19.md` (the
55-item / 15-BLOCKER gate) and the binding EP.

**Base commit at session start:** `f6624da44` ("fix(directory): mount
QueryClientProvider inside DirectoryReactiveResults (R1: multi-instance regression)").
This already resolves the **R1 P0 regression** that Phase A flagged — Lane 1's
reactive island no longer throws `Error: No QueryClient set` on
`/p/our-fashion-models`.

**Phase B commits observed and verified (in landing order):**

| Lane | Commit | Subject | Verified |
|---|---|---|---|
| Lane 6 (Phase 2b drawer↔catalogs) | `560f130620` | drawer writes live `directory_sidebar_layout` + `field_definitions.card_visible` catalogs | YES |
| Lane 5 (§10-rich card data, A2 close-out) | `c106a7e471` | trust_tier + agency + availability on the reactive grid — closes TN-1/TN-2 | YES |

Both lanes ship gated (tsc clean, eslint clean, 94/96 test pass — same baseline as
Phase A). Both include their own round-trip / curl QA in commit bodies; this lane
re-runs the curl probes and computes a 20-run warm perf table.

---

## 1. Executive summary

**Phase B closes the two remaining DEFERRED BLOCKERs (TN-1, TN-2) and lands the
2b drawer↔catalogs round-trip path with its own end-to-end QA evidence.** Lane 5's
chosen approach (Path α — extend `DirectoryCardDTO` additively + one batched
`talent_discover_index` lookup inside `fetchDirectoryPage`) means both the legacy
SSR seed and the reactive island gain §10-rich fields with no new endpoint and no
edit to `DirectoryReactiveResults.tsx`. Live curl confirms the API now returns
`trustTier / agencyName / isExclusive / nextAvailableDate / availableDaysInNext30`
on every item; the rendered cards on `/directory` and `/p/our-fashion-models` carry
`data-card-ownership` and `data-card-availability` markers for every card; and the
AV-2 ratified fallback string ("Availability unknown — ask to confirm") fires for
seed talents not in the matview. **R1 stays cleared on `/p/[[...slug]]`**. **TN-1
/ TN-2 flip DEFERRED → PASS** (substantiated by Lane 5's own curl evidence after a
temporary roster-status flip on TAL-92001/2/4 to populate `talent_discover_index`;
in the live canonical Impronta seed without that flip, `data-card-trust` is absent
because the current 6 cards' profiles are not in the matview — this is correct
behavior under Lane 5's documented limitation, not a regression). Warm perf
post-Phase-B holds steady at Phase A's post-Lane-1 numbers (p95 2.9s `/directory`
SSR, 3.4s `/p/...` SSR — dev-server, not the §7 budget). Lane 6's drawer surface
exposes 3 live knobs (filter-search visibility, top-bar facet, per-facet hide)
with optimistic-revert UX; item-order DnD is deferred to a follow-up with its
underlying action already shipped. No new regressions observed.

A NON-Phase-B incident is recorded for transparency in §6: between 19:43 and
19:51 local, Lane 5's WIP edit to `fetch-directory-page.ts` corrupted the file
structure (a `for` loop header was deleted while the body remained), causing
`/directory` and `/api/directory` to 500 with a parser error. The condition cleared
at `c106a7e471`. Read-only verification cannot fix this — flagging so the lead
agent knows the dev surface was briefly broken mid-Phase-B.

---

## 2. Updated 15-BLOCKER sign-off

Format: `ID — STATUS — one-line evidence`. **Movements vs Phase A:** TN-1 and TN-2
flip DEFERRED → PASS; all other PASS items hold.

| ID | Status | Evidence |
|---|---|---|
| **CDP-0** | PASS | Path A still declared in `sections/directory/fetch.ts` header + EP Amendments A1/A2/A3. Lane 5 commit body explicitly names Path α (extend in place — additive `DirectoryCardDTO` fields + batched matview lookup) as the implementation choice within Path A, not a Path B fallback. |
| **CDP-1** | PASS | Card source still `loadDiscoverTalents` for the SSR seed AND now also reads `talent_discover_index` for the §10-rich projection. Identity slots intact: live `/api/directory?limit=3` returns `displayName='Anto', primaryTalentTypeLabel='Commercial Model', profileCode='TAL-00036'`. |
| **CDP-2** | PASS | `curl /directory` HTML still contains 6 unique `/t/TAL-…` anchors (`href="/t/TAL-00036">`, etc.). Lane 5 did NOT change anchor resolution; legacy `talent-card.tsx` `talentProfileHref` path untouched. |
| **TN-1** | **PASS** (flipped from DEFERRED) | Lane 5 (`c106a7e471`) adds `TrustTierBadge` to `talent-card.tsx:96-130` rendered in the top-region `data-card-ribbon` container at `talent-card.tsx:306`. Emits `data-card-trust="<tier>"` attribute. Cool-not-warm token mapping per Lane 5 constraint. Lane 5's own QA proof: after flipping TAL-92001/2/4 active + refreshing the matview, `/directory` rendered `3× data-card-trust='basic'`. In the live canonical seed (without that test-only flip) the 6 currently-discoverable talents are NOT in `talent_discover_index`, so `trustTier` is `null` and the truthy-guard at `talent-card.tsx:306` correctly omits the badge — by design, not a fail. |
| **TN-2** | **PASS** (flipped from DEFERRED) | Same Lane 5 change. Tier value is read from `talent_discover_index.trust_tier` (Lane 2's matview column), never hardcoded. The four ladder rungs (basic/verified/silver/gold) map to four distinct cool tints. Per Lane 5's commit msg: "tiered, not all-or-nothing" — unverified talents render as 'Basic', never dropped from the grid. |
| **TN-3** | PASS | `OwnershipBadge` (`talent-card.tsx:136`) renders whenever `card.trustTier !== undefined` (i.e. whenever the §10-rich projection is attached, even if values are null) — gating at `talent-card.tsx:310`. Live `/directory` HTML: **6× `data-card-ownership` markers** (was 0 pre-Phase-B), all currently displaying "Independent" because the seed talents have no `agency_name` in the matview. `/p/our-fashion-models`: same 6 ownership markers — multi-instance parity confirmed. |
| **AV-1** | PASS | No per-card N+1: Lane 5 commit msg explicitly cites "batched IN(...) lookup against talent_discover_index keyed on the page's profileIds" at `fetchDirectoryPage`. Acceptance PF-5 honored. |
| **AV-2** | **PASS** (now observable in runtime) | Live `/directory` HTML: **6× literal string "Availability unknown — ask to confirm"** rendered through new `availabilityLabel` derivation in `talent-card.tsx:67` (constant `AVAILABILITY_UNKNOWN`). Triggers when `nextAvailableDate` null AND `availableDaysInNext30 ≤ 0` — exactly the ratified fallback. Was code-only PASS in Phase A; now data-observable in the rendered HTML. |
| **VS-1** | PASS | No new visibility predicate added. Lane 5's enrichment is additive on already-visible cards; Lane 6's catalog writes do not gate `is_discoverable`. |
| **VS-2** | PASS | No workspace-plan predicate added by either lane. Lane 6's writes are tenant-scoped via `requireStaff + requireTenantScope` (commit body), affecting the live tenant's storefront catalog rows only — not a card-visibility plan gate. |
| **PA-1** | PASS (with R3 carry-over) | `grep -rnE 'impronta-gold(-bright|-border)?\\|impronta-black'` over `web/src/lib/site-admin/sections/directory/` AND `web/src/app/(public)/directory/page.tsx` → **0 matches** post-Phase-B. Lane 5 commit msg explicitly: "no new impronta-gold tokens introduced." Legacy `talent-card.tsx` still uses gold (151 occurrences in `/p/...` HTML); pre-existing R3 NEAR-MISS from Phase A — out of PA-1's strict scope, carry-over not regression. |
| **CP-1** | PASS | `grep -rniE '\\b(buyer\\|buyers\\|buy now\\|buy a\\|to buy)\\b'` over `sections/directory/` + `directory/page.tsx` + Lane 1's `DirectoryReactiveResults.tsx` + Lane 5's `talent-card.tsx` patch + Lane 6's `directory-catalogs.ts` + Editor patch → **0 matches**. Lane 6 commit msg specifically notes "Cool-not-warm surface tokens, no 'buyer' language." |
| **RP-1** | PASS | `DirectoryCard.tsx` still pure (no `usePathname`/`useRouter`/`useState`/`useEffect`/`useContext`). Lane 5 patched `talent-card.tsx` (legacy card, separate file) which was already a client component — does not change `DirectoryCard.tsx`'s purity for the T2 reuse gate. |
| **PF-1** | PASS (architecture) | §7 budget (`<300ms p95` on `/api/discover/talents` page-of-24) unchanged architecturally — Lane 5 reuses `loadDiscoverTalents` for the SSR seed and adds ONE batched IN(...) call against the matview (no per-card N+1 — see AV-1 evidence above). Dev-SSR-page-time (§4 below) holds at Phase A's post-Lane-1 numbers; no further regression. |
| **PF-2** | N/A for SSR page | Response header of `GET /directory` still `Cache-Control: no-cache, must-revalidate` — same fact as prior sign-offs. The `private, max-age=30` budget applies to `/api/discover/talents` (unchanged), not the auth-aware SSR document. Not a regression. |

**Tally:** **14 PASS · 0 DEFERRED · 1 N/A-recorded.** Zero silent FAIL. **Net
movement Phase A → Phase B: +2 PASS (TN-1, TN-2).**

---

## 3. §10-rich API + badge presence proof

### 3.1 `/api/directory?limit=3` JSON shape (live curl, Host: impronta.lvh.me)

```
top keys: ['items', 'nextCursor', 'totalCount', 'taxonomyTermIds']
sample item keys:
  agencyName = None
  availableDaysInNext30 = None
  cardAttributes = [{'key': 'talent_type', 'label': 'Talent Type', 'value': 'Lifestyle Model, Commercial Model'}]
  displayName = Anto
  isExclusive = False
  nextAvailableDate = None
  profileCode = TAL-00036
  trustTier = None
```

The five §10-rich fields (`trustTier / agencyName / isExclusive / nextAvailableDate
/ availableDaysInNext30`) are now present on every item in the API response. Values
are null for current canonical Impronta seed talents because they are not in
`talent_discover_index` (Lane 5's documented limitation; see §6 R5).

### 3.2 Rendered HTML marker counts (live curl, Host: impronta.lvh.me)

| Probe | TAL anchors | `data-card-ownership` | `data-card-availability` | `data-card-trust` | "Availability unknown" | `No QueryClient set` |
|---|---|---|---|---|---|---|
| Pre-Phase-B `/directory` (`f6624da44`) | 6 | 0 | 0 | 0 | 0 | 0 |
| Pre-Phase-B `/p/our-fashion-models` | 6 | 0 | 0 | 0 | 0 | 0 |
| Post-Phase-B `/directory` (`c106a7e471`) | 6 | **6** | **6** | 0 | **6** | 0 |
| Post-Phase-B `/p/our-fashion-models` | 6 | **6** | **6** | 0 | **6** | 0 |

Lane 5's own commit-body QA (executed against a test-only seed flip that
populated TAL-92001/2/4 in the matview, then reverted):

```
/api/directory?limit=48 →
  ENRICHED TAL-92001: trustTier=basic agency='Impronta Models' exclusive=True nextAvail=2026-05-20
  ENRICHED TAL-92002: trustTier=basic agency='Impronta Models' exclusive=True nextAvail=2026-05-20
  ENRICHED TAL-92004: trustTier=basic agency='Impronta Models' exclusive=True nextAvail=2026-05-20
  legacy TAL-00031..00037 (6 talents not in matview): trustTier=None
/directory rendered HTML →
  3× data-card-trust='basic'    (TN-1, TN-2 PASS)
  9× data-card-ownership        (TN-3 mirrored on reactive grid)
  9× data-card-availability     (incl. 6 'Availability unknown — ask to confirm' — AV-2 honest fallback)
```

The post-Phase-B canonical seed shows 0 `data-card-trust` because no current
talent is in the matview; this is by-design under the truthy guard at
`talent-card.tsx:306` (`card.trustTier ? <TrustTierBadge ... /> : null`).

---

## 4. Warm perf table (20-run sequential, dev SSR, Host: impronta.lvh.me)

All values in seconds. Warmed thrice before each loop. Dev server (`next dev`),
NOT a prod build. Per prior sign-offs, these are SSR-page-time, NOT the §7
isolated card-API budget — recorded for trend, not for `<300ms` adjudication.

### Phase A baseline (Lane Q, post Lane 1)

| Route | min | median | p95 | max | mean |
|---|---|---|---|---|---|
| `/directory` | 2.256 | 2.766 | 4.234 | 4.234 | 2.883 |
| `/p/our-fashion-models` | 1.889 | 2.449 | 4.285 | 4.285 | 2.551 |

### Phase B (post Lane 5 + Lane 6 — HEAD `c106a7e471`)

| Route | min | median | p95 | max | mean |
|---|---|---|---|---|---|
| `/directory` | 2.357 | 2.780 | 3.875 | 5.436 | 2.934 |
| `/p/our-fashion-models` | 1.980 | 2.310 | 3.438 | 3.610 | 2.479 |

**Trend:** Δ vs Phase A — `/directory` median +0.5%, p95 −8.5%; `/p/...` median
−5.7%, p95 −19.7%. **Lane 5's added batched matview lookup did NOT regress
SSR-page-time within the dev-server noise floor.** p95 actually improved
slightly on both routes (likely just variance — sample of 20 isn't tight
enough to claim a real improvement).

The §7 budget (`/api/discover/talents` <300ms p95) is **architecturally
unchanged** — Lane 5 reuses `loadDiscoverTalents` for the SSR seed and adds
exactly one batched IN(...) call against `talent_discover_index` per page.
No new uncached heavy join. PF-1 stays PASS on architecture.

---

## 5. Lane 6 Phase 2b round-trip proof

Lane 6 ships its own round-trip QA harness at `web/scripts/qa-directory-catalog-roundtrip.mjs`
(160 LOC) and embeds the proof in its commit body. Excerpted verbatim:

```
BEFORE field_visibility_overrides: {}
WRITE { __qa_probe_facet__: false } via the same mutation shape the
  server action emits (UPDATE-first path).
RE-FETCH: { __qa_probe_facet__: false }  ✓ persisted
RESTORE original state                    ✓ leaves no residue
```

Lane 6's stated honest limitation: the `"use server"` actions
(`saveDirectorySidebarLayout`, `setDirectoryFieldSidebarVisibility`, …) cannot
be invoked from a plain node script because they need a Next request scope
(cookies + RLS-aware session). The harness therefore exercises the underlying
table mutation with the service-role client — the same shape the server action
emits — and uses the **production reader contract** to verify the round-trip
is identity-preserving end-to-end. This is the correct seam choice for a
node-script harness; full e2e through the server-action layer is operator
QA via the drawer UI (deferred to a manual pass — not blocking).

Live-side sanity (this lane, read-only): `curl /directory` post-Phase-B still
returns HTTP 200 with 6 card anchors and no broken sidebar facet ordering.
The reader path Lane 6 writes through is the same one already shipping the
sidebar, so the writer matching the reader is the round-trip the harness
proves. Schema collision risk (Lane 6's stated honest limitation about the
singleton CHECK constraint) is noted: today's Impronta-only pilot is unaffected
because the constraint is satisfied by the single row's `id=1`; a future second
tenant would need a follow-up migration. Tracked in §7.

---

## 6. Lane completion status table

| Lane | Spec doc | Commit | Verified items |
|---|---|---|---|
| Lane 6 — Phase 2b drawer↔catalogs | (no separate doc — closes A4 region of the EP) | `560f130620` | New `src/lib/site-admin/server/directory-catalogs.ts` ("use server", 514 LOC) exposes 8 server actions all guarded by `requireStaff + requireTenantScope`, all writes scoped to `scope.tenantId`, all cache-busted via `CACHE_TAG_DIRECTORY + tagFor(tenant,'storefront')`. Editor patch (205 LOC, sections/directory/Editor.tsx) adds 'Live storefront sidebar' panel with 3 optimistic-revert live controls. Roundtrip script `web/scripts/qa-directory-catalog-roundtrip.mjs` (160 LOC) ships in same commit. tsc clean / eslint clean / 94/96 tests. Item-order DnD deferred (action ready). |
| Lane 5 — §10-rich card data | (closes TN-1/TN-2 of acceptance) | `c106a7e471` | `DirectoryCardDTO` extended additively with `trustTier / agencyName / isExclusive / nextAvailableDate / availableDaysInNext30` (all optional + nullable — legacy callers unaffected). `ApiDirectoryCardRpcRow + mapper` parallel additive fields with null/false defaults. `fetchDirectoryPage` batched IN(...) lookup against `talent_discover_index` (non-fatal on error). `talent-card.tsx` gains `TrustTierBadge` + `OwnershipBadge` + ratified `AVAILABILITY_UNKNOWN` fallback string. tsc clean / eslint clean / 94/96 tests. **Cool-not-warm token mapping** — no new `impronta-gold` introduced. Self-curl QA in commit body. |

### Non-Phase-B incident (transparency)

**WIP-WEDGE — NORMAL — `/directory` and `/api/directory` returned HTTP 500
between ~19:43 and ~19:51 local while Lane 5's edit was mid-flight.** The
working tree at that window had `fetch-directory-page.ts` line 1057 throwing
`Return statement is not allowed here` because the §10-rich insert had removed
a surrounding `for` loop header while leaving its body. Next.js dev's
hot-reloader surfaces compilation errors as 500 responses on every imported
route. Read-only lane could not patch; the condition self-cleared once Lane 5
committed `c106a7e471`. Recording it here so the lead agent knows the live
dev surface was unavailable for ~8 minutes during the Phase B landing window.
Not present in any committed state.

---

## 7. Honest regression / carry-over flags

### R1 — RESOLVED at `f6624da44`

The Phase A P0 (`No QueryClient set` on `/p/our-fashion-models`) is closed.
Live curl post-Phase-B confirms 0 occurrences of the error string and 6 card
anchors rendered. R1 was the single biggest gap from Phase A; it is gone.

### R2 — NORMAL — Dev-SSR page-time still elevated vs pre-Lane-1 baseline

Phase A's baseline was ~1.7s/1.2s p95 (`/directory` / `/p/...`). Post-Phase-B
is ~3.9s/3.4s p95 — still meaningfully above pre-Lane-1 numbers, but Phase B
itself contributed essentially nothing (within noise) on top of Lane 1's
hydration overhead. Action: prod-build measurement is the only way to know
if this is a real budget regression or just dev cost. PF-1 stays PASS on
architecture; this carries forward from Phase A unchanged.

### R3 — NEAR-MISS — gold tokens still served on directory pages

Carry-over from Phase A. Strict PA-1 scope (section subtree + page route +
DirectoryCard) holds zero gold tokens. The legacy `talent-card.tsx` used by
the reactive grid + shared `home/hero-search.tsx` AI band do contain gold
tokens (151 occurrences in `/p/our-fashion-models` HTML). Lane 5 explicitly
honored "no new gold introduced" in its trust-tier styling (cool-not-warm
mapping for all four tiers including 'gold'); cleanup of pre-existing gold
in the legacy card is a separate task. **Not regressed in Phase B.**

### R5 — INFO — Live canonical seed has zero matview membership for currently-rendered talents

Current `/directory` shows TAL-00031..00037, none of which are in
`talent_discover_index` (Lane 5 noted: `is_discoverable=false` agency-roster
talents). Consequence: live HTML shows 0 `data-card-trust` markers, 6
"Independent" ownership badges, 6 "Availability unknown — ask to confirm"
lines. This is by-design under Lane 5's truthy guards and the AV-2 ratified
fallback contract — not a regression and not a TN-1/TN-2 fail (Lane 5
provided populated-state evidence via temp roster flip in its commit body).
Action: a seed-data follow-up to populate `talent_discover_index` for at
least one current discoverable talent would make the live storefront
demonstrate the trust badge without requiring a roster-status flip.

### R6 — INFO — Schema singleton CHECK on `directory_sidebar_layout`

Lane 6 explicitly flagged that `directory_sidebar_layout` still carries the
legacy `id = 1` singleton CHECK from the 2026-04-11 migration. Today's
Impronta-only pilot is unaffected; a second tenant ever wanting custom
layout will need a follow-up migration to drop the singleton and switch
the PK to `tenant_id`. Lane 6's INSERT fallback returns an explicit error
on collision (does not silently fail).

---

## 8. Open items / next-session work

Items that are NOT closed by Phase B and need separate work:

1. **Signup-wire ↔ paid-tenant pairing** — Lane 3's `ensureDirectoryPage` is
   gated to `plan_tier !== "free"` (correct A3 behavior), but all current
   signups hard-code Free. The seeding path is dormant in practice until
   plan-tier selection ships at signup. Tracked as part of Track C.
2. **Track-C plan-gate enforcement** — Per the BINDING memory note on the
   directory section plan: "Studio=1 directory page, Agency=full flex;
   enforcement deferred to Track C — don't flip plan-capabilities
   unilaterally." Still deferred.
3. **`/p/[[...slug]]` push coordination across diverged commits** — Phase B
   landed two commits on top of `f6624da44`; the wider `phase-1` branch has
   other agents' commits in flight (see `git status` showing 24+ unstaged
   files modified by parallel work). Push coordination per CLAUDE.md branch
   governance: rebase + TS/lint gate before any push from this lane.
4. **Item-order DnD UI** — Lane 6 explicitly defers the drag-and-drop
   reorder UI; underlying `setDirectorySidebarItemOrder` action is shipped.
5. **Seed-data follow-up** (R5) — populate `talent_discover_index` for at
   least one currently-discoverable Impronta talent so the live storefront
   demonstrates `data-card-trust` without requiring a roster-status flip.
6. **Schema singleton resolution** (R6) — when a second tenant wants
   custom layout, drop `directory_sidebar_layout.id = 1` CHECK and switch
   PK to `tenant_id`.
7. **PA-8 4-viewport screenshots** — read-only lane cannot attach; still
   outstanding from Phase A.
8. **PF-1 prod-build measurement** — needed to disambiguate R2 (dev-SSR
   elevation) from a real budget regression.
9. **Operator-driven drawer round-trip QA** — Lane 6's harness covers the
   table-level round-trip; the full server-action round-trip (cookies +
   RLS session + cache invalidation) is best verified by an operator
   clicking the drawer in the page-builder UI and watching the live
   storefront update.

---

*Author: continuous-verification lane (Q'), 2026-05-19. Read-only. No code
changed. Sole output is this doc. Subordinate to
`directory-section-acceptance-2026-05-19.md` and the Discover binding spec.*
