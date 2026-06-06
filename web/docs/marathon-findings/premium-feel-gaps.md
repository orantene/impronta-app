# Marathon findings — Premium-feel gaps (Feel = 68)

Area key: `premium-feel-gaps`
Worktree audited: `/Users/oranpersonal/Desktop/impronta-builder-marathon` (clean `origin/main`, includes W3 client canvas / Form node / Classes tab / Layers rename).
Date: 2026-06-05. All claims cite real files + lines.

## TL;DR — recalibrate the diagnosis

The audit framed Feel=68 as if drag affordances, snapping guides, drop indicators, and async-state were missing. **They are not.** Reading the real code, the "table-stakes premium" layer is already excellent:

- **rAF-smooth selection tracking** — the single-selection ring + chip + every handle overlay are owned by a per-frame rAF loop, not React state, so they track scroll/drag "Figma-smooth, no trailing" (`selection-layer.tsx:3636-3651`, the `overlayRef` rAF pattern in `canvas-move-handle.tsx:74-83`).
- **Alignment + equal-spacing distribution guides** with soft snap, 8px grid, Shift=free, live coord readout, double-click-to-reset (`canvas-align-guides.ts`, `canvas-move-handle.tsx:122-234,466-488`).
- **Drop indicator** is genuinely Framer/Webflow-tier: gradient line, glowing pulsing end-caps, allowed/blocked color states, plus a labeled drag-ghost that says "Nest in <Parent>" / "Not allowed here" / "Drop to move" (`selection-layer.tsx:4600-4719`).
- **Selection chip** — dark gradient, backdrop blur, 2×3 grip dots, type-icon tile, name, type divider, toolbar (`selection-layer.tsx:4118-4247`).
- **Async-state visibility** — `SaveStatus` shows Saving / Unsaved / "Saved Xs ago" + "Unpublished changes" pill with `aria-live` (`topbar.tsx:816-957`); the `SaveChip` kit has a full 5-state palette incl. pulsing "saving" (`kit/savechip.tsx`).
- **Inspector grouping** — `InspectorGroup` groups by *operator intent* (Copy/Buttons/Backdrop), collapsible with per-key sessionStorage persistence (`inspectors/kit/inspector-group.tsx:1-70`). Tabbed Content/Layout/Style/Data/Responsive/Motion with capability-gated default tabs (`inspector-dock.tsx:86-92,133-154`).
- **Custom color picker** with in-app popover, **eyedropper** (Chromium feature-detect + graceful fallback), recent-colors strip, **theme-token binding** with bound-banner + unbind (`kit/color-picker.tsx`).
- **Keyboard coverage is broad**: ⌘K palette, `?` overlay, nudge (⌥+arrows, ⇧=10px), tree nav (↑↓←→, `[` `]`), copy/cut/paste, duplicate, delete, lock, wrap-in-container, convert-to-component, zoom set, device switch, undo/redo, save, share (`kit/shortcuts.ts:70-392`).
- `prefers-reduced-motion` is honored throughout (`selection-layer.tsx:692-695` + ~6 gated transitions).

So **68 is not "the basics are missing" — it's "a handful of high-visibility moments still break the native-program illusion."** Those moments are concentrated and fixable. Ranked below by perceived-quality impact.

---

## Ranked gaps (perceived-quality impact)

### 1. [HIGH] Curated `section_embed` edits round-trip through SSR — heroes feel laggy
Freeform/client blocks repaint instantly (client render). But a **curated island** (hero, featured-talent, trust-strip, etc.) is a real server component rendered via `section-embed-renderer.tsx`. Editing its config can't update in place — the commit path calls `refreshComposition()` (`edit-context.tsx:2995-3016`) which `await`s `loadHomepageCompositionAction` (a server round-trip) and/or `queueRouterRefresh()` → `router.refresh()` (`edit-context.tsx:498,1803,3067`). The operator types a hero headline and the curated block visibly **stalls for a network+RSC cycle** while freeform blocks next to it are instant. This is the single most-felt inconsistency: two different latency classes on the same canvas. Architectural, exactly as the audit flagged ("heroes laggy").
**Root cause:** `section-embed-renderer.tsx` islands are SSR-only; no client optimistic-prop overlay. `edit-context.tsx:2995` `refreshComposition` blocks on a server fetch.

