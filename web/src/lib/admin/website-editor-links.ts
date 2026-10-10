/**
 * Shared resolvers for "open the storefront visual editor" links.
 *
 * The editor is the STOREFRONT rendered with `?edit=1`, so its origin is the
 * tenant's live domain (or, on localhost, `<origin>/w/<slug>` path-hosting).
 * Extracted from `WebsitePage-1.tsx` so the workspace sidebar can offer the
 * same destinations the Website page does — previously the theme/design panel
 * was reachable ONLY by entering the editor and finding a drawer inside it,
 * which made "review the site design" un-followable advice.
 *
 * `panel` values are the ones `edit-shell.tsx` dispatches on first paint
 * (`theme`, `assets`, `revisions`, `pageSettings`, `sections`, …).
 */

import { DEFAULT_MARKETING_ORIGIN } from "@/lib/brand/marketing-origin";
import { WORKSPACE_PATH_SEGMENT } from "@/lib/saas/tenant-paths";

export type EditorPanel =
  | "theme"
  | "assets"
  | "revisions"
  | "pageSettings"
  | "sections"
  | "publish"
  | "schedule";

/**
 * True when `primaryDomain` is a real branded host (subdomain or custom), not
 * the path-hosted address `tulala.digital/w/<slug>` that
 * `mergeWebsiteStateFromBridge` stores in `WebsiteDomain.primaryDomain`.
 *
 * Callers used to pass `Boolean(primaryDomain?.trim())`, which is true for the
 * path host string and skipped the `/w/<slug>` marketing base (TUL-372 / TUL-519).
 */
export function hasBrandedWebsitePrimaryDomain(
  primaryDomain: string | null | undefined,
): boolean {
  const host = primaryDomain?.trim() ?? "";
  if (!host) return false;
  // Path-hosted live address: `tulala.digital/w/<slug>` (may include a scheme).
  if (host.includes(`/${WORKSPACE_PATH_SEGMENT}/`)) return false;
  if (host.includes("/")) return false;
  return true;
}

/** Live storefront origin for a tenant, falling back to the current window. */
export function resolveWebsiteLiveOrigin(
  primaryDomain: string | undefined,
  windowOriginFallback: string,
): string {
  const host = primaryDomain?.trim() ?? "";
  if (!host) return windowOriginFallback;
  // Already an absolute URL (unusual; keep as-is).
  if (/^https?:\/\//i.test(host)) return host.replace(/\/$/, "");
  const proto =
    host.endsWith(".lvh.me") ||
    host.startsWith("localhost") ||
    host.startsWith("127.")
      ? "http"
      : "https";
  return `${proto}://${host}`;
}

function isLocalWebsiteOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function pathHostedEditorBase(origin: string, tenantSlug: string): string {
  return `${origin.replace(/\/$/, "")}/${WORKSPACE_PATH_SEGMENT}/${tenantSlug}`;
}

/**
 * Base URL the editor opens from. On localhost the storefront is path-hosted
 * under `/w/<slug>`; on a real deployment without a branded host it is the
 * marketing origin `/w/<slug>`; with a branded host it is that host alone.
 */
export function resolveWebsiteEditorBaseUrl({
  liveOrigin,
  tenantSlug,
  windowOrigin,
  hasPrimaryDomain,
}: {
  liveOrigin: string;
  tenantSlug: string | undefined;
  windowOrigin: string;
  /**
   * Whether the tenant has a branded primary domain. A workspace WITHOUT one
   * has no host of its own, so its site is path-hosted at
   * `<marketing origin>/w/<slug>`; the editor link used to fall back to the
   * bare app host (`<app host>/<page>?edit=1`), which is "Page not found"
   * (TUL-372). The path host lives on the MARKETING origin. Omit to keep the
   * old behaviour unless `liveOrigin` is the bare app/admin window.
   */
  hasPrimaryDomain?: boolean;
}): string {
  if (windowOrigin && tenantSlug && isLocalWebsiteOrigin(windowOrigin)) {
    // Canonical path shape (same as production `/w/<slug>`), never the legacy
    // flat `/<slug>` that 404s on the app host (TUL-372 / TUL-519 W5-4).
    return pathHostedEditorBase(windowOrigin, tenantSlug);
  }
  if (hasPrimaryDomain === false && tenantSlug) {
    // `/w/<slug>` resolves only on the marketing / hub host (and app on localhost,
    // handled above): proxy-locale-context.ts canResolvePathBasedTenant. The
    // admin itself links `tulala.digital/w/<slug>` for such workspaces.
    return pathHostedEditorBase(DEFAULT_MARKETING_ORIGIN, tenantSlug);
  }
  // liveOrigin may already be the path-hosted URL when primaryDomain was
  // `tulala.digital/w/<slug>` from the website bridge.
  if (tenantSlug && liveOrigin.includes(`/${WORKSPACE_PATH_SEGMENT}/`)) {
    return liveOrigin.replace(/\/$/, "");
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
  return `${base.replace(/\/$/, "")}/?edit=1&panel=${panel}`;
}

/**
 * Canonical slug of the per-tenant `site_shell` row. `edit-path.ts` resolves
 * BOTH `/__site_shell__` and `/p/__site_shell__` to ownership kind
 * `site_shell`. The `/p/` catch-all is the route that serves a body; in-editor
 * jumps still use it (`shell-edit-confirm.tsx`). Admin entry points do not —
 * they open the live site root at `/w/<slug>?edit=1` (see
 * `buildSiteShellEditorUrl`).
 */
export const SITE_SHELL_EDITOR_SLUG = "__site_shell__";

/**
 * Admin deep link into the visual editor for the tenant's live site (header,
 * footer, and pages share this entry).
 *
 * WHY THIS EXISTS (Lane 2 — reachability / TUL-519 W5-4):
 * the shell editor surface had NO entry point at all. Earlier this helper
 * deep-linked `/p/__site_shell__`, which 404s when `ENABLE_SITE_SHELL_EDIT` is
 * off (the default) and was reported as Admin Páginas > Editar opening a
 * `/p/…` URL instead of the path-hosted `/w/<slug>?edit=1` editor. Admin
 * affordances now open the LIVE site root; the flag-gated shell surface stays
 * reachable from inside the editor via `shell-edit-confirm.tsx`.
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
  return buildEditorPanelUrl({ editorBaseUrl, panel: "sections" });
}
