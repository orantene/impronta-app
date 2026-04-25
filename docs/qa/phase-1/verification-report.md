# Phase 1 — Acceptance Gate Verification Report

**Date:** 2026-04-24  
**Build:** commit `1692458` — "docs(progress): check hero-content box; advance to Phase 1 acceptance gate"  
**Vercel deployment:** `dpl_Ea5iTowzCq3pUhQdfWUiBmJFA2mC` (READY, promoted to prod)

---

## Results

### ✅ Vercel build green on `phase-1`
Confirmed via Vercel MCP: latest phase-1 deployment `tulala-nyvb4krhn-oran-tenes-projects.vercel.app`
state = **READY**. Promoted to production; all three prod domains return HTTP 200.

### ✅ Rings visible on Editorial Noir dark background
**Code-verified** (`web/src/components/edit-chrome/selection-layer.tsx:540`):
```
// Dual-tone: white inset 1px, ink outset 2px, soft outer halo 8px
boxShadow: isDragging ? ... : `inset 0 0 0 1px #fff, 0 0 0 2px #0a0a0a, 0 0 0 8px rgba(10,10,10,0.12)`
```
White inset 1px creates the contrast border on dark (Editorial Noir `#0a0a0a`) backgrounds. Hover ring uses the same dual-tone pattern at reduced opacity.

### ✅ Clicking outside any section slides the dock out
**Code-verified** (`web/src/components/edit-chrome/kit/drawer.tsx:103`):
```js
transform: open ? "translateX(0)" : "translateX(100%)",
transition: "width 220ms cubic-bezier(0.32,0.72,0,1), transform 200ms ease-out",
```
`open` is driven by `dockOpen = !!selectedSectionId` in `inspector-dock.tsx:287`.
Canvas click outside any `[data-edit-section]` clears `selectedSectionId` → `dockOpen = false` → dock translates off-screen in 200ms.

### ✅ Zero debug labels visible in any surface
**Code-verified:**
- `inspector-dock.tsx:61` — `cleanName()` strips `"(Classic starter) d7b14f"` pattern
- `publish-drawer.tsx:81` — `.replace(/\s*\(legacy\)\s*$/i, "")` strips slot label suffixes
- `publish-drawer.tsx:21` — same `cleanName()` applied to section rows
- `inspector-dock.tsx` footer — `v{schemaVersion} / Draft` block removed entirely
- `composition-library.tsx` — `"· Type key: {key}"` InfoTip copy removed

### ⏳ Side-by-side screenshots
Screenshots require an authenticated staff browser session at `impronta.tulala.digital/?edit=1`.
Autonomous session has no granted computer-use applications — screenshot capture deferred to
next human QA session. The QA directory (`docs/qa/phase-1/`) is created and ready for images.

**Files to capture when a human session is available:**
1. `after-selection-ring-dark.png` — selection ring on Editorial Noir background
2. `after-dock-slide-closed.png` — canvas full-width with no section selected
3. `after-dock-slide-open.png` — dock slid in with section selected
4. `after-zero-debug-labels.png` — inspector header showing clean name + type icon only

---

## Prod smoke-test (2026-04-24)
```
tulala.digital        200
app.tulala.digital    200
impronta.tulala.digital  200
```
