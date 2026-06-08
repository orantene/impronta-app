# Page Builder Audit — 2026-06-05

**Mandate:** blunt assessment of the Tulala/Impronta freeform builder against a 2026 “program-in-the-browser” bar — fast, lean, clean, easy to design.

**Scope:** Production truth is **`origin/main`** (Vercel production deploy). This workspace checkout was **~76 commits behind `origin/main`** at audit time; all code citations below reference **`origin/main`** unless noted. Prior docs read: `builder-premium-audit-2026-06-04.md`, `builder-100-execution-plan-2026-06-04.md`, `builder-w3-client-render-blueprint-2026-06-04.md` (all on `origin/main`, not in the stale local tree).

**Verification this session**

| Check | Result |
|---|---|
| Vercel env | `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS=1` in **Production** (confirmed via `vercel env ls`) |
| Browser QA — prod storefront | `https://improntamodels.com/?edit=1` loads full homepage (large page, 15+ sections) — **edit chrome requires auth; not exercised on prod** |
| Browser QA — local | `localhost:3010` on **stale local `main`**: dev signin works with password; `?edit=1` stalls on “Entering edit mode”; server log: staff-check warning + hydration noise from browser tooling; **not representative of production builder** |
| Code review | Full pass on `origin/main` hot paths (edit-context, selection-layer, render, client canvas, navigator) |
| Instant-paint profiling | **Not run** — requires authenticated prod/preview session + React Profiler; flagged as P0 gap |

---

## Scorecard

| Dimension | Weight | Score | Evidence (honest) |
|---|---:|---:|---|
| **Clean** | 22% | **81** | W0/W1 cockpit pass landed on prod branch: ⌘K launcher pill, unified **Layers** label (with Outline + **Classes** view modes), dead navigator-rail icons removed. Still: block toolbar overload (~9 equal icons), drawer mutex, mobile amber wall, icon-only inspector rail, topbar target count high. |
| **Fast** | 22% | **60** | W3 A–D shipped + flag **ON** in prod — freeform `builderTree` mutations skip `router.refresh()` and paint via `ClientBuilderCanvas` + `BuilderNodeView` memo. **But:** curated section inspector edits still SSR-refresh; `edit-context.tsx` is **6,437 LOC** with monolithic context (~38 direct consumers); tree commits still `JSON.stringify` + clone; Sub-step **E not done**. Instant paint **not profile-verified** this session. |
| **Easy** | 18% | **85** | Form node + field props, linked style **Classes** manager (navigator tab + `linked-style-classes-bar`), eyedropper + recent colors, templates/page designs, motion presets, focal-point/aspect on images. Still: **two style engines** (section `presentation` vs freeform escapes), raw CSS text fields for grid/filter/clip-path, no custom breakpoints, classes not yet in publish snapshot (client-only registry). |
| **Premium-feel** | 20% | **68** | Multi-select, align/distribute, marquee, resize/spacing handles, floating Layers panel, command palette — all real. Doesn’t *feel* native yet: enter-edit ~2–3s observed locally; section-path lag; over-render; mobile editing degraded; micro-interactions/copy still “admin SaaS” not “design tool”. |
| **Capability-completeness** | 18% | **86** | 25+ builder node kinds + `form`, section embeds, repeaters/data binding (roster-scoped), components/instances, full-page design seeds, site header/footer shell editing. Missing vs Webflow/Framer class: custom breakpoints, interaction timeline, external CMS bindings, stock media, visual grid/filter editors, class publish parity. |
| **Weighted overall** | 100% | **74** | **Not** sum-of-gains — weighted average. Up from ~60 pre-W3, **not** near 100. |

**Trajectory:** June 4 audit ~60 → today **~74** on production branch. The W3 leap bought ~14 weighted points on Fast alone; remaining gap to 100 is mostly **Fast (context split + verify)** + **Easy (style unification + visual pickers)** + **Premium (polish pass)**.

---

## What’s genuinely good (don’t regress)

