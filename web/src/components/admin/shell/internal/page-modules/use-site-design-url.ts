"use client";

import { useMemo } from "react";

import {
  buildEditorPanelUrl,
  resolveWebsiteEditorBaseUrl,
  resolveWebsiteLiveOrigin,
} from "@/lib/admin/website-editor-links";
import { useAdminShell } from "../state";

/**
 * Deep link to the site-wide DESIGN (theme) panel: colors, fonts, spacing,
 * header/footer variants.
 *
 * That panel lives in a drawer INSIDE the storefront visual editor, so until
 * this existed the only way in was "open the editor and go hunting" — which
 * made any instruction to "review the site design" un-followable. One hook so
 * the sidebar, the Website page and the Card Design drift warning all point at
 * the same destination.
 *
 * Returns `null` when no live origin can be resolved (workspace with no usable
 * domain yet); callers hide the affordance rather than open a dead tab.
 */
export function useSiteDesignUrl(): string | null {
  const { tenantSlug, effectiveWebsiteState } = useAdminShell();
  const primaryDomain = effectiveWebsiteState.domain.primaryDomain;
  return useMemo(() => {
    const windowOrigin = typeof window === "undefined" ? "" : window.location.origin;
    const liveOrigin = resolveWebsiteLiveOrigin(primaryDomain, windowOrigin);
    return buildEditorPanelUrl({
      editorBaseUrl: resolveWebsiteEditorBaseUrl({ liveOrigin, tenantSlug, windowOrigin }),
      panel: "theme",
    });
  }, [primaryDomain, tenantSlug]);
}
