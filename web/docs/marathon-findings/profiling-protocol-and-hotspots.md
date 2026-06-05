# Builder "Fast" measurement plan — profiling protocol + static hotspot prediction

Area key: `profiling-protocol-and-hotspots`
Scope: produce the EXACT authenticated profiling procedure (a human/Chrome step) and, from the
real code, PREDICT the top re-render hotspots so the live run can confirm/refute. No live numbers
are claimed here — live React-Profiler runs need an authenticated browser session.

Honest "Fast" sub-score today: 60/100. This doc is the instrument plan to turn that 60 from a guess
into a measured number, plus the ranked code targets the measurement will (very likely) implicate.

---

## 0. Why this is a measurement problem, not a guess

The W3 client canvas already gives **instant canvas paint** for regular nodes: a tree mutation
publishes to a process-singleton bridge
(`web/src/components/edit-chrome/client-builder-canvas-bridge.ts:34` `publishBuilderCanvasTree`),
and `ClientBuilderCanvas` re-renders via `useSyncExternalStore`
(`web/src/components/edit-chrome/client-builder-canvas.tsx:94`) WITHOUT a network round-trip — the
per-edit `router.refresh()` is skipped on the happy path
(`web/src/components/edit-chrome/edit-context.tsx:4070-4075`).

So "Fast" is NOT bottlenecked by the network anymore on a regular-node edit. The remaining cost is
**React reconciliation work per commit** in two trees that BOTH re-render on every mutation:

1. the **editor chrome** (~40 `useEditContext()` consumers), because the giant context `value`
   object is rebuilt on every tree/selection/dirty change; and
2. the **canvas** (`renderBuilderNodes`), because its only memo boundary is defeated by a fresh
   options object on every call.

Both are predicted below with file+line. The live profiler confirms the magnitude (commit ms,
component count) and tells us whether the chrome re-render is actually janky or merely wasteful.

There is currently **NO** profiling instrumentation in the repo — `grep` for `React.Profiler`,
`performance.mark`, `why-did-you-render` returns nothing under `web/src`. The plan therefore
includes a tiny, flag-gated instrumentation patch (§3) so the human run produces hard numbers, not
eyeballed "feels laggy".

---

## 1. PREDICTED hotspots (from the code — to be confirmed/refuted live)

Ranked by predicted commit-cost contribution on a single regular-node edit (e.g. drag-drop a block,
edit a text prop, nudge a node).

### H1 — The monolithic context `value` re-renders all ~40 consumers on every edit (Sub-step E, unresolved)
- **Root cause:** `web/src/components/edit-chrome/edit-context.tsx:6032` builds ONE
  `useMemo<EditContextValue>` packing ~200 fields, with a dependency array of ~150 entries
  (`edit-context.tsx:6258-6420`). High-churn members sit in that array:
  `builderTree` (6303), `selectedBuilderNodeId` (via `selectBuilderNode`/selection state),
  `hoveredBuilderNodeId` (6281), `draftPropsState` (6293), `dirty` (6290), `saving` (6291),
  `past.length` (6343), `future.length` (6344), `device` (6282), `previewFrame` (6284).
- **Consumers:** 40 components call `useEditContext()` /  `useMaybeEditContext()` (full list at
  end of this section). Reading context does NOT participate in `React.memo` prop bail-out — a new
  `value` reference re-renders **every** consumer that is currently mounted, regardless of which
  field it actually reads.
- **What fires it, and how often:**
  - `commitBuilderTreeMutation` (`edit-context.tsx:4141`) runs on EVERY block edit: drag-drop,
    style patch, prop change, insert, delete, paste, align, distribute. It calls
    `setBuilderTree` (4154) **and** `setPast` (4169) **and** `setDirty(true)` (4185). All three are
    `value` deps → one batched re-render of all 40 consumers **per commit**.
  - `setHoveredBuilderNodeId` fires on every block-to-block hover crossing
    (`selection-layer.tsx:1018-1020` — guarded by `nodeId !== hoveredBuilderNodeId`, so not 60fps,
    but every time the cursor moves from one block to another). Each crossing → all 40 re-render.
  - `setDraftProps` fires **per keystroke** in any inspector text field
    (`edit-context.tsx:2035`; consumed by ~17 inspector files incl. `inline-editor.tsx:154`,
    `hero-content.tsx`, `generic-content.tsx`, …). `draftProps` is a `value` member (6101) → every
    keystroke re-renders all 40 consumers.
