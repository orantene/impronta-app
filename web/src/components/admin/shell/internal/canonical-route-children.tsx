"use client";

// Canonical-route children bridge.
//
// "Canonical routes" (financials, discover-performance, triage, work/[id],
// messages/[id], roster/applications, …) are real Next.js server pages that
// render their own content as the workspace layout's `{children}`. Historically
// the shell SUPPRESSED itself for those paths (ConditionalAdminShellRoot →
// null), so the page rendered with zero chrome — no sidebar, no top bar.
//
// This context lets the workspace shell HOST that route content inside its
// `<main>` slot instead: AdminShellClient publishes the route `children` here
// when the path is canonical, and WorkspaceShell's PageRouter renders them in
// place of a SPA page-module. Result: canonical routes get the exact same
// sidebar + top bar as every other dashboard tab.
//
// Value is `null` on non-canonical routes (the SPA renders its own page body).

import { createContext, useContext, type ReactNode } from "react";

const CanonicalRouteChildrenContext = createContext<ReactNode | null>(null);

export const CanonicalRouteChildrenProvider = CanonicalRouteChildrenContext.Provider;

/**
 * Route content to render inside the workspace `<main>`, or `null` when the
 * current path is not a canonical route (SPA renders its own page body).
 */
export function useCanonicalRouteChildren(): ReactNode | null {
  return useContext(CanonicalRouteChildrenContext);
}