1. **Pure render core** — `renderBuilderNodes` in `web/src/lib/site-admin/builder-node/render.tsx` is hookless, test-covered, perf-budget gated (~57 KB global CSS, exactly-once invariant). Foundation is real.
2. **W3 client canvas architecture** — Flag-gated (`client-canvas-flag.ts`), `ClientBuilderCanvas` + `client-builder-canvas-bridge.ts` (`useSyncExternalStore`) solves the EditProvider/body sibling problem cleanly. `section_embed` stays server islands with scoped refresh — correct tradeoff.
3. **Direct manipulation depth** — `selection-layer.tsx` (~6,396 LOC): marquee multi-select, align/distribute, canvas resize/spacing handles, drag-reparent with **cached drop index at drag-start** (W2.1).
4. **Cockpit discoverability** — `CommandPalette` + topbar launcher; Layers panel with **Layers / Outline / Classes** modes; starter template gallery + page design seeds.
5. **Form primitive** — `form` kind in `types.ts` with field props + `/api/cms/forms/submit` routing — highest-impact marketing-site gap closed on prod branch.
6. **Linked style classes (Wave 3B)** — `style-classes.ts` + Classes tab — Webflow-style referenced styles (localStorage registry; merge at render when registry supplied).
7. **Save coalescing** — `BUILDER_SAVE_DEBOUNCE_MS = 750` on builder-tree persist; inspector autosave ~450ms — network no longer hammers per keystroke for tree ops.
8. **Safety net** — Flag-off path preserves full SSR canvas + `queueRouterRefresh()` — meets constraint.

---

## Gaps & bugs (ranked)

| # | Symptom | Root cause | User impact | Fix sketch | Effort | Model |
|---|---|---|---|---|---|---|
| **G1** | Edits on **curated sections** (hero, featured talent, etc.) still feel laggy | Inspector autosave → `queueRouterRefresh()` for section props (`inspector-dock.tsx` ~419–422); client canvas only replaces **freeform tree** body | Operators editing Impronta homepage heroes still wait 300–900ms per style tweak | Extend client canvas or section-style optimistic DOM layer for `presentation`/`nodePresentation` patches; or migrate sections to freeform | **L** | Opus |
| **G2** | Whole editor re-renders on tree/selection/saving changes | Monolithic `EditContextValue` (~200 keys) in **6,437-line** `edit-context.tsx`; W3 bridge only feeds canvas, not consumers | Navigator, topbar, drawers repaint on every block edit; undermines W3 gains | **Sub-step E:** selector store / split providers; migrate ~38 consumers in clusters; move hover out of global value | **XL** | Opus |
| **G3** | Instant paint **unproven** on prod | W3 D ships without attached Profiler budget in CI | May still “feel slow” despite architecture win; risk of silent regressions | W6 task: authenticated prod smoke — edit heading, DevTools disable cache, **zero** RSC fetch on commit; p95 interaction <16ms | **M** | Opus |
| **G4** | **Classes** don’t affect published site | `linked-style-classes-bar.tsx` docs: registry is client localStorage; server render doesn’t receive `styleClasses` | “Edit class → all blocks update” breaks at publish | Persist `styleClasses` in page snapshot + thread through `homepage-cms-sections` render options | **L** | Opus |
| **G5** | Two style systems | Section `presentation.ts` + `nodePresentation` vs `BuilderNodeStyleValue` (~200 props) in same Style/Responsive tabs | Confusing inspector; responsive ceiling on legacy sections | Wave 5.3 style-engine unification (execution plan) | **XL** | Opus |
| **G6** | Marquee / selection O(N) DOM scans | `selectedNodeIdsForRect` still `querySelectorAll("[data-builder-node-id]")` per marquee (`selection-layer.tsx` ~815–836 on prod branch) | Jank on 200+ node pages | Reuse drag-start rect index pattern for marquee; rAF-throttle hover rects | **M** | Opus |
| **G7** | Undo history cost | `JSON.stringify` whole tree + `cloneBuilderNodeTree` per commit (`commitBuilderTreeMutation`) | Large-page undo stutters | Inverse patches / structural sharing (W3.5) | **L** | Opus |
| **G8** | Custom breakpoints impossible | Hard-coded tablet/mobile in `style-panel.tsx` + `DEVICE_WIDTHS` in `edit-shell.tsx` | Can’t target 1280/1536/custom | Breakpoint registry + authorable widths (Wave 5.2) | **L** | Opus |
| **G9** | Visual pickers missing for power props | Grid tracks, filter, clip-path, background layers = raw CSS strings | “Easy” score capped; power users only | Wave 5.4 visual pickers | **L** | Opus |
| **G10** | Mobile edit mode | Amber warning + degraded layout (`edit-shell.tsx` max-lg behavior) | Phone/tablet editing feels second-class | Wave 1.6 compact mode | **M** | Opus |
| **G11** | Drawer mutex | Opening Theme/Assets closes inspector (`DRAWER-MUTEX.md`) | Can’t reference palette while editing | Wave 1.3 co-residence | **L** | Opus |
| **G12** | Local dev edit friction | Staff session host mismatch (`edit_chrome_mount.warn` on localhost tenant path) | Agents/devs think builder broken locally | Document `*.lvh.me` pairing or unify dev signin host | **S** | Sonnet |
| **G13** | Stale local checkout | Local `main` missing W3, form, Classes, Layers rename | False negatives if auditing local tree only | `git pull origin main` before builder work | **S** | — |

