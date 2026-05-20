// ════════════════════════════════════════════════════════════════════
// Phase 1e — pages.tsx is now a thin re-export barrel. Every page /
// shell component body lives in ./page-modules/* (byte-for-byte moves; only
// whitelisted export-prefix + import-path-depth transforms). All
// historically-public symbols are re-exported below so external
// importers (admin-shell-client) stay byte-unbroken.
// ════════════════════════════════════════════════════════════════════

export { ControlBar } from "./page-modules/ControlBar";
export { WorkspaceTopbar } from "./page-modules/WorkspaceTopbar";
export { TulalaIdentityBar } from "./page-modules/IdentityBar-1";
export { HybridShell, WorkspaceShell } from "./page-modules/WorkspaceShell";
export { SurfaceRouter } from "./page-modules/SurfaceRouter";
export { MobileBottomNav } from "./page-modules/MobileBottomNav";
