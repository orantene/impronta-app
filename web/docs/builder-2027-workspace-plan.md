# Builder 2027 — Floating Workspace + Fluid Responsive — Deep Execution Plan

Status: **ACTIVE** · Branch `feat/builder-2027-fullpage` · Created 2026-06-03

The mandate: make the Tulala/Impronta page builder feel like a **real 2027 design
app** — Figma-smooth direct manipulation, a Photoshop-style movable/dockable
floating control workspace, and fluid responsive editing that locks per
breakpoint. Synthesised from the user's session feedback + a 3-agent code audit.

---

## Audit synthesis (what the code actually does today)

**A. Direct-manipulation smoothness — `selection-layer.tsx`**
The selection ring, the floating chip/toolbar, and every move/resize/spacing/gap
handle overlay are positioned through **React state** (`selectedRect`,
`hoverRect`) updated on rAF. So the whole ~6,000-line `SelectionLayer`
re-renders on *every* scroll/drag frame and the overlay trails the element by
1–2 frames. Element previews (inline `style.width/translate/...`) update
instantly, but the chrome lags. **Fix:** position overlays **imperatively via
refs in a standalone rAF loop** — zero React re-render during drag/scroll.

**B. Chrome / workspace — `floating-panel.tsx`, `navigator-panel.tsx`,
`inspector-dock.tsx`, `kit/drawer.tsx`**
- Floating system works (`useFloatingDrag` + `FloatingDragHandle`); navigator +
  inspector float; collapsed mini-rail exists. Drag offset is session-only.
- **Z-index is scattered** (60–200, ad-hoc): inspector @85 can be covered by the
  multi-select toolbar @100. Controls are NOT reliably on top.
- Inspector tabs (Content/Layout/Style/Data) are a **horizontal text pill bar**.
- **No presence/collab** — only async comments (Supabase). No active-editor
  avatars, no live cursors.
- Persistence: navigator width → localStorage; inspector + floating offsets are
  not persisted. No saved "workspace".

**C. Responsive / move — `edit-context.tsx`, `canvas-move-handle.tsx`,
`render.tsx`, `canvas-viewport.tsx`** *(responsive audit folding in)*
- `device` state (desktop/tablet/mobile) drives the canvas width; per-breakpoint
  style lives in `style.responsive.{tablet,mobile}`.
- The move handle writes a CSS `style.translate` offset. The off-screen-on-mobile
  bug = that offset isn't **clamped** and isn't reliably **per-breakpoint**, so a
  tablet nudge strands the element (and its grab handles) off the mobile canvas.

---

## The waves (sequenced for file-overlap; ⚡ = parallel-safe)

Core files touched by many features — **`selection-layer.tsx`**,
**`edit-context.tsx`**, **`floating-panel.tsx`** — force the shared-file waves to
run **serially** (parallel commits corrupt the index). New-file work is ⚡.

### WAVE 0 — Recover + protect (URGENT, unblocks the user) · sonnet
The user has an image stranded off-screen on mobile right now.
- **0A** Clamp the move handle so an element can never be dragged past the canvas
  edge (always keep a grabbable strip — same idea as the floating-panel clamp).
- **0B** `resetNodeToCenterOfParent(nodeId)` action + recover the stuck Anto
  image. Feeds the ⊕ "reset to centre" button in Wave 2A.
- **0C** Make the move/translate write to the **active device's** responsive
  bucket, not the base — a tablet nudge stops leaking into mobile.
Files: `canvas-move-handle.tsx`, `edit-context.tsx`. Gate: tsc/lint + live-verify
recovery on mobile.

### WAVE 1 — Figma-smooth direct manipulation (FOUNDATION) · opus
- **1A** Imperative overlay positioning: refs on the selection ring/chip + each
  handle overlay, updated in one standalone rAF loop writing
  `style.top/left/width/height` directly — no React re-render on scroll/drag.
- **1B** Keep React state only for *whether* to render (mount/unmount), not for
  position. Remove the redundant ResizeObserver/Mutation rAF churn.
Files: `selection-layer.tsx`, `canvas-{move,resize,spacing,gap}-handle*.tsx`.
Gate: tsc/lint + live-verify (scroll + drag track frame-for-frame).

### WAVE 2 — Floating control workspace (mostly ⚡, new files)
- **2A ⚡** Middle float control — NEW `selected-element-float-toolbar.tsx`: thin
  per-element bar on select → reset-to-centre (⊕ target), hide (eye), layer ↑/↓,
  edit (pencil). Mount above the element, z in the new "controls" band.
- **2B ⚡** Google-style collapsed **icon rail** — NEW `chrome-icon-rail.tsx`:
  tall white vertical rail, clean icon column, **collaborator avatars pinned at
  the bottom**; navigator + inspector both collapse to it. Fix the top
  "bleeding" (handle inset + clean corner clip).
- **2C ⚡** Inspector **vertical icon tabs** — Content/Layout/Style/Data become a
  vertical icon column; click → expand to that tab; collapsed = the icon bar.
- **2D** Z-index **bands** — consolidate the scattered z-indexes into
  canvas < selection-chrome < **floating-controls (always on top)** < modals, so
  controls are never covered. Touches many files → run after 2A–2C land.
Gate each: tsc/lint + live-verify.

### WAVE 3 — Dockable workspace + fluid responsive (sequential core) · opus
- **3A** Magnet-dock: panels snap-align when dragged within ~16px of each other
  / an edge; docked panels move together. NEW `workspace-layout.ts`.
- **3B** **Pin/Save workspace** + **Reset-to-default** — persist panel
  offsets/dock graph to localStorage (`impronta.editChrome.workspace.v1`);
  reset button restores home. Photoshop-style custom environment.
- **3C** **Fluid canvas resize with breakpoint locks** — a drag handle on the
  canvas edge scrubs width; crossing the tablet/mobile thresholds **locks** the
  active breakpoint and syncs the Desktop/Tablet/Mobile buttons; edits scope to
  the locked breakpoint (writes to that responsive bucket). Builds on Wave 0C.
Files: `floating-panel.tsx`, `edit-context.tsx`, `canvas-viewport.tsx`,
`navigator-panel.tsx`, `inspector-dock.tsx`.

### WAVE 4 — Real-time presence (collab) · sonnet
- **4A** Supabase **presence channel** (`cms-page-editors-${pageId}`) in
  EditProvider; `activeEditors` state; heartbeat.
- **4B** Wire real avatars into the Wave-2B rail foot; click → "editing section X".
Files: NEW `presence-provider.ts`, `edit-context.tsx`, `chrome-icon-rail.tsx`.

### WAVE 5 — 2027 differentiators (stretch, audit-discovered)
Multiplayer cursors + live selection · component variants + swap · design-token
panel · Figma-style layout-constraint pins. Each is its own mini-project; pick by
value after Waves 0–4 ship.

---

## Execution model

- **Parallelism:** Wave 2A/2B/2C are new files → run **concurrently** (isolated
  worktrees), integrate serially. Waves 0, 1, 3 share `selection-layer.tsx` /
  `edit-context.tsx` → **serial**.
- **Gate (every wave):** `npx tsc --noEmit` 0 errors · `lint` vs the 33-baseline
  (prune stale suppressions) · **live-verify in the builder** (the real test).
- **Commits:** one squash-ish commit per sub-wave on `feat/builder-2027-fullpage`,
  pushed. No deploy to prod without an explicit go (pre-launch).
- **Order rationale:** 0 first (unblocks the user's stuck element) → 1 (makes
  everything *feel* right) → 2 (the visible workspace) → 3 (power-user docking +
  the responsive system) → 4 (collab) → 5 (stretch).
