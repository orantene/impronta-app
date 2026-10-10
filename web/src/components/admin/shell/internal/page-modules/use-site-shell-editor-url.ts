"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildSiteShellEditorUrl,
  hasBrandedWebsitePrimaryDomain,
  resolveWebsiteEditorBaseUrl,
  resolveWebsiteLiveOrigin,
} from "@/lib/admin/website-editor-links";
import { isSiteShellSurfaceAvailableAction } from "@/lib/site-admin/site-shell-surface-availability";
import { useAdminShell } from "../state";

/**
 * Deep link to the live storefront editor for site chrome (header / footer).
 * Opens `/w/<slug>?edit=1` (or the branded host); the flag-gated
 * `/p/__site_shell__` surface is reached from inside the editor.
 *
 * Returns `null` until BOTH are known-good:
 *   - a usable editor base URL resolves (workspace has a domain), and
 *   - the server confirms shell editing is available for this caller
 *     (edit flag on + staff capability).
 *
 * The second check is a server round-trip on purpose: the flag is a server env
 * var that must not reach the client bundle, and the shell surface is OFF by
 * default. Rendering the entry point unconditionally would hand the operator a
 * button that opens a 404. Callers hide the affordance while this is null.
 */
export function useSiteShellEditorUrl(): string | null {
  const { tenantSlug, effectiveWebsiteState } = useAdminShell();
  const primaryDomain = effectiveWebsiteState.domain.primaryDomain;
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isSiteShellSurfaceAvailableAction()
      .then((ok) => {
        if (!cancelled) setAvailable(ok);
      })
      .catch(() => {
        // Never surface the entry on an inconclusive answer — a hidden button
        // is recoverable, a button that 404s is not.
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    if (!available) return null;
    const windowOrigin = typeof window === "undefined" ? "" : window.location.origin;
    const liveOrigin = resolveWebsiteLiveOrigin(primaryDomain, windowOrigin);
    return buildSiteShellEditorUrl({
      editorBaseUrl: resolveWebsiteEditorBaseUrl({
        liveOrigin,
        tenantSlug,
        windowOrigin,
        hasPrimaryDomain: hasBrandedWebsitePrimaryDomain(primaryDomain),
      }),
    });
  }, [available, primaryDomain, tenantSlug]);
}
