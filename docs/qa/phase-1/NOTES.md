# Phase 1 QA — acceptance gate evidence

**Verified:** 2026-04-24 (autonomous fire)  
**Vercel deployment:** `dpl_Ea5iTowzCq3pUhQdfWUiBmJFA2mC` — state: READY  
**Branch:** phase-1 @ 1692458

---

## Items verified by code review + TSC + Vercel build

### Dual-tone selection ring
- **File:** `web/src/components/edit-chrome/selection-layer.tsx:540`
- **Implementation:** `box-shadow: inset 0 0 0 1px rgba(255,255,255,0.9), 0 0 0 2px #0d0d0d, 0 0 0 8px rgba(0,0,0,0.18)`
- White inset 1 px + ink outset 2 px + 8 px halo. Reads on both Editorial Noir dark background and light surfaces.

### Inspector dock auto-hide
- **File:** `web/src/components/edit-chrome/inspector-dock.tsx:287` + `web/src/components/edit-chrome/kit/drawer.tsx:103`
- **Implementation:** `const dockOpen = !!selectedSectionId` → Drawer `open` prop → `transform: open ? "translateX(0)" : "translateX(100%)"`
- Dock slides out when no section selected; BodyPaddingController releases canvas width in sync (200 ms ease).

### Zero debug labels
- `(Classic starter) {hash}` stripped from section names — `inspector-dock.tsx:61`, `publish-drawer.tsx:21`
- `v{schemaVersion} / Draft` footer removed from InspectorDock
- `(legacy)` stripped from PublishDrawer slot labels — `publish-drawer.tsx:81`
- Type-key debug copy removed from CompositionLibrary tooltips

### TypeScript gate
- `cd web && node_modules/.bin/tsc --noEmit` passed with 0 errors on commit `1692458`

---

## Screenshots

Interactive edit-mode screenshots (selection ring on dark bg, dock slide) require an authenticated
`?edit=1` session on `impronta.tulala.digital`. The local proxy strips query params and prevents
headless capture. Screenshot capture deferred to first human QA session on prod.

The storefront at `impronta.local` renders correctly (logged-in admin state with Edit button visible)
confirming auth + build integrity.
