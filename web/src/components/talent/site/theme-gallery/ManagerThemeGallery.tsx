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
 * One rule: a design change goes to DRAFT first ("Change design in draft",
 * primary). "Change and publish now" (secondary) applies, then calls the same
 * publishMaxSiteAction as Maison. Otherwise the site's own
 * "Publish site" button makes it live, and publishes the theme tokens with
 * the pages (`publishMaxSiteAction` -> `publishSiteThemeForTalent`).
 */
import { useEffect, useState } from "react";

import { applySiteDesignAction, applySiteLookAction } from "@/lib/talent-site/server/theme-actions";
import { publishMaxSiteAction } from "@/lib/talent-site/server/site-management-actions";
import type { ThemeActionErrorCode } from "@/lib/talent-site/server/theme-action-types";
import {
  loadThemeGalleryBootstrapAction,
  type ThemeGalleryBootstrap,
} from "./gallery-bootstrap-action";
import { ThemeGallery } from "./ThemeGallery";
import { themeGalleryCopy, type ThemeGalleryCopyKey, type ThemeGalleryLocale } from "./theme-gallery-i18n";
import type { ThemeGalleryApplyInput, ThemeGalleryApplyResult } from "./types";
import { ThemePickDraftDialog } from "./ThemePickDraftDialog";
import {
  buildLiveDesignChangeSummary,
  paletteDisplayName,
  type LiveDesignChangeSummary,
} from "../maison-setup/live-design-change";
import { runThemeApply } from "@/lib/talent-site/history/apply-busy";

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
  const [ask, setAsk] = useState<{
    summary: LiveDesignChangeSummary;
    resolve: (choice: "draft" | "publish" | "cancel") => void;
  } | null>(null);

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
    let publishNow = false;
    const designToApply =
      designSlug && designSlug !== current.currentDesignSlug ? designSlug : undefined;
    if (designToApply) {
      const summary = buildLiveDesignChangeSummary({
        locale,
        fromSlug: current.currentDesignSlug ?? null,
        toSlug: designToApply,
        paletteName: paletteDisplayName({
          locale,
          designSlug: designToApply,
          lookSlug: lookSlug ?? current.currentLookSlug ?? null,
          customPalette: null,
        }),
        counts: null,
      });
      const choice = await new Promise<"draft" | "publish" | "cancel">((resolve) =>
        setAsk({ summary, resolve }),
      );
      setAsk(null);
      if (choice === "cancel") return { ok: false, cancelled: true };
      publishNow = choice === "publish";
    }
    if (designToApply) {
      const res = await runThemeApply(() => applySiteDesignAction({ designSlug: designToApply }));
      if (!res.ok) return fail(res.code);
      setBootstrap({ ...current, currentDesignSlug: designToApply });
    }
    if (lookSlug) {
      const res = await runThemeApply(() => applySiteLookAction({ lookSlug }));
      if (!res.ok) return fail(res.code);
      setBootstrap((prev) => (prev?.enabled ? { ...prev, currentLookSlug: lookSlug } : prev));
    }
    if (publishNow) {
      // Same publish action the Maison dialog uses.
      const pub = await publishMaxSiteAction();
      await onApplied();
      if (!pub.ok) return { ok: false, error: themeGalleryCopy(locale, "publishNowError") };
      return { ok: true };
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
      {ask ? (
        <ThemePickDraftDialog
          locale={locale}
          summary={ask.summary}
          onConfirm={() => ask.resolve("draft")}
          onPublishNow={() => ask.resolve("publish")}
          onCancel={() => ask.resolve("cancel")}
        />
      ) : null}
    </>
  );
}
