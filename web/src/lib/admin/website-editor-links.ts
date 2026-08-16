/**
 * Shared resolvers for "open the storefront visual editor" links.
 *
 * The editor is the STOREFRONT rendered with `?edit=1`, so its origin is the
 * tenant's live domain (or, on localhost, `<origin>/<slug>` path-hosting).
 * Extracted from `WebsitePage-1.tsx` so the workspace sidebar can offer the
 * same destinations the Website page does — previously the theme/design panel
 * was reachable ONLY by entering the editor and finding a drawer inside it,
 * which made "review the site design" un-followable advice.
 *
 * `panel` values are the ones `edit-shell.tsx` dispatches on first paint
 * (`theme`, `assets`, `revisions`, `pageSettings`, `sections`, …).
 */

export type EditorPanel =
  | "theme"
  | "assets"
  | "revisions"
  | "pageSettings"
  | "sections"
  | "publish"
  | "schedule";

/** Live storefront origin for a tenant, falling back to the current window. */
export function resolveWebsiteLiveOrigin(
  primaryDomain: string | undefined,
  windowOriginFallback: string,
): string {
  const host = primaryDomain?.trim() ?? "";
  const proto =
    host.endsWith(".lvh.me") ||
    host.startsWith("localhost") ||
    host.startsWith("127.")
      ? "http"
      : "https";
  if (host.length > 0) return `${proto}://${host}`;
  return windowOriginFallback;
}

function isLocalWebsiteOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/**
 * Base URL the editor opens from. On localhost the storefront is path-hosted
 * under the tenant slug; on a real deployment it is the live origin itself.
 */
export function resolveWebsiteEditorBaseUrl({
  liveOrigin,
  tenantSlug,
  windowOrigin,
}: {
  liveOrigin: string;
  tenantSlug: string | undefined;
  windowOrigin: string;
}): string {
  if (windowOrigin && tenantSlug && isLocalWebsiteOrigin(windowOrigin)) {
    return `${windowOrigin}/${tenantSlug}`;
  }
  return liveOrigin;
}

/**
 * Full deep link into one editor panel. Returns `null` when no base URL can be
 * resolved, so callers can hide the affordance instead of opening a dead tab.
 */
export function buildEditorPanelUrl({
  editorBaseUrl,
  panel,
}: {
  editorBaseUrl: string | null | undefined;
  panel: EditorPanel;
}): string | null {
  const base = editorBaseUrl?.trim();
  if (!base) return null;
  return `${base}/?edit=1&panel=${panel}`;
}

/**
 * Canonical slug of the per-tenant `site_shell` row. `edit-path.ts` resolves
 * BOTH `/__site_shell__` and `/p/__site_shell__` to ownership kind
 * `site_shell`; we deep-link the `/p/` form because that catch-all route is the
 * one that actually serves a body.
 */
export const SITE_SHELL_EDITOR_SLUG = "__site_shell__";

/**
 * Deep link to the SITE SHELL surface — the global header + footer shared by
 * every page of the tenant's site.
 *
 * WHY THIS EXISTS (Lane 2 — reachability):
 * the shell editor surface had NO entry point at all. `edit-chrome-mount.tsx`
 * would mount the editor for a `site_shell` path once `ENABLE_SITE_SHELL_EDIT`
 * was on, but nothing linked there and the `/p/*` route excluded system-owned
 * rows — so flipping the flag mounted the editor chrome over a 404 body. This
 * is the workspace-side way in.
 *
 * Returns `null` when no base URL resolves, so callers hide the affordance
 * instead of opening a dead tab (same contract as `buildEditorPanelUrl`).
 *
 * NOTE: `?edit=1` does NOT by itself turn edit mode on — edit mode is a cookie
 * set by the Edit FAB. The query param only selects which panel the chrome
 * opens on first paint. This matches how every other editor deep link in this
 * module behaves.
 */
export function buildSiteShellEditorUrl({
  editorBaseUrl,
}: {
  editorBaseUrl: string | null | undefined;
}): string | null {
  const base = editorBaseUrl?.trim();
  if (!base) return null;
  return `${base}/p/${SITE_SHELL_EDITOR_SLUG}?edit=1&panel=sections`;
}
