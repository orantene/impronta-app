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