---

## Shipped-feature verification (do not re-recommend)

| Claimed ship | Verified on `origin/main` | Solid? |
|---|---|---|
| ⌘K command palette | Yes — `command-palette.tsx` + `CommandPaletteLauncher` in `topbar.tsx` | ✅ |
| Unified Layers panel | Yes — label “Layers”, modes Layers/Outline/Classes in `navigator-panel.tsx` | ✅ (minor: file header comments still say “Navigator”) |
| Dead toolbar icons removed | Yes — W0.1 in PR #253 | ✅ |
| W3 client canvas flag ON prod | Yes — Vercel env + code | ✅ architecture; ⚠️ perf not profiled here |
| Form node | Yes — `kind: "form"` in `types.ts` | ✅ |
| Save debounce | Yes — 750ms tree / 450ms inspector | ✅ |
| Eyedropper | Yes — `kit/color-picker.tsx` + recents | ✅ Chromium-only |
| Templates / page designs | Yes — starter gallery + page-designs | ✅ |
| Motion presets | Yes — theme tokens + `motion-panel.tsx` | ✅ entrance-level |
| Image crop | Partial — `objectPosition`, `aspectRatio` escapes; **no** crop UI overlay | ⚠️ |
| Classes tab | Yes — navigator Classes mode + linked classes; **not** publish-parity | ⚠️ |
| BuilderNodeView memo | Yes — `render.tsx` ~3182 | ✅ |
| Context split (Sub-step E) | **No** — bridge only for canvas tree | ❌ highest remaining blast radius |

---

## Legacy / dead-code map

### Keep (load-bearing)

| Path | Role |
|---|---|
| `web/src/lib/site-admin/builder-node/snapshot-slot-bridge.ts` (~1,880 LOC) | Legacy section → synthetic builder nodes; hydration |
| `web/src/lib/site-admin/builder-node/snapshot-tree.ts` | Tree resolve/reconcile |
| `web/src/lib/site-admin/sections/registry.ts` + `*/Component.tsx` | Curated section render |
| `web/src/components/home/homepage-cms-sections.tsx` | Public/edit canvas host (SSR + client canvas gate) |
| `web/src/components/edit-chrome/*` | Canonical editor |

### Parallel system — migrate or delete (product decision)

| Path | Role | Recommendation |
|---|---|---|
| `web/src/components/page-builder/blocks/*` + `PageBuilderPage.tsx` | **`workspace_pages` JSON block editor** — separate from section composer | **Migrate** remaining users to `?edit=1` composer; then delete block editor surface |
| `web/scripts/backfill-page-snapshots.mjs` | Inline duplicate of `buildLegacySectionBuilderTree` | **Delete** duplicate; import shared TS or drop script |

### Half-migrated (finish or cut)

| Item | State |
|---|---|
| Freeform vs curated sections | `blank_section` + section eject exist; most Impronta homepage still curated components + synthetic navigator children |
| Style triple stack | `presentation` + `nodePresentation` + `BuilderNodeStyleValue` |
| Style classes | Editor-only localStorage; needs snapshot persistence |
| Sprint 5 `dispatch()` in edit-context | Partial refactor toward store; **not** consumer-level selectors |

### Safe to delete after doc sync

- Stale doc references to `legacy-section-tree.ts` (renamed → `snapshot-slot-bridge.ts`)
- Comment-only “Navigator” strings if Layers is canonical

### Do not delete

- Flag-off SSR path (`isBuilderClientCanvasEnabled()` false)
- `section_embed` server renderer
- `queueRouterRefresh` (conflict, publish, locale, embed set changes)

---

## Perf deep-dive

### Is the client-canvas flag delivering instant paint?

