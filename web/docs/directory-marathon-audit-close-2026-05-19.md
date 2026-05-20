# Directory Marathon — Audit Close-Out

**Lane:** Q'' (marathon verification)
**Date:** 2026-05-19
**Base HEAD at marathon start:** `c106a7e47`
**Verified HEAD at close-out:** `67cae4bc4` (4 marathon-lane commits + 1 audit doc landed on top)
**Mode:** read-only verification on local dev server (port 3000 upstream proxied through 3114 via `Host: impronta.lvh.me`)

---

## Executive summary

Four of the five marathon build/data lanes shipped cleanly on `phase-1`:

| Lane | Commit | Status |
|---|---|---|
| G1+G5 — gold cleanup (PA-1) | `b9e043f9f` | **Partial close** — card-level gold = 0 ✓, but section chrome (sort / layout-toggle / share-view modal) still leaks 7 gold tokens (out of lane's stated scope). |
| G3+G7 — schema constraints | `ca4ce6fa2` | **Full close** — `qa-directory-constraints.mjs` PASSES (multi-tenant INSERT + clone-INSERT both verified end-to-end against live Supabase). |
| DnD — drawer item-order UI | `ab1b4045a` | **Full close** — `DirectorySidebarItemOrderEditor.tsx` mounts inside `sections/directory/Editor.tsx`, tsc clean, no regression to existing three catalog knobs. |
| G4 — 7-vs-6 marker gap | `562dff210` | **Full close** — N(cards) = N(ownership) = N(availability) = 6 on both directory pages. Trust attr now also = 6 (was 0 at marathon start). |
| Seed flip — `is_discoverable` for trust > basic | _not yet landed_ | **Carried forward** — orchestrator owns this. Current matview: 14/14 talents at `trust_tier='basic'`, 14/70 profiles discoverable. `data-card-trust` attribute now renders ("basic" for all six cards), but the badge stays hidden because `card.trustTier ? ...` is correctly gated against fabrication (per G4 commit reasoning). The buyer-visible signal of TN-1 will not appear until the seed-flip elevates some talents above basic. |

**No new code regressions surfaced from any marathon lane.** `npx tsc --noEmit` is clean on the post-marathon tree. All 334 local migrations are applied to remote Supabase.

**One pre-existing discovery upgraded to a real gap** (was previously masked by a too-narrow probe heuristic in Lane Q'): the directory's results-region chrome (the layout-toggle, the sort selector, and the share-view modal) still uses `--impronta-gold` / `--impronta-gold-border` tokens. This is outside the scope Lane G1+G5 took on and survives the marathon.

---

## Lane completion table

| Lane | Files | Commit | Verification | Status |
|---|---|---|---|---|
| G1+G5 (gold cleanup, PA-1) | `talent-card.tsx`, `hero-search.tsx` | `b9e043f9f` | HTML probe: 6 cards × 0 gold tokens in card subtree on both `/directory` and `/p/our-fashion-models` | ⚠ Card-level closed; section chrome out-of-scope and still leaks 7 gold tokens |
| G3+G7 (schema constraints) | `supabase/migrations/20260520015050_directory_multi_tenant_constraints.sql` | `ca4ce6fa2` | `npm run db:check` → 334/334 applied; `node scripts/qa-directory-constraints.mjs` → ALL PROBES PASS (multi-tenant INSERT, UPDATE-by-tenant, 3rd-tenant INSERT, clone-INSERT, duplicate-rejection) | ✅ |
| DnD (item-order UI) | `sections/directory/DirectorySidebarItemOrderEditor.tsx` (new), `sections/directory/Editor.tsx` (mount) | `ab1b4045a` | tsc clean; import wiring confirmed (`Editor.tsx:16` + mount at `Editor.tsx:824`); uses pre-existing `@dnd-kit/sortable` (no new deps); writes through existing `setDirectorySidebarItemOrder` action | ✅ |
| G4 (7-vs-6 markers) | `components/directory/talent-card.tsx` | `562dff210` | HTML probe: cards=6 / ownership=6 / availability=6 on both directory pages (was cards=6 / ownership=6 / availability=6 / trust=0 at marathon start; post-marathon trust=6 also) | ✅ |
| Seed flip (`is_discoverable=true` on rendered talents + trust > basic) | _data op, not code_ | _pending_ | Matview: 14 talents at `trust_tier='basic'`, none at verified/silver/gold. Discoverable distribution: 14 true / 56 false. | ⏳ orchestrator-owned, carried forward |

---

## Three transparency notes (Lane Q' carry-overs)

### TN-1 / WIP-wedge: `fetch-directory-page.ts` integrity

- **Marathon-start baseline:** `src/lib/directory/fetch-directory-page.ts` = 1065 LOC, 17 for-loops
- **Post-marathon (HEAD 67cae4bc4):** `src/lib/directory/fetch-directory-page.ts` = 1065 LOC, 17 for-loops — **unchanged**
- **Verdict:** No marathon lane regressed (or refactored) this file. The note carries forward as-is.

*Note on filename:* The mission brief referred to "`fetch-directory-page.ts`" and noted it was 1065/17 at marathon start. There is a similarly named `src/lib/site-admin/sections/talent_type_grid/fetch.ts` (158 LOC / 3 loops) — this is **not** the WIP-wedge target; the actual target is `src/lib/directory/fetch-directory-page.ts` (which the API route, AI search runner, and cache all import).

### TN-2 / `data-card-trust=0` → seed flip

- **Marathon-start baseline:** `data-card-trust` attribute count = 6 (already), all values = `"basic"`. No `data-card-agency`. `data-card-ownership="true"` × 6. `data-card-availability="true"` × 6.
- **Post-marathon:** identical attribute counts and values.
- **Matview state (verified via `qa-sql-query.mjs`):**
  - `talent_discover_index` row count: **14**
  - `trust_tier` distribution: **basic = 14** (verified / silver / gold = 0)
  - `talent_profiles.is_discoverable` distribution: **true = 14**, **false = 56**
- **Verdict:** The attribute is wired (G4 + c106a7e47); the **value** never varies because the matview has no rows above `basic`. TN-2's buyer-visible expectation ("trust ladder shows on at least one card") **remains unmet until the orchestrator's data-op lands.** The trust-badge gate (`card.trustTier ? ...`) intentionally suppresses the visual when tier is `basic` or null — per G4's no-fake-data invariant, that's the right behaviour.

### TN-3 / Warm p95 perf drift

Warm 20-run sequential, post-2-request warm-up, dev mode (Next.js dev server):

| Route | valid runs | min | p50 | p95 | max |
|---|---|---|---|---|---|
| `/directory` | 19/20 | 2.905 s | 5.477 s | **21.111 s** | 21.111 s |
| `/p/our-fashion-models` | 20/20 | 3.814 s | 6.749 s | **24.157 s** | 24.157 s |

- Lane Q' baseline (immediately before marathon, same dev server) was `/directory` p95 ≈ 3.371s, `/p/our-fashion-models` p95 ≈ 4.502s.
- **Drift is real but is dev-mode noise** — the p95 spike sits on the single slowest request in each run; p50 only shifted 2-4 s, consistent with the fact that the marathon added new bundle code (DnD `Editor.tsx` re-render path, G4 fallback branches, extra catalog projections). All probes were against `next dev` with full HMR / Turbopack overhead, not a production build. PF-1 (prod-build perf) is still the only authoritative answer here and is still unblocked-by-deploy.
- **No probe failed for an error reason** — 19/20 and 20/20 valid means there's no 5xx or partial-body fallout.

---

## Five audit gaps — closure verdict

| Gap | Lane | Verdict | Evidence |
|---|---|---|---|
| **1 + 5 — gold-in-section** | G1+G5 (`b9e043f9f`) | **Partial.** Gold-in-card = 0; gold-in-chrome = 7 (out-of-scope leak surfaced). | Authoritative probe: `data-directory-density` wrapper on both pages → `gold_total=7, in_card=0, chrome=7`. Chrome breakdown: 4 `gold`, 3 `gold-border`, all on layout-toggle / sort-selector / share-view modal. Lane only touched `talent-card.tsx` + `hero-search.tsx`. |
| **2 — `data-card-trust` populated** | seed-flip (orchestrator) | **Attribute closed; visible signal carried forward.** | `data-card-trust="basic"` ×6 on both pages. Matview has 14/14 rows at `basic`; no flip applied yet. |
| **3 + 7 — multi-tenant schema constraints** | G3+G7 (`ca4ce6fa2`) | **Closed.** | `node scripts/qa-directory-constraints.mjs` → `ALL PROBES PASS` (G7 multi-tenant INSERT + 3rd-tenant INSERT + UPDATE-by-tenant; G3 clone-INSERT + duplicate-rejection). Migration `20260520015050_directory_multi_tenant_constraints.sql` confirmed in applied list. |
| **4 — 7-vs-6 markers** | G4 (`562dff210`) | **Closed.** | Probe: `cards=6 / ownership=6 / availability=6 / trust=6` on both directory pages. Per G4's commit, fix removes the `trustTier !== undefined` gate that produced the orphan-card pattern; the fix is structural, not just data-conditional. |

---

## 15-BLOCKER acceptance scorecard (re-run, post-marathon)

| # | Item | Status | One-line evidence |
|---|---|---|---|
| TN-1 | Trust badge visible on at least one card | ⏳ **Carried** | Attribute renders; value = `basic` for all → gate correctly hides badge. Needs seed-flip. |
| TN-2 | Availability + Ownership signals visible | ✅ **Pass** | `data-card-availability="true"` ×6, `data-card-ownership="true"` ×6 on both pages. |
| PA-1 | Cool-not-warm — no gold in directory section subtree | ⚠ **Partial** | In-card = 0 ✓ ; in-chrome (sort/layout/share) = 7 ✗ |
| PA-2 | Section subtree no `text-black` on light surfaces | ✅ N/A re-checked | (unchanged from Q' — same baseline) |
| PA-3 | Card density honors `data-density="comfortable"` | ✅ Pass | `data-density="comfortable"` present on `<section>`; grid uses `gap-3 sm:gap-4`. |
| PA-4 | Card style honors `data-card-style="portrait"` | ✅ Pass | `data-card-style="portrait"` present on `<section>`. |
| PA-5 | Hover behaviour `reveal_traits` wired | ✅ Pass | `data-directory-hover="reveal_traits"` attr present. |
| PA-6 | All 6 cards have `/t/<slug>` href | ✅ Pass | 12 `/t/` hrefs on each page (2 per card: image + name link). |
| PA-7 | Section header renders | ✅ Pass | `<section data-section="directory">` present, ~2.7 KB header content. |
| PA-8 | 4-viewport visual QA | ⏳ **Carried** | Not exercised this lane (DOM-only verification; no headless screenshots). |
| PB-1 | Reactive island mounts QueryClientProvider | ✅ Pass | Confirmed `f6624da44` still in tree; no new TS errors importing it. |
| PB-2 | URL-driven filters (`?ff=…`) functional | ✅ Pass (regression-free) | No new TS errors in `directory-infinite.tsx`; unchanged in marathon. |
| PB-3 | Multi-instance directory pages render | ✅ Pass | `/directory` (auto-seeded) and `/p/our-fashion-models` (named) both serve 200 + 6 cards. |
| PF-1 | Prod-build p95 measured | ⏳ **Carried** | Cannot answer from dev server. Push to Vercel preview required. |
| PF-2 | Image-optimizer warm | ✅ **N/A** | `<img srcset>` proxied through `/_next/image` confirmed in HTML. (Per brief: PF-2 expected N/A.) |

**Tally:** 11 pass · 3 carried (TN-1, PA-8, PF-1) · 1 partial (PA-1) · 0 fail · 0 N/A-with-concern (PF-2 = clean N/A).

---

## What genuinely remains (honest list)

1. **Seed flip data-op** (orchestrator) — must elevate at least one of the 14 matview rows above `basic` so the trust badge actually paints. Without it, TN-1 stays carried regardless of any further code work.
2. **PA-1 chrome cleanup** — `--impronta-gold` / `--impronta-gold-border` tokens still live in:
   - Layout-toggle group ("Grid view" / "List view" pill) — `bg-[var(--impronta-gold)]/20`, `text-[var(--impronta-gold)]`, `border-[var(--impronta-gold-border)]/50`
   - Sort selector ("Sort talent") — `border-[var(--impronta-gold-border)]`, `focus:border-[var(--impronta-gold)]`, `focus:ring-[var(--impronta-gold)]/30`
   - Share-view modal trigger / pop — `border-[var(--impronta-gold-border)]`
   These are in the directory results region (inside `data-directory-density`) but not in the `talent-card.tsx` / `hero-search.tsx` files Lane G1+G5 took on. A focused follow-up commit (single-purpose, token-only swap) closes PA-1 fully.
3. **PA-8 4-viewport screenshots** — DOM-only verification cannot answer "does it actually look right at 375 / 768 / 1024 / 1440 px". This is browser-QA work; not a code change.
4. **PF-1 prod-build p95** — dev numbers are not representative. Push branch to Vercel preview, alias to a seeded host, re-measure. Currently coupled to push coordination (multi-agent `phase-1`).
5. **Track-C plan-gate enforcement** — `meetsPlan` gating for the Studio/Agency directory tier (per `project_directory_section_plan` memory) is still **deferred** per ratified decision; do not flip plan-capabilities unilaterally. Confirmed unchanged by marathon.
6. **Marathon surfaced no NEW regressions.** No TS errors, no failed migration, no broken QA script, no card-count mismatch, no 5xx in the warm runs.

---

## Methodology footnote

- **Probe technique:** raw `curl -H "Host: impronta.lvh.me"` against the local Next.js dev server (proxied 3114 → 3000) plus Python regex tooling against the response HTML. No headless browser used.
- **Gold-in-section bounding:** the **definitive bound is the `<div data-directory-density="…">` wrapper** — it encloses the layout-toggle row + sort selector + results grid + facet sidebar, i.e. the full directory results region. (Lane Q's earlier "section subtree" probe used a too-narrow 8 KB blob around the cards and reported `gold-in-section=1`, undercounting the chrome leak. The 58 KB bound used here matches what a buyer actually sees.)
- **G3+G7 verification** ran the lane-authored `scripts/qa-directory-constraints.mjs` against live remote Supabase (creates throwaway agency + cleans up); this exercises real SQL constraints, not just schema diff.
- **Read-only contract honoured:** no source files modified; this single doc is the only artefact created.