- **Predicted magnitude:** commit duration scales with the SUM of all mounted consumers' render
  cost, not the one panel the user touched. The heavy consumers are `navigator-panel.tsx`
  (Layers/Outline/Classes tree — renders a row per node), `inspector-dock.tsx` +
  `inspectors/*` (the open inspector), `selection-layer.tsx` (overlay geometry), `topbar.tsx`,
  `freeform-layers-tree.tsx`. On a ~40-node Impronta page the Layers tree alone is the predicted
  long pole.
- **Live test will confirm by:** flamegraph showing `EditProvider` → ~40 child commits on a single
  text-prop keystroke, with `navigator-panel` + the open inspector dominating self-time.

### H2 — Canvas memo boundary defeated by a fresh `options` object → whole-canvas reconcile per edit
- **Root cause:** `renderBuilderNodes` builds `normalizedOptions` as a **fresh object literal on
  every call** (`web/src/lib/site-admin/builder-node/render.tsx:3200-3212`), including `?? {}` /
  `?? ""` fallbacks that mint new empties (`dataSources ?? {}`, `components ?? {}`,
  `styleClasses ?? {}`). The only memo boundary is `BuilderNodeView`
  (`render.tsx:3182-3194`), whose comparator is
  `Object.is(prev.node, next.node) && Object.is(prev.options, next.options)`.
- **The defect:** because `options` is a new reference each render, `Object.is(prev.options,
  next.options)` is **always false**, so the `Object.is(prev.node, next.node)` half — the part that
  would let an UNCHANGED top-level section bail out — never gets to short-circuit. **Every
  top-level node re-renders on every tree publish**, even nodes whose `node` reference is identical.
- **Worse, the memo is top-level only:** children render via `renderBuilderNode(child, options)`
  (singular, NOT wrapped in `BuilderNodeView` — e.g. `render.tsx:1929, 2034, 2069, 2526, 2552`), so
  there is NO sub-tree memoization at all. A 1-character text edit triggers a full re-reconcile of
  the entire visible canvas tree.
- **Caller cadence:** `ClientBuilderCanvas` calls `renderBuilderNodes(tree, …)` on every bridge
  publish (`client-builder-canvas.tsx:101`), and the bridge publishes on every `setBuilderTree`
  (`edit-context.tsx:2157-2163`). So H2 fires on the SAME events as H1's `setBuilderTree`.
- **Mitigating reality:** the DOM commit is usually cheap because most re-rendered nodes produce
  byte-identical output (React diffs, finds no change, skips DOM mutation). The cost is the JS
  reconciliation pass over the whole tree, which is what shows up as canvas commit ms.
- **Predicted magnitude:** scales with total visible node count. On a long Impronta page with media
  + featured-talent + several sections, this is the second long pole. Confirmable by: Profiler
  "Ranked" view showing every section component committing on a single-node edit, with 0 of them
  changing DOM.