**Architecturally yes for freeform tree mutations; empirically unverified this session.**

When `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS=1`:

1. `EditProvider` publishes `builderTree` → `publishBuilderCanvasTree()` (`client-builder-canvas-bridge.ts`).
2. `commitBuilderTreeMutation` calls `setBuilderTree` immediately; **skips** `queueRouterRefresh()` on happy path (`edit-context.tsx` ~4055–4075).
3. `ClientBuilderCanvas` subscribes via `useSyncExternalStore` and calls memoized `renderBuilderNodes`.
4. Exception: `section_embed` island set changes → scoped `queueRouterRefresh()`.

**Still slow paths:**

- Section inspector field edits → SSR refresh (G1).
- `enterEditModeAction` — observed **~2.3s** locally (server action + composition prefetch).
- Initial editor hydrate — edit-chrome bundle ~56k+ LOC eager imports (only Schedule/Comments/Starter gallery dynamically imported).

### Re-render hotspots

| Hotspot | Mechanism | Severity |
|---|---|---|
| `edit-context.tsx` value `useMemo` | Deps include `builderTree`, `slots`, `saving`, selection | **Critical** |
| ~38 `useEditContext()` consumers | No selectors | **Critical** |
| `selection-layer.tsx` | Subscribes to full context + DOM scans | **High** |
| `navigator-panel.tsx` | Rebuilds tree on every context change | **High** |
| `style-panel.tsx` (~8,778 LOC) | Re-renders on any selected node change | **Medium** |

### Sub-step E recommendation

**Do it.** W3 bridge proves the pattern (`useSyncExternalStore` for one slice). Extend to:

1. **EditorStore** — `builderTree`, selection, device, dirty/saving (volatile).
2. **EditorActions** — stable callback ref object (insert, move, dispatch, undo).
3. **HoverOverlayStore** — local to `selection-layer` (not context).
4. Migrate consumers in order: `selection-layer` → `navigator-panel` → `topbar` → `inspector-dock` → drawers.
5. Gate: React Profiler — edit one heading → ≤3 component commits outside canvas node.

### Selection-layer cost

- **Fixed (W2.1):** drag `collectCanvasDropCandidates` cached at drag-start; refresh on scroll/resize only.
- **Open:** marquee `querySelectorAll` + O(N²) ancestor filter; hover ring rect recompute; MutationObserver on large DOM.
- **Large-page test candidate:** improntamodels.com homepage (15+ sections, featured talent grid, directory hero) — use for profiling.

### Bundle / hydration

- Edit shell statically imports: palette, navigator, inspector, selection-layer, most drawers.
- W4 (dynamic drawers + inspector tab splits) not done — TTI still heavy.
- Hydration: client canvas must match server `data-builder-node-id` contract — covered by W3 tests; watch `section_embed` boundaries.

---

## UX/UI polish list (works → native program)

| Area | Gap |
|---|---|
| Block toolbar | Demote move/copy/reset to context menu; 4 primaries + destructive divider (Wave 1.1) |
| Inline text edit | Hover “Double-click to edit” affordance; duplicate-match recovery on canvas |
| Save signals | Consolidate chip + publish CTA (Wave 1.5) |
| Topbar | Overflow menu for secondary tools (Wave 1.4) |
| Inspector | Width drag-resize; tab labels not icons-only (Wave 1.7) |
| Onboarding | Coachmarks on populated pages (Wave 1.8) |
| Drawers | Co-residence with inspector (Wave 1.3) |
| Mobile | Designed compact mode vs amber wall (Wave 1.6) |
| Keyboard | Shortcut overlay discoverability (?) beyond hidden shortcut |
| Empty states | Stronger first-run on non-blank canvases |
| Publish trust | Blocking vs advisory preflight still dense |
| Micro-interactions | Panel open/close, drag ghosts, snap guides — functional not delightful |
| Image crop | Focal drag handle on canvas, not only inspector fields |
| Color | Palette-from-image, saved swatch libraries beyond recents |

---

## Additional recommendations (not in prior plan)

1. **Profile gate in CI** — Playwright trace + “no RSC request on style patch” assertion behind flag; fail regressions.
2. **Pull `origin/main` before any builder agent work** — this audit caught a 76-commit drift; local agents will re-audit pre-W3 and give wrong guidance.
3. **Impronta homepage migration** — eject top 3 curated sections to freeform to dogfood W3 on the flagship tenant.
4. **Classes → snapshot** — treat as P0 for “Webflow parity” credibility (G4).
5. **Section-style fast path** — even before full unification, patch `presentation` fields client-side for preview (smaller than 5.3).
6. **Large-tree budget test** — extend `render-perf-budget.test.ts` with 500-node editor interaction budget (not just publish HTML weight).

