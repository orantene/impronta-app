# Builder Experience — Deep Audit & Execution Plan

**Status:** draft, 2026-04-25
**Owner:** editor team
**Reference:** `docs/mockups/builder-experience.html` (v3, 26 surfaces, 3655 lines)

---

## TL;DR

The live editor is **further along than it looks** but **less finished than the mockup promises**. The chrome and most drawers are substantially built (~7,300 LOC of drawer code + ~5,000 LOC of inspector code), the design-system primitives exist (`Stepper`, `Swatch`, `Segmented`, `Toggle`, `Field`), and the canonical mockup is in the repo. But four things are wrong:

1. **A handful of dead controls and runtime bugs** make the editor feel broken (page-switcher with no `onClick`, drawer stacking, empty Page Settings body, locale toggle that doesn't navigate).
2. **The four "universal" inspector tabs (Layout / Style / Responsive / Motion) are thin select-only surfaces** even though the kit to build them properly already exists.
3. **An unapplied stash (`wip-canvas-felt-quality-pre-mockup`)** contains substantial canvas/drawer work — including a 193-line `selection-layer.tsx` overhaul and an 84-line `resizable-drawer.tsx` upgrade — that never landed.
4. **No source of truth ties code to mockup.** The mockup defines 26 surfaces; the codebase has implementations of ~15 of them at varying fidelity, but nothing maps which is which, what's complete, and what's missing.

The plan: triage the bugs (A), recover and audit the stash + map mockup → code (C), then rebuild the four thin inspector panels against the mockup using the existing kit (B).

---

## Discovery — what changed the picture vs. earlier impression

### Surprise 1: the mockup exists
- Path: `docs/mockups/builder-experience.html` (3,655 lines)
- Defines 26 numbered surfaces from "Top bar — mission control" through "Keyboard shortcuts overlay"
- Earlier audit reported it missing because the drawer source comments reference `docs/mockups/builder-experience.html` as a relative path — the path is repo-root-relative, not `web/`-relative. The file is there.

### Surprise 2: the kit is already built
The `web/src/components/edit-chrome/kit/` directory has every primitive needed for visual editing:
- `stepper.tsx` — numeric ± / unit suffix input
- `swatch.tsx` — color swatch + hex input
- `segmented.tsx` — button-group preset picker
- `toggle.tsx` — on/off switches
- `field.tsx` — labeled inputs with helpers + char counters
- `card.tsx`, `drawer.tsx`, `kbd.tsx`, `savechip.tsx`, `section-type-icon.tsx`, `tokens.ts`, `shortcuts.ts`

Plus an inspector-specific kit at `inspectors/kit/`:
- `draggable-list.tsx` (161 LOC) — drag-to-reorder UI
- `talent-picker.tsx` (436 LOC) — bespoke content picker (matches mockup surface 23)
- `media-picker-button.tsx`, `cta-duo-editor.tsx`, `visual-chip-group.tsx`, `category-icon-glyph.tsx`
- `inspector-group.tsx`, `inspector-item-row.tsx`, `panel-save-chip.tsx`

The "1995 selects" critique is real for the four universal panels — but the kit exists to fix it without inventing anything. It's just not wired.

### Surprise 3: substantial unapplied work in stash
`stash@{0}: On phase-1: wip-canvas-felt-quality-pre-mockup` (23 files, 687 insertions / 1089 deletions) includes:

| File | Net change | Significance |
|---|---|---|
| `web/src/components/edit-chrome/selection-layer.tsx` | +193/-? | Canvas selection overhaul |
| `web/src/components/ui/resizable-drawer.tsx` | +84 | Drawer resize behavior |
| `web/src/app/(dashboard)/admin/taxonomy/page.tsx` | -333 | Page cleanup (rip-out) |
| `web/src/app/(dashboard)/admin/site-settings/design/page.tsx` | -190 | Same |
| `web/src/app/(dashboard)/admin/fields/page.tsx` | -285 | Same |
| `web/src/app/(dashboard)/admin/site-settings/page.tsx` | -124 | Same |
| `web/src/components/admin/admin-command-palette.tsx` | +35/-? | Command palette progression |
| `web/src/lib/analytics/product-events.ts` | +15 | New analytics events |
| `web/.env.example` | +11 | New env requirements |

The stash name `wip-canvas-felt-quality-pre-mockup` suggests this is mid-flight work paused to do the mockup. **It should be diff-reviewed before being applied** — admin page deletions could conflict with the post-stash audit work.

### Surprise 4: prototype routes exist
- `web/src/app/prototypes/drawer-preview/page.tsx` (38 KB, 4 admin drawers: Branding, Plan, Team, Domain)
- `web/src/app/prototypes/admin-shell/` — full prototype admin shell with `_drawers, _pages, _platform, _primitives, _state, _talent, _client, _workspace`
- These are at `/prototypes/*` URLs — accessible but not part of the production editor flow

### Surprise 5: working tree is dirty
8 admin-shell prototype files have uncommitted modifications. Nothing scary, but state to clean up before any landing pass.

---

## Surface-by-surface audit (mockup vs. live)

Mapping every numbered surface in `builder-experience.html` to its implementation.

Legend: ✅ live & matches mockup · 🟡 partial / select-heavy · ❌ missing · 🐛 implemented but buggy · 🧪 only in prototype route

| # | Surface | Status | Live code | Notes |
|---|---|---|---|---|
| 1 | Top bar — mission control | 🐛 | `topbar.tsx` | PagePicker has no `onClick`; LocaleSwitcher click doesn't navigate; gear icon opens drawer that renders empty body |
| 2 | Inspector — five-tab depth | ✅ | `inspector-dock.tsx` (631 LOC) | Tabs render correctly: Content/Layout/Style/Responsive/Motion |
| 3 | Style — every visual property | 🟡 | `inspectors/style-panel.tsx` (163 LOC) | Only 4 selects: Background, Top Divider, Mood, Overlay. No color picker, no divider gallery, no gradient editor |
| 4 | Responsive — per-breakpoint everything | 🟡 | `inspectors/responsive-panel.tsx` (220 LOC) | Re-uses 6 Layout selects per breakpoint. No visibility toggles, no media-query authoring, no side-by-side preview |
| 5 | Page settings — its own drawer | 🐛 | `page-settings-drawer.tsx` (891 LOC) | Substantial code but renders empty body when opened in live editor — needs root-cause fix |
| 6 | Revisions — the safety net | ✅ | `revisions-drawer.tsx` (526 LOC) | Working |
| 7 | Publish drawer — alive and unified | ✅ | `publish-drawer.tsx` (1100 LOC) | Largest drawer, fully built |
| 8 | Add section library | ✅ | composition-inserter | The `+` button on canvas works |
| 9 | Drag in progress | 🟡 | `draggable-list.tsx` exists in kit | Primitive built but only used inside specific content panels; no canvas-level drag |
| 10 | Design tokens (reference) | ✅ | `kit/tokens.ts` | Tokens defined in kit |
| 11 | Structure navigator | ✅ | `navigator-panel.tsx` (776 LOC) | Working — left rail tree |
| 12 | Theme — global design system | 🟡 | `theme-drawer.tsx` (960 LOC) | Has hex input + swatch + preset chips. Missing: HSL picker, eyedropper, recent colors, per-element typography overrides |
| 13 | Assets — workspace media library | ✅ | `assets-drawer.tsx` (1007 LOC) | Working |
| 14 | Motion — entry, scroll, hover | 🟡 | `inspectors/motion-panel.tsx` (169 LOC) | 4 selects + reduced-motion warning. No timeline, no curve editor, no preview |
| 15 | Comments — async client feedback | 🐛 | `comments-drawer.tsx` (994 LOC) | "Could not find" red error chip visible in editor; needs investigation |
| 16 | Compare revisions | ❓ | unknown | Need to check whether revisions-drawer covers compare or it's a separate surface |
| 17 | Inline text editing | ✅ | `selection-layer.tsx` | Click-to-edit text on canvas works (and stash@{0} touches this 193 lines) |
| 18 | Empty canvas — fresh tenant onboarding | ❓ | unknown | Need to check empty-state in editor entry point |
| 19 | Preview mode — visitor view | ✅ | eye icon in topbar | Working |
| 20 | Command palette | 🟡 | `admin-command-palette.tsx` (admin-only?) | Editor command palette unclear — may not exist; admin palette has work in stash@{0} |
| 21 | Schedule publish | ✅ | `schedule-drawer.tsx` (379 LOC) | Built |
| 22 | Team presence | ❌ | none found | Realtime presence indicators not implemented |
| 23 | Bespoke content panel — featured talent picker | ✅ | `inspectors/kit/talent-picker.tsx` (436 LOC) | Built and used by featured-talent-content |
| 24 | Pages picker — multi-page sites | 🐛 | PagePicker in `topbar.tsx` | Button exists, no `onClick`. Surface defined in mockup but not wired |
| 25 | Import from prototype | ❌ | none found | "Strategic differentiator" surface not implemented |
| 26 | Keyboard shortcuts overlay | 🟡 | `kit/shortcuts.ts` exists | Shortcuts defined; the `?`-to-open overlay surface unclear |

**Score:** 8 ✅ · 7 🟡 · 4 🐛 · 3 ❌ · 4 ❓ (need verification) — out of 26 surfaces

---

## The four root causes (what to actually fix, not just symptoms)

### Root cause 1: no drawer-exclusivity contract
Every drawer manages its own open/close boolean independently. Opening one doesn't close peers. Result: stacking, z-index races, focus traps fighting each other.

**Fix:** introduce `useEditorPanel` Zustand slice with `activeDrawer: DrawerId | null` and an `openDrawer(id)` action that closes peers. ~40 LOC. Refactor each drawer's open/close call site to use it. ~10 sites × 1 line each.

### Root cause 2: universal inspector panels were built before the kit was ready
Layout / Style / Responsive / Motion panels each render `<select>` because `Stepper` / `Swatch` / `Segmented` weren't in the kit when those panels shipped. They never got a second pass.

**Fix:** rewrite each panel to use kit primitives. The mockup defines exactly which control type each property gets. The kit already has every component needed. No new primitives required.

### Root cause 3: a major canvas/drawer pass is stashed, not landed
`wip-canvas-felt-quality-pre-mockup` contains the work that was supposed to make the canvas "feel right" before the mockup pass. Without it landing, the live editor is missing those refinements — and any new work on selection-layer or resizable-drawer will conflict.

**Fix:** review the stash diff, decide what still applies after the audit-batch work that landed since, cherry-pick the parts that survive, archive the rest.

### Root cause 4: no living source-of-truth between mockup and code
The mockup is in the repo but nobody maintains a map between mockup surface N and the file/component that implements it. So drift accumulates silently.

**Fix:** check this document in. Add a "Surface implementation status" comment header to each drawer/panel that cites the mockup surface number it implements. CI lint that fails on missing reference (optional).

---

## Execution plan — phase A → C → B

### Phase A — Fix the dead/buggy interactions (1 day, 1 batch)

Goal: the editor should never present a non-functional control to the user.

**Tasks:**
1. **Wire PagePicker** (`topbar.tsx` ~L180-227). Add dropdown using kit primitives; populate from `loadPagesForTenant`; navigate via `router.push` to `?page=<slug>&edit=1`.
2. **Diagnose LocaleSwitcher click** (same file, ~L370-510). Click handler exists but has no effect in `?edit=1` context. Likely `e.preventDefault()` upstream or edit-mode router intercept. Fix until ES actually navigates.
3. **Fix Page Settings empty body** (`page-settings-drawer.tsx`). Trace data-loading guard that's returning early. Likely a missing `pageId` prop or a hook that returns null while loading without skeleton.
4. **Drawer-exclusivity mutex** (Root cause 1). New `useEditorPanel` slice + refactor each drawer open call site.
5. **Investigate Comments error chip** (`comments-drawer.tsx` "Could not find"). Likely RPC failure — log it, then either fix or hide the surface gracefully.
6. **Bottom-left "Settings" button confusion** (the one that just expands the navigator instead of opening Page Settings). Rename to "Sections" or wire to actual page settings.

**Deliverable:** all toolbar controls do something. No drawer overlap. Page Settings shows content. Comments either works or is hidden.

**Acceptance:** Chrome MCP smoke test — click every top-bar button, every nav button; assert each opens the right surface and closes peers.

---

### Phase C — Mockup audit + stash recovery (1 day, parallel with Phase A)

Goal: reconcile what's in the repo (live + stashed + prototype) with what the mockup promises. Output is this document, kept up-to-date.

**Tasks:**
1. **Verify the 4 ❓ surfaces** in the audit table (Compare revisions, Empty canvas, Editor command palette, Keyboard shortcuts overlay). Either find them or mark as ❌.
2. **Stash diff review.** For each of the 23 files in `stash@{0}`:
   - Does the change still apply cleanly after audit-batch work?
   - Is the change still desirable, or has the post-stash work superseded it?
   - Decision: keep / drop / partial-cherry-pick.
3. **Land the keep set as one commit** with message `editor: recover wip-canvas-felt-quality drawer + selection refinements`.
4. **Drop the stash** once recovered.
5. **Add per-file mockup-reference headers** to drawers/panels. Format:
   ```ts
   /**
    * Implements builder-experience.html surface §3 (Style — every visual property).
    * Last reconciled: 2026-04-25.
    */
   ```
6. **Open prototype routes** (`/prototypes/drawer-preview`, `/prototypes/admin-shell`) and screenshot — decide whether they're (a) reference material to keep, (b) staged production code, or (c) dead weight to delete after pulling out useful patterns.

**Deliverable:** updated audit table; stash gone; drift map per file.

---

### Phase B — Rebuild the four thin inspector panels (3-4 batches)

Goal: Layout / Style / Responsive / Motion match the mockup using the existing kit. No more select-only surfaces.

**B.1 — Layout panel** (~1 batch)
- Replace `paddingTop` / `paddingBottom` selects with **per-side numeric box diagram** (Stepper for each of top/right/bottom/left)
- Add **margin** controls (same UI, distinct visual treatment)
- Add **alignment 3×3 icon picker** for sections that support flex/grid
- Add **gap** Stepper for grid-based sections
- Mockup reference: `builder-experience.html` §2 + §3 (layout sub-surface)

**B.2 — Style panel** (~1 batch)
- Replace **Background** select with color picker (use existing `Swatch`) + image upload + gradient editor (new — primitive needed)
- Replace **Top Divider** select with visual divider thumbnail gallery (new — `divider-gallery.tsx`)
- Add **per-section typography override** group: font-size / weight / line-height / letter-spacing as Steppers
- Replace **Mood** and **Overlay** selects with `Segmented` icon-pickers if mood is a finite set
- Mockup reference: §3

**B.3 — Responsive panel** (~1 batch)
- Side-by-side device preview within the panel (3 mini-canvases)
- Per-breakpoint **visibility toggle** (hide on mobile/tablet/desktop)
- Per-breakpoint **layout overrides** that visually inherit from the base (greyed when not overridden, highlighted when overridden)
- Mockup reference: §4

**B.4 — Motion panel** (~1 batch)
- **Timeline visualization** of entry → scroll → hover transitions
- **Easing curve picker** (preset library + custom bezier)
- **Live preview** button that plays the animation in the inspector
- Reduced-motion warning stays
- Mockup reference: §14

**Acceptance per batch:** screenshot live editor, diff against the corresponding mockup surface, each control type matches.

---

### Phase D — Missing surfaces (defer until A/C/B done)

Tracked but not in the immediate plan:

- **Surface 22** Team presence — needs realtime infrastructure (Supabase Realtime channels). Defer until multi-user editing is a real use case.
- **Surface 25** Import from prototype — strategic differentiator per mockup. Big scope. Defer.
- **Surface 12 enhancements** — HSL color picker, eyedropper, recent colors. Add to a "theme drawer polish" backlog item.
- **Surface 9 enhancements** — canvas-level drag-to-reorder (currently only via navigator). Add to backlog.

---

## Risks

| Risk | Mitigation |
|---|---|
| Stash recovery introduces conflicts with audit-batch work | Review each file's diff individually before landing; don't `git stash apply` blindly |
| Phase B introduces visual regressions | Each batch ships behind a per-tab fallback to the old panel for one release; remove fallback in next release |
| Mockup is v3; user may want v4 design changes mid-flight | Lock the mockup file at `de23172` ref; treat any user-driven design change as a separate v4 task that updates the mockup first |
| Working tree dirty (admin-shell prototypes) | Commit or discard those changes before starting Phase A so we have a clean baseline |
| Phase A reveals deeper bugs (e.g. router intercept on locale) that take longer than 1 day | Time-box A at 1 day; anything not done becomes its own ticket, doesn't block C |

---

## Decisions needed from user

1. **Land the stash as-is or do a per-file review?** Recommendation: per-file review (some of those admin-page deletions may collide with post-stash work).
2. **Are the prototype routes (`/prototypes/drawer-preview`, `/prototypes/admin-shell`) production work that should ship, or scratch space?** Recommendation: pull useful patterns into production code, then delete the prototype routes — they're confusing as a long-lived alternative reality.
3. **Is the mockup v3 the authority, or do you want a v4 review first?** Recommendation: lock v3, ship Phase B against it, then re-spec for v4 in a separate cycle.
4. **Phase A scope creep — fix Comments error or hide it?** Recommendation: hide if RPC fix is more than ~30 min; ship a "Comments coming soon" empty state.

---

## Definition of Done (overall)

- Every toolbar/drawer control in the live editor either works or is hidden
- All 26 mockup surfaces are either ✅ live, 🟡 with a tracked backlog item, or ❌ explicitly deferred with a doc reason
- Stash 0 is gone (recovered or dropped, decided)
- Working tree is clean
- Each drawer/panel file has a mockup-surface reference header
- This doc is updated to match reality