### 2. [HIGH] No editor-side insert / delete / reorder MOTION — blocks pop in and out
Grepped the whole edit-chrome + `render.tsx`: there is **no FLIP / auto-animate / enter-exit transition** when a block is inserted, deleted, duplicated, or reordered in the editor. The only `@keyframes` are (a) the published page's scroll-reveal presets `bn-anim-*` (`render.tsx:326-332`, runtime-only, not editor feedback) and (b) the drop-cap pulse + save-chip pulse. So a freshly-inserted block **appears with a hard cut** and siblings **jump** to their new positions with no settle. Every premium builder (Framer, Webflow, Notion) animates this — it's the #1 "feels alive" micro-interaction and its absence reads as "DOM got swapped," not "I placed something." There is also **no "flash/highlight the newly-inserted block"** affordance, so after an insert the eye has to hunt for what just landed.
**Root cause:** no shared layout-animation wrapper around `renderBuilderNodes` (`render.tsx`); inserts mutate the tree and React swaps DOM with no transition.

### 3. [HIGH] Save FAILURE has no persistent state — only a 5-second toast; CAS conflict has no one-click recovery
The reframe explicitly calls undo/redo + save-conflict recovery "the soul of feels-like-a-program." Two holes:
- **`SaveStatus` has no error state.** It renders only Saving / Dirty / Saved (`topbar.tsx:849-957`). The `SaveChip` kit *defines* a rose "Couldn't save" state (`kit/savechip.tsx:25,86-88,105-106`) but the live top-bar indicator never uses it. On a failed save the operator just sees amber "Unsaved draft" indefinitely — indistinguishable from a normal pending state.
- **Errors are a transient toast that auto-dismisses in 5s** (`edit-context.tsx:2610-2614`). For a `VERSION_CONFLICT` (concurrent edit) the suggestion is plain text "State has been refreshed. Re-apply your change." (`edit-shell.tsx:1469-1470`) with **no Reload / Keep-mine / See-diff button** — and `refreshComposition` silently **wipes the undo/redo stack** on reload (`edit-context.tsx:3004-3005`), so the operator can't even undo their way back to the lost edit. A conflict the user cannot fix by waiting is shown for 5s then vanishes. That's the exact "feels fragile" moment.
**Root cause:** `topbar.tsx:816` `SaveStatus` lacks an error branch; `edit-context.tsx:2610` blanket 5s auto-dismiss applies even to non-recoverable codes; no recovery-action affordance in the toast (`edit-shell.tsx:1377-1430`).

### 4. [MEDIUM] Canvas selection never takes keyboard focus or announces — no focus ring, no Tab traversal, no SR
`selection-layer.tsx` has **zero** `.focus()`, `tabIndex`, `aria-selected`, `aria-activedescendant`, `aria-live`, or `role=status` (grepped — empty). Selecting a block is purely a mouse/visual gesture; `setSelectedBuilderNodeId` has no focus side-effect (`edit-context.tsx:1895-1905`). Consequences: (a) no visible **focus ring** distinct from the hover/selection ring, so keyboard-first operators lose their place; (b) **Tab does not walk the block tree** — you can't keyboard-traverse the canvas the way you can in Figma; (c) screen readers get **no announcement** ("Heading selected, level 2"). Global shortcuts still fire because edit-shell listens on `window`, which masks the gap functionally — but it's why the editor "feels mouse-only" and fails an a11y bar a premium tool clears.
**Root cause:** selection is state-only; no focus management layer over the canvas DOM in `selection-layer.tsx`; no SR live-region.

