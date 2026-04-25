# Phase 1 QA — Visual Screenshots

Screenshots are pending manual capture. Cannot be taken autonomously because
`web/src/middleware.ts` blocks all non-seeded hostnames (including raw *.vercel.app
preview URLs) with a 404 before route matching.

## To capture

1. `vercel alias set <phase-1-preview-url> impronta.tulala.digital` (or promote to prod)
2. Visit `https://impronta.tulala.digital/?edit=1` with a staff session
3. Capture before/after for:
   - Selection ring on Editorial Noir dark section
   - Dock slide-in / slide-out on section click / click-outside
   - Zero debug labels (InspectorDock header, PublishDrawer slots, CompositionLibrary tiles)
4. Save as `ring-before.png`, `ring-after.png`, `dock-slide.png`, `no-debug-labels.png`

## Code verification (automated — 2026-04-24)

All implementations verified via source + passing tsc + green Vercel build:

| Check | File | Evidence |
|---|---|---|
| Dual-tone ring | selection-layer.tsx:540-541 | `box-shadow: white inset 1px + ink outset 2px + halo 8px` |
| Dock auto-hide | inspector-dock.tsx:287-299 + drawer.tsx:103-105 | `translateX(100%)` on `open=false`, 200ms ease-out |
| Debug labels stripped | inspector-dock.tsx:61, publish-drawer.tsx:21,81 | `.replace()` on `(Classic starter)` + `(legacy)` |
| TS clean | — | `tsc --noEmit` zero errors |
| Vercel build | dpl_Ea5iTowzCq3pUhQdfWUiBmJFA2mC | state: READY |
