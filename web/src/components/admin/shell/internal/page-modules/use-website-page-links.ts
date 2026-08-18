"use client";

/**
 * use-website-page-links.ts — every URL the admin Website → Pages list opens.
 *
 * THE LOCALE HAZARD THIS MODULE EXISTS TO CLOSE
 * ─────────────────────────────────────────────
 * `cms_pages` is unique on `(tenant_id, locale, slug)`, so one page can exist
 * as an EN row and an ES row. The Website surface used to build every editor
 * URL at the SHELL's content locale, which is correct only by coincidence: open
 * the ES variant of `/contact` at `en` and the `/p/` underlay 404s, and the
 * editor reports "not found" on a page that plainly exists.
 *
 * Every path here is therefore built at THE ROW'S OWN locale, with the shell
 * locale as the fallback for rows the bridge did not enrich (mock mode, older
 * payloads). Extracted from WebsitePage-1.tsx so that file stays under its
 * `max-lines` budget, and so the rule has one home instead of three call sites.
 */

import { useCallback } from "react";

import type { Locale } from "@/i18n/config";
import { buildPublicPathname, isValidSlugPath, normalizeSlugPath } from "@/lib/cms/paths";

import type { WebsitePageRow } from "../state";

/** Which editor panel to land on. `pageSettings` is where SEO flags live. */
export type WebsiteEditorPanel = "sections" | "pageSettings";

export function useWebsitePageLinks({
  editorBaseUrl,
  liveOrigin,
  fallbackLocale,
  notify,
}: {
  editorBaseUrl: string;
  liveOrigin: string;
  /** The shell's content locale — used only for rows with no locale of their own. */
  fallbackLocale: string;
  /** Reports a catalog KEY to the operator (the caller owns t() + toast). */
  notify: (messageKey: string) => void;
}) {
  const pagePublicPath = useCallback(
    (page: WebsitePageRow): string | null => {
      const raw = page.slug.trim();
      const inner =
        raw === "" || raw === "/" ? "" : normalizeSlugPath(raw.replace(/^\/+/u, ""));
      if (inner === "") return "/";
      if (!isValidSlugPath(inner)) return null;
      return buildPublicPathname(
        (page.locale as Locale) ?? (fallbackLocale as Locale),
        inner,
      );
    },
    [fallbackLocale],
  );

  const openPageInEditor = useCallback(
    (page: WebsitePageRow, panel: WebsiteEditorPanel) => {
      if (!editorBaseUrl) {
        notify("dashboard.adminWebsite.toastLiveUrlUnavailableDomain");
        return;
      }
      const pathname = pagePublicPath(page);
      if (!pathname) {
        notify("dashboard.adminWebsite.toastUrlNoPublicPath");
        return;
      }
      window.open(
        `${editorBaseUrl}${pathname}?edit=1&panel=${panel}`,
        "_blank",
        "noopener,noreferrer",
      );
      notify("dashboard.adminWebsite.toastOpeningVisualEditor");
    },
    [editorBaseUrl, notify, pagePublicPath],
  );

  const openPageEditor = useCallback(
    (page: WebsitePageRow) => openPageInEditor(page, "sections"),
    [openPageInEditor],
  );

  const openPageSettings = useCallback(
    (page: WebsitePageRow) => openPageInEditor(page, "pageSettings"),
    [openPageInEditor],
  );

  /** Public URL for one variant, or null while no live origin is known. */
  const pageLiveUrl = useCallback(
    (page: WebsitePageRow): string | null => {
      if (!liveOrigin) return null;
      const pathname = pagePublicPath(page);
      return pathname ? `${liveOrigin}${pathname}` : null;
    },
    [liveOrigin, pagePublicPath],
  );

  return { openPageEditor, openPageSettings, pageLiveUrl };
}