### 5. [MEDIUM] The color-picking SURFACE still drops to the OS popup; no in-app gradient picking in the swatch popover
The custom `ColorPickerPopover` wrapper is premium, BUT the actual hue/saturation surface is a native `<input type="color">` stretched transparent over the tile (`kit/color-picker.tsx:441-457`) — clicking the big swatch opens the **OS color dialog** (its own comment at 11-15 concedes this). So mid-pick the operator leaves the branded surface for OS chrome. Separately, **13 native `type="color"` inputs** remain in the site-header sub-inspector via `ColorRow` (`inspectors/site-header/shared/ColorRow.tsx:441` family) with no recent/eyedropper/token affordances at all — an inconsistent two-tier color UX. Gradient editing lives in a *different* component (`css-value-builders.tsx:198 GradientBuilder`), so there's no unified "color OR gradient" pick from one swatch the way Framer does.
**Root cause:** `kit/color-picker.tsx:441` native surface; `ColorRow` bypasses the custom picker entirely; gradient + solid pickers are separate primitives.

### 6. [MEDIUM] No custom-cursor language during direct manipulation beyond CSS `cursor`
Handles set `cursor: grab/grabbing/move` and the move readout shows `move x,y` (`canvas-move-handle.tsx:448,486`), which is good. But there's no **resize-direction cursor feedback tied to the specific edge/corner** beyond default, no **measurement HUD on resize/spacing** equivalent to the move readout (the move handle shows live px; resize/spacing handles should too for parity), and no **modifier-hint coaching** ("Hold ⇧ for free / ⌥ to duplicate") surfaced during a drag. These are the small "the tool is talking to me" cues that separate 68 from 85.
**Root cause:** `canvas-resize-handles.tsx` / `canvas-spacing-handles.tsx` lack a live-value HUD + modifier hint; move handle has it, the trio is inconsistent.

### 7. [LOW] Multi-select additional rings don't rAF-track; transitions are inconsistent across overlays
The PRIMARY selection ring is rAF-smooth, but **additional** multi-select rings compute rects synchronously at render time and don't track scroll (`selection-layer.tsx:3577-3605`, with an explicit comment accepting the trade-off). During a multi-select bulk action with any scroll, the secondary rings visibly lag the primary. Minor, but on a busy page it reads as "the editor is dropping frames." Also a few overlays still carry an `80ms` position transition while others were deliberately set to `transition:none` to stop trailing (`selection-layer.tsx:3287-3291,3481`); the inconsistency is invisible most of the time but produces occasional micro-slides on hover-change.
**Root cause:** `selection-layer.tsx:3578` synchronous rect map for additional rings vs the rAF loop for the primary.

### 8. [LOW] Empty-state and loading polish is good but uneven
`EmptyCanvasStarter` is strong (design tiles + scratch path + coaching, `empty-canvas-starter.tsx:535-741`) and several drawers have skeletons. But `animate-pulse` appears in only **1** edit-chrome `.tsx` (grep), and the inspector's loading state is a bare "Loading section…" bar (`inspector-dock.tsx:1286-1297`) rather than a content-shaped skeleton — so when a section editor loads, the right rail flashes empty/placeholder instead of ghosting its real shape. Per-surface loading polish is the kind of thing that, once consistent, quietly lifts perceived quality.
**Root cause:** inconsistent skeleton coverage; `inspector-dock.tsx:1286` text-bar loading vs shaped skeleton.

---

## Sequencing note
These touch **mostly disjoint files**, so most can parallelize:
- **#2 (insert/delete motion)** and **#1 (section_embed lag)** both center on the RENDER path (`render.tsx`, `section-embed-renderer.tsx`, `edit-context.tsx refreshComposition`) — keep them on ONE agent / one wave to avoid colliding in the shared render core.
- **#3 (save error state + conflict recovery)** is `topbar.tsx` + `edit-shell.tsx` toast + `edit-context.tsx` dismiss logic — independent, can go parallel.
- **#4 (focus/a11y)** and **#7 (multi-ring rAF)** are both inside `selection-layer.tsx` — same file, so **sequence them** (one agent, two passes) to avoid merge churn in the 6,396-line file.
- **#5 (color surface)** is `kit/color-picker.tsx` + `ColorRow` — independent.
- **#6 (resize/spacing HUD)** is `canvas-resize-handles.tsx` + `canvas-spacing-handles.tsx` — independent.

**Recommended Wave 1 (highest felt-quality, lowest risk):** #2 insert/delete motion + #3 save-error/conflict recovery. Both are pure additive polish on stable surfaces and are the two that most directly move "feels like a program." Profile #1 before committing to the optimistic-overlay rewrite (it's the only architectural one).
