# Phase 1 QA — Screenshots

Code-level verification passed (2026-04-24):

- **Dual-tone ring**: `inset 0 0 0 1px rgba(255,255,255,0.70), 0 0 0 2px rgba(11,11,13,0.95), 0 0 0 8px rgba(11,11,13,0.10)` — reads on dark (Editorial Noir) and light backgrounds.
- **Dock auto-hide**: `open={!!selectedSectionId}` drives `translateX(100%)` via Drawer primitive; 200ms ease transition; BodyPaddingController reclaims canvas width.
- **No debug labels**: "(Classic starter) {hash}" stripped in inspector-dock; "(legacy)" stripped in publish-drawer; "Type key:" removed from library tooltips; `v{n} / Draft` footer removed.

Build promoted to prod at: `tulala-nyvb4krhn-oran-tenes-projects.vercel.app` → `tulala.digital`

Before/after visual screenshots should be captured by a human QA session at `impronta.tulala.digital?edit=1` with a staff login.
