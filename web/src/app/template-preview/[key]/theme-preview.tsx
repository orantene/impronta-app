/**
 * ThemeCatalogPreview — the `kind=talent-theme` branch of the shared
 * template-preview route (deliverable 0.C-2), split out of `page.tsx` to
 * keep that file from growing (file-size ratchet).
 *
 * `key` is a PUBLISHED Design slug from `talent_theme_catalog`; `?look=`
 * is an optional published Look slug applied on top for the initial paint
 * (the gallery's LookRow then restyles further via postMessage, no reload).
 * Same owner-gated hydration as every other family
 * (`resolvePreviewHydration`): the signed-in owner's real data, or the public
 * demo persona. `notFound()` on an unknown / unpublished slug, exactly like
 * the max-site family does for an unknown key — no silent demo fallback for
 * a bad slug. Built-ins not yet synced into the table still render
 * (`loadPublishedCatalogRow` falls back to the in-code built-in).
 */
import { notFound } from "next/navigation";

import { TalentSiteRenderer } from "@/components/talent/site/TalentSiteRenderer";
import { isTalentThemeGalleryEnabled } from "@/lib/access/talent-theme-gallery";
import { mergeLookIntoTokens } from "@/lib/talent-site/theme-catalog/look-layer";
import { loadPlatformDefaultTheme } from "@/lib/platform/default-theme";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { buildDesignTrees } from "@/lib/talent-site/server/theme-apply-core";
import { loadPublishedCatalogRow } from "@/lib/talent-site/server/theme-catalog-row";
import { resolvePreviewHydration } from "@/lib/talent-site/server/preview-data";
import type { TalentSiteSnapshot } from "@/lib/talent-site/types";
import { ThemeTokenPreviewFrame } from "./theme-preview-frame-client";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export async function ThemeCatalogPreview({
  designSlug,
  lookSlug,
  talentProfileId,
  locale = "en",
}: {
  designSlug: string;
  lookSlug?: string | null;
  talentProfileId?: string | null;
  locale?: "en" | "es";
}) {
  // Dark launch: with TALENT_THEME_GALLERY_ENABLED off this family does not
  // exist (flags-off parity), exactly like an unknown slug.
  if (!isTalentThemeGalleryEnabled()) notFound();
  if (!SLUG_RE.test(designSlug)) notFound();

  const admin = createServiceRoleClient();
  if (!admin) notFound();

  const design = await loadPublishedCatalogRow(admin, "design", designSlug);
  if (!design) notFound();

  const look =
    lookSlug && SLUG_RE.test(lookSlug)
      ? await loadPublishedCatalogRow(admin, "look", lookSlug)
      : null;

  const hydration = await resolvePreviewHydration(talentProfileId);
  const built = buildDesignTrees(design.payload, hydration.tokens);
  if (!built.ok) notFound();

  const platformDefault = await loadPlatformDefaultTheme("talent");
  const effectiveTokens = look
    ? mergeLookIntoTokens(platformDefault.tokens, look.payload.tokens)
    : platformDefault.tokens;

  const snapshot: TalentSiteSnapshot = {
    version: 1,
    siteKind: "talent_personal",
    templateKey: design.slug,
    compositionMode: "freeform",
    publishedAt: null,
    pageVersion: 1,
    locale,
    fields: {
      title: hydration.tokens.displayName,
      metaDescription: hydration.tokens.tagline || null,
      introTagline: hydration.tokens.tagline || null,
    },
    templateSchemaVersion: 1,
    slots: [],
    builderTree: [...built.shellTree, ...built.homeTree],
  };

  return (
    <ThemeTokenPreviewFrame initialTokens={effectiveTokens}>
      <TalentSiteRenderer snapshot={snapshot} locale={locale} />
    </ThemeTokenPreviewFrame>
  );
}
