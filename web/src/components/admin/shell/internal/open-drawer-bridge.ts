"use client";

// ════════════════════════════════════════════════════════════════════
// open-drawer-bridge.ts: window CustomEvent bridge so components that
// render OUTSIDE AdminShellProvider (e.g. the top-bar notification bell,
// which self-loads its own data and has no useAdminShell() access) can
// still ask the shell to open a specific drawer.
//
// Mirrors the existing tulala:open-start-workspace-dialog pattern in
// page-modules/IdentityBar-1.tsx. Dispatcher lives here (no shell-state
// import needed); the listener lives in drawers.tsx DrawerRoot, which
// does have useAdminShell() access.
// ════════════════════════════════════════════════════════════════════

import type { DrawerId } from "./state";

export const OPEN_DRAWER_EVENT = "tulala:open-shell-drawer";

export type OpenDrawerEventDetail = {
  drawerId: DrawerId;
  payload?: Record<string, unknown>;
};

/** Ask the shell to open `drawerId`. Safe to call from anywhere on the client. */
export function fireOpenShellDrawer(drawerId: DrawerId, payload?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OpenDrawerEventDetail>(OPEN_DRAWER_EVENT, { detail: { drawerId, payload } }),
  );
}