---

## Phased execution plan to 100%

Ordered by **impact ÷ effort**. Flag-off SSR path preserved throughout.

### Phase 0 — Verify & align (3 days)

| Task | Model | Effort | Exit |
|---|---|---|---|
| Pull `origin/main`; re-run audit agents on current tree | Sonnet | S | No stale-code false negatives |
| W6 instant-paint verification on prod (auth QA user, Profiler, RSC filter) | Opus | M | Document p95; Fast score evidence |
| Fix local dev edit host docs (`lvh.me` / signin on storefront host) | Sonnet | S | `?edit=1` works on :3010 |

### Phase 1 — Fast: finish the leap (2–3 weeks)

| Task | Model | Effort | Depends |
|---|---|---|---|
| **E1** Sub-step E — EditorStore + split providers (cluster migrations) | Opus | XL | W6 baseline |
| **E2** Hover/selection out of global context | Opus | M | E1 |
| **E3** Undo → inverse patches (drop full-tree stringify) | Opus | L | E1 |
| **E4** Marquee rect index + rAF throttle | Opus | M | — |
| **E5** Section inspector optimistic preview OR mini client patch for `presentation` | Opus | L | E1 |
| Gate: `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint` | — | — | Fast ≥85 measured |

### Phase 2 — Easy: one style engine (2–3 weeks, parallel after E1 starts)

| Task | Model | Effort |
|---|---|---|
| **U1** Persist style classes to page snapshot + server render | Opus | L |
| **U2** Style-engine unification (section → freeform inspector) | Opus | XL |
| **U3** Custom breakpoints registry | Opus | L |
| **U4** Visual pickers: grid, filter, focal drag, clip-path presets | Opus | L |
| **U5** Image crop overlay UI | Sonnet | M |

### Phase 3 — Clean + Premium (1–2 weeks)

| Task | Model | Effort |
|---|---|---|
| **C1** Block toolbar declutter + context menu | Opus | M |
| **C2** Drawer co-residence | Opus | L |
| **C3** Topbar overflow + save signal consolidation | Sonnet | M |
| **C4** Mobile compact edit mode | Opus | M |
| **C5** Micro-interaction sweep (W6.1) | Sonnet | M |

### Phase 4 — Lean + legacy cleanup (1 week)

| Task | Model | Effort |
|---|---|---|
| **L1** `next/dynamic` remaining drawers + palette + inspector tabs | Sonnet | M |
| **L2** Retire `workspace_pages` block editor OR fence behind admin flag | Opus | L |
| **L3** Delete duplicated legacy bridge in backfill script | Sonnet | S |

### Phase 5 — Gate to 100 (1 week)

| Task | Model | Effort |
|---|---|---|
| Full W6 QA matrix (large page, 3 breakpoints, undo, publish, classes parity) | Opus | L |
| Flip flag default-on → remove flag (only after SSR fallback proven unused) | Opus | M |
| Re-score all dimensions with evidence attachments | Opus | S |

**Target scores at 100 gate:** Clean 95+, Fast 92+, Easy 95+, Premium 90+, Capability 92+ → **weighted ~93–95** (asymptotic last points need real users).

---

## Summary

The production branch (**`origin/main`**, not this stale local checkout) has made a **real** perf architecture bet: W3 client canvas is implemented, memoized, flag-**ON** in Vercel production, and correctly preserves SSR fallback + `section_embed` islands. Cockpit pass (palette, Layers, Classes tab, form node, debounced saves, drag cache) is **substantive**.

It is **not** a 2026 best-in-market editor yet. **Weighted ~74/100.** The gap is not missing primitives — it is **unfinished perf isolation (Sub-step E)**, **unverified instant paint**, **dual style systems**, **classes not publishing**, and **premium polish**. The single highest-impact remaining item is **context/store split (Sub-step E)** — without it, W3’s canvas win is partially taxed by whole-app re-renders.

**Immediate actions:** (1) sync local tree to `origin/main`, (2) run authenticated instant-paint profiling on improntamodels.com, (3) schedule Sub-step E before new feature waves.
