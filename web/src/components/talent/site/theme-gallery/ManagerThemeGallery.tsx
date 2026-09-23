"use client";

/**
 * ManagerThemeGallery — the theme gallery as mounted in `TalentMaxSiteManager`
 * (Phase 0.C). Kept out of the manager file (file-size ratchet).
 *
 * The flag is read server-side by `loadThemeGalleryBootstrapAction`; while it
 * loads, or when it answers `{ enabled: false }` (switch off, gate failure,
 * catalog failure), this renders `fallback`, the pre-existing starter gallery,
 * unchanged. So with TALENT_THEME_GALLERY_ENABLED unset the manager's DOM is
 * the same as before this pass.
 *
 * Apply writes the DRAFT only (design trees + draft tokens). The site's own
 * "Publish site" button makes it live, and publishes the theme tokens with
 * the pages (`publishMaxSiteAction` -> `publishSiteThemeForTalent`).
 */
import { useEffect, useState } from "react";

import { applySiteDesignAction, applySiteLookAction } from "@/lib/talent-site/server/theme-actions";
import type { ThemeActionErrorCode } from "@/lib/talent-site/server/theme-action-types";
import {
  loadThemeGalleryBootstrapAction,
  type ThemeGalleryBootstrap,
} from "./gallery-bootstrap-action";
import { ThemeGallery } from "./ThemeGallery";
import { themeGalleryCopy, type ThemeGalleryCopyKey, type ThemeGalleryLocale } from "./theme-gallery-i18n";
import type { ThemeGalleryApplyInput, ThemeGalleryApplyResult } from "./types";

/** Localized copy for an action error code (the action's `error` string is an
 * English developer fallback and is never shown). */
export function themeErrorCopyKey(code: ThemeActionErrorCode | string): ThemeGalleryCopyKey {
  switch (code) {
    case "tier_required":
      return "errorTierRequired";
    case "theme_not_found":
      return "errorNotFound";
    case "conflict":
      return "errorConflict";
    case "feature_disabled":
      return "errorDisabled";
    default:
      return "applyErrorGeneric";
  }
}

export function ManagerThemeGallery({
  locale,
  onApplied,
  fallback,
  wrap,
}: {
  locale: ThemeGalleryLocale;
  onApplied: () => Promise<void>;
  fallback: React.ReactNode;
  wrap: (gallery: React.ReactNode) => React.ReactNode;
}) {
  const [bootstrap, setBootstrap] = useState<ThemeGalleryBootstrap | null>(null);

  useEffect(() => {
    let alive = true;
    void loadThemeGalleryBootstrapAction()
      .then((res) => {
        if (alive) setBootstrap(res.ok ? res.data : { enabled: false });
      })
      .catch(() => {
        if (alive) setBootstrap({ enabled: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!bootstrap?.enabled) return <>{fallback}</>;
  const current = bootstrap;

  async function onApply({ designSlug, lookSlug }: ThemeGalleryApplyInput): Promise<ThemeGalleryApplyResult> {
    const fail = (code: string) => ({ ok: false, error: themeGalleryCopy(locale, themeErrorCopyKey(code)) });
    // Re-applying the Design the site already has would rebuild the home page
    // from the talent's profile and throw away their edits, so a Look-only
    // change never touches the Design (and never asks to replace content).
    const designToApply =
      designSlug && designSlug !== current.currentDesignSlug ? designSlug : undefined;
    if (
      designToApply &&
      typeof window !== "undefined" &&
      !window.confirm(themeGalleryCopy(locale, "confirmReplaceDesign"))
    ) {
      return { ok: false, cancelled: true };
    }
    if (designToApply) {
      const res = await applySiteDesignAction({ designSlug: designToApply });
      if (!res.ok) return fail(res.code);
      setBootstrap({ ...current, currentDesignSlug: designToApply });
    }
    if (lookSlug) {
      const res = await applySiteLookAction({ lookSlug });
      if (!res.ok) return fail(res.code);
      setBootstrap((prev) => (prev?.enabled ? { ...prev, currentLookSlug: lookSlug } : prev));
    }
    await onApplied();
    return { ok: true };
  }

  return (
    <>
      {wrap(
        <ThemeGallery
          designs={current.designs}
          looks={current.looks}
          currentDesignSlug={current.currentDesignSlug}
          currentLookSlug={current.currentLookSlug}
          mode="manager"
          talentProfileId={current.talentProfileId}
          locale={locale}
          onApply={onApply}
        />,
      )}
    </>
  );
}