- **Cheap-win note (for the fix lane, not this doc's job):** memoize `normalizedOptions` once per
  distinct option-set so the `Object.is(prev.node…)` half can finally bail unchanged sections. This
  is the "no whole-editor re-renders" reframe applied to the canvas specifically, and it is a
  one-function change — try it BEFORE any context split.

### H3 — `curated section_embed` edits still SSR-refresh (heroes laggy) — the ONE network-bound path
- **Root cause:** the client canvas cannot conjure a server island it never rendered, so when a
  mutation changes the section_embed id set, the code intentionally falls back to
  `queueRouterRefresh()` (`edit-context.tsx:4070-4075` and `4163-4168`;
  `mutationTouchesSectionEmbedIslandSet`). Editing the CONFIG of an existing curated hero island
  also can't repaint client-side — its island is a pre-rendered server node passed by id
  (`client-builder-canvas.tsx:111-113`), so a config change needs a server re-render to reflect.
- **Why it's felt as "laggy heroes":** curated heroes are `section_embed` islands
  (`section-embed-renderer.tsx`), and their edits ride the server round-trip while regular nodes
  paint instantly — so the inconsistency is most visible exactly on the hero, the thing operators
  touch first.
- **Predicted magnitude:** this is a NETWORK-latency cost (server action + RSC refresh), not a
  reconcile cost — measure it as paint-latency p50/p95 on a hero config edit, separately from H1/H2.
  Expect 150-600ms vs the <16ms of a regular-node edit. Confirmable via the Network panel
  (`saveDraftHomepageAction` + the RSC refresh) timeline, not the Profiler.

### H4 — Selection / overlay churn on the canvas (secondary)
- `selection-layer.tsx` maintains overlay geometry via rAF (`requestAnimationFrame` at lines 718,
  1284, 1882, 1956, 2260) and reads `useEditContext()` (so it re-renders under H1 too). The live
  drag itself is correctly DOM-direct (`el.style.translate = …`,
  `selection-layer.tsx:2548`/`canvas-move-handle.tsx`) and commits only on pointer-up
  (`onCommitTranslate`/`onCommitDeltas`, `selection-layer.tsx:3708, 3719`), so drag is NOT a
  per-frame `setState` storm — good. But because `selection-layer` is an H1 consumer, every
  unrelated keystroke/hover elsewhere still re-renders it. Confirmable: overlay component commits
  appearing in the flamegraph for a text edit that didn't touch selection.

### Full consumer list (40 — the H1 blast radius)
`MobileHealthPanel, WorkspaceTemplateGallery, assets-drawer, collections-drawer, command-palette,
comments-drawer, composition-library, edit-shell, empty-canvas-starter, floating-panel,
freeform-layers-tree, iframe-bridge, iframe-child, inline-editor, inspector-dock,
inspectors/builder-node-content, inspectors/component-library-panel, inspectors/content-dispatch,
inspectors/data-panel-conditional, inspectors/data-panel, inspectors/instance-overrides-panel,
inspectors/layout-panel, inspectors/my-blocks-panel, inspectors/responsive-panel,
inspectors/site-header/SiteHeaderInspector, inspectors/site-header/tabs/BrandTab,
inspectors/site-header/tabs/StyleTab, inspectors/style-panel, mobile-edit-panel, navigator-panel,
page-settings-drawer, publish-drawer, revisions-drawer, schedule-drawer, section-picker-popover,
selection-layer, shortcut-overlay, starter-template-gallery-overlay, theme-drawer, topbar`
(plus `edit-context.tsx` itself and the bridge module, which are the provider/store, not consumers).

---

## 2. THE authenticated profiling procedure (the human/Chrome step)

Live React-Profiler runs need an authenticated session on a real host. Run this exactly.

### 2.0 Environment + host
- **Host:** `improntamodels.com` (the flagship Impronta tenant; it is in `agency_domains`, so it
  renders — a raw `*.vercel.app` preview returns 404 "Host not registered", see CLAUDE.md QA
  caveat). For a local run, `improntamodels.lvh.me:3000` (or whatever local Impronta host is
  seeded) after `/api/dev/signin`.
- **Flag:** confirm `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS` is ON (it is, in prod — see
  `client-canvas-flag.ts`). The flag is build-time inlined, so a flag-OFF run requires a separate
  build/deploy (or a local build with the env var unset). Plan both runs (§2.4 delta).
- **Build:** profile a **production build** (`npm run build && npm start` locally, or prod itself).
  React dev builds inflate commit durations and warn-spam; the *relative* hotspots hold, but absolute
  ms is only meaningful on a prod build. Note: React's `<Profiler>` `onRender` callback and the
  DevTools Profiler both work against prod builds **if** profiling is enabled — see §3 for the tiny
  patch that makes the in-app `<Profiler>` emit numbers without DevTools.
- **Auth:** sign in as an operator who can edit the Impronta site (workspace member with site-edit
  rights; the `orantene` super_admin credential works, see reference_orantene_dev_credential.md).
- **Tooling:** Chrome + React DevTools extension (Profiler tab) on the local prod build (DevTools
  Profiler cannot attach to a minified prod bundle without the profiling build — so locally run
  `next build` then in `web/next.config` temporarily alias `react-dom$` →
  `react-dom/profiling` + `scheduler/tracing-profiling`, OR just rely on the in-app `<Profiler>`
  from §3 which needs no extension and no alias). The Performance tab (for paint/INP) works on prod
  as-is.

### 2.1 Enter the state under test
1. Navigate to the Impronta homepage on the host.
2. Enter edit mode (the edit pill / `?edit=1` path that mounts `EditChromeMount` → `EditProvider`).
3. Wait for the composition to load (`compositionLoaded` true — Layers panel shows the real node
   count, not "0 sections").
4. Open the Layers (navigator) panel AND an inspector for a selected node — this reproduces the
   real working state where the heavy H1 consumers are all mounted. Profiling with panels CLOSED
   understates the tax; the point is to measure the operator's real configuration.

### 2.2 Interactions to RECORD (one Profiler recording per interaction, labelled)
Record each as its own session so commit attribution is clean:

- **I1 — Text prop keystroke (H1 + H2 driver).** Select a text node, open its inspector, type ~10
  characters into a text field that routes through `setDraftProps` (e.g. a hero headline /
  generic-content text). Metric target: commits per keystroke, components rendered per commit,
  commit duration. PREDICT: 1 commit/keystroke, ~40 chrome consumers + full canvas subtree each.
- **I2 — Drag-drop a block (H1 commit + H2).** Drag a block to a new position; release. PREDICT: 0
  setState during drag (DOM-direct), exactly 1 commit on drop (setBuilderTree+setPast+setDirty
  batched), all 40 consumers + canvas reconcile.
- **I3 — Nudge (Alt+Arrow) ×5 (H1 commit cadence).** Five rapid nudges of a selected node. PREDICT:
  5 commits, each re-rendering all consumers; watch for dropped frames / input latency.
- **I4 — Hover sweep (H1 hover churn).** Move the cursor across ~8 distinct blocks without clicking.
  PREDICT: ~7 commits (one per crossing), each all-consumers. This is the "why does hovering feel
  heavy" test.
- **I5 — Style patch from the Style panel (H1 + H2).** Change a color/spacing on a selected node.
  PREDICT: 1 commit, all consumers + canvas.
- **I6 — Curated hero CONFIG edit (H3, network-bound — use Performance/Network, not Profiler).**
  Edit a field on a curated `section_embed` hero. Measure end-to-end paint latency (the moment the
  hero visibly updates) and capture the `saveDraftHomepageAction` + RSC refresh in the Network
  panel. PREDICT: 150-600ms, visibly slower than I1.
- **I7 — Insert a regular block from the element library (H1 + H2 + history).** PREDICT: 1 commit,
  all consumers; if it inserts a `section_embed`, it ALSO triggers `queueRouterRefresh` (H3 path).

### 2.3 Metrics to capture (per interaction)
For each recording, pull from the React DevTools Profiler (or the §3 in-app `<Profiler>` CSV):
- **Commit count** for the interaction (how many React commits the gesture produced).
- **Commit duration** (ms) — both the worst single commit and the median. This is the headline
  "Fast" number.
- **# components rendered per commit** (DevTools "Ranked" / "Components changed"). The H1 claim is
  "~40 chrome consumers re-render on a 1-field edit" — this is where it's confirmed or refuted.
- **Self-time long poles** — which components dominate (predicted: `navigator-panel`,
  `inspector-dock` + open inspector, the canvas section components).
- **"Did not render" vs "rendered" for unchanged canvas sections** — directly tests H2. If
  unchanged top-level sections show as RENDERED on a single-node edit, H2 is confirmed (the
  `options`-identity bug). If they bail, H2 is refuted.
- From the **Performance tab** (separately, for paint, since the Profiler measures React commit not
  browser paint): **INP / interaction-to-paint ms** for I1-I5 (target: <100ms feels instant,
  >200ms feels laggy), and the **frame chart** during I3 (dropped frames = jank). For I6 capture the
  **network waterfall** duration.

### 2.4 Flag-on vs flag-off delta (the W3 win, quantified)
The audit credits W3 with instant paint but it is UNPROFILED. To quantify:
- Run I1, I2, I5 with `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS` **ON** (default) → record paint-latency.
- Rebuild with the flag **OFF** (legacy per-edit `router.refresh()` server-render path) → re-run the
  same interactions → record paint-latency.
- **Delta = the W3 instant-paint win in ms.** PREDICT: flag-off shows a 150-500ms server round-trip
  on EVERY regular-node edit (the old path); flag-on shows <16ms canvas paint but the SAME H1
  chrome re-render (the flag doesn't touch the context). i.e. W3 fixed the canvas-paint half and
  left the chrome-reconcile half (H1) untouched — which is exactly why "Sub-step E" is the unresolved
  item. This delta is the single most persuasive "Fast" artifact to capture.

### 2.5 Pass/fail thresholds (so the run yields a verdict, not vibes)
- I1 keystroke INP **< 50ms** = good; 50-100ms = acceptable; **> 100ms = the H1 tax is biting,
  prioritize the fix.**
- I2/I5 single-commit duration **< 16ms** = one frame, instant; **> 33ms = janky (>2 frames).**
- I4 hover crossing should ideally produce **0** React commits (hover is decoration); any commit
  count > 0 confirms H1 hover churn is a real, fixable waste.
- I6 hero edit paint **> 200ms** confirms H3 as a felt-lag bug worth the client-island work.
- H2 verdict: **any** unchanged top-level section showing "rendered" on a single-node edit confirms
  the `options`-identity defect.

---

## 3. The tiny instrumentation patch the human run needs (no DevTools required)

Because there is zero profiling infra today, add a flag-gated `<Profiler>` so the run emits hard
numbers even without the DevTools extension and even on a stock prod build. This is a measurement
aid, NOT a fix — it ships behind its own env flag and is a no-op in normal prod.

Sketch (to be implemented in the fix lane, listed here so the human knows what to wire):
- Wrap the two trees in `React.Profiler`:
  - the editor chrome root (in `EditChromeMount` / around `EditProvider`'s children) with
    `id="edit-chrome"`;
  - the canvas (`ClientBuilderCanvas`'s output, or its mount in `homepage-cms-sections.tsx:305`)
    with `id="builder-canvas"`.
- `onRender(id, phase, actualDuration, baseDuration, startTime, commitTime)` pushes a row to an
  in-memory ring buffer; a hidden `window.__builderProfile.dump()` returns CSV
  (id, phase, actualDuration, baseDuration, commitTime). The operator runs an interaction, then
  `copy(window.__builderProfile.dump())` from the console.
- Gate the whole thing behind `NEXT_PUBLIC_BUILDER_PROFILE === "1"` so it never affects normal
  prod. `actualDuration` is exactly the per-commit cost H1/H2 predict; summing per `id` over an
  interaction gives the chrome-vs-canvas split with no extension dependency.
- Bonus: a `console.count()` in `EditContext`'s `value` `useMemo` factory and in
  `renderBuilderNodes` gives a dead-simple "how many times did the giant value rebuild / the canvas
  re-render per gesture" without any Profiler at all — the cheapest possible confirmation of H1/H2.

This patch is the prerequisite for the "Fast" score to move from an estimate to a measurement.

---

## 4. What the live run will let us decide (closing the loop)

- If I1/I3/I4 show all-consumer commits (H1 confirmed) AND the chrome commit ms is the long pole →
  the fix is the Sub-step-E reframe: **stop rebuilding one giant `value`**. Per the audit's own
  guidance, try cheap wins FIRST before splitting the context: (a) memoize `normalizedOptions` to
  fix H2 in one line; (b) move the highest-churn UI-only state — `hoveredBuilderNodeId`,
  `draftProps`, `dirty`/`saving` — OUT of the `value` memo into their own tiny
  `useSyncExternalStore` slices (the bridge pattern already in the repo) so a hover/keystroke no
  longer rebuilds `value`; only THEN consider a full selector-store split.
- If H2's unchanged-section-rendered prediction holds → the `normalizedOptions` memo is the single
  highest-leverage one-function fix in the whole "Fast" lane.
- If I6 confirms hero lag → the client-island reconcile for `section_embed` config edits is the H3
  follow-up (bigger; server-island story).
- The flag-on/off delta (§2.4) is the artifact that proves the W3 work paid off AND that the
  remaining gap is chrome-side — i.e. it tells the user exactly where the next "Fast" point comes
  from.

All predictions above are derived strictly from the cited files/lines and must be confirmed or
refuted by the authenticated run before any surgery (profile-before-you-cut).
