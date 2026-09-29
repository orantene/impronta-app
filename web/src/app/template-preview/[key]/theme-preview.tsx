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
import { isThemePreviewAllowed } from "./theme-preview-gate";
import { mergeLookIntoTokens } from "@/lib/talent-site/theme-catalog/look-layer";
import { validateDesign, validateLook } from "@/lib/talent-site/theme-catalog/validate";
import { resolveEffectiveSiteTokens } from "@/lib/talent-site/site-theme-tokens";
import { loadPlatformDefaultTheme } from "@/lib/platform/default-theme";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { buildDesignTrees } from "@/lib/talent-site/server/theme-apply-core";
import { splitShell } from "@/lib/talent-site/server/render-max-site-shell";
import { loadPublishedCatalogRow } from "@/lib/talent-site/server/theme-catalog-row";
import { loadMaisonCatalogRow } from "@/lib/talent-site/server/maison-catalog-row";
import { isMaisonCatalogSlug } from "@/lib/talent-site/theme-catalog/maison/catalog-visibility";
import { resolvePreviewHydration } from "@/lib/talent-site/server/preview-data";
import type { TalentSiteSnapshot } from "@/lib/talent-site/types";
import { ThemeTokenPreviewFrame } from "./theme-preview-frame-client";
import { GoogleFontsLink } from "@/app/google-fonts-link";
import {
  designTypographyTokens,
  galleryDefaultLookTokens,
  getGalleryDesign,
  galleryPaletteLookTokens,
} from "@/lib/talent-site/theme-catalog/gallery-meta";
import { DesignSkinStyle } from "@/lib/talent-site/theme-catalog/collection/design-skin-style";
import { localiseSeededDesignLabels } from "@/lib/talent-site/design-label-locale";
import { loadTalentPlanKey, loadTalentSiteCtaMode } from "@/lib/talent-site/server/load-max-site";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { resolveDemoPreviewSource } from "./demo-preview-source";
import { resolveDemoPreviewHydration } from "./demo-preview-hydration";

/** Maison renders in its own default Look when the gallery picks none. */
const MAISON_DEFAULT_LOOK = "maison-pink";
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export async function ThemeCatalogPreview({
  designSlug,
  lookSlug,
  talentProfileId,
  locale = "en",
  demo = null,
}: {
  /** P4: `<designSlug>:<demoKey>`; only gallery-meta demo sources resolve. */
  demo?: string | null;
  designSlug: string;
  lookSlug?: string | null;
  talentProfileId?: string | null;
  locale?: "en" | "es";
}) {
  // Dark launch: the flag that shows the picker card opens its preview
  // (Maison flag for Maison slugs, gallery flag otherwise). Flag off: this
  // family does not exist, exactly like an unknown slug. AUD-033.
  if (!isThemePreviewAllowed(designSlug, talentProfileId)) notFound();
  if (!SLUG_RE.test(designSlug)) notFound();

  const admin = createServiceRoleClient();
  if (!admin) notFound();

  // Maison slugs are not in the generic built-in list, so they resolve
  // through the Maison loader (DB row, else the Maison built-in). AUD-033.
  const loadRow = <K extends "design" | "look">(kind: K, slug: string) =>
    isMaisonCatalogSlug(slug)
      ? loadMaisonCatalogRow(admin, kind, slug)
      : loadPublishedCatalogRow(admin, kind, slug);
  const design = await loadRow("design", designSlug);
  // Same publish-time validation the apply action runs: a malformed row is a
  // 404 here, never a thrown render.
  if (!design || !validateDesign(design.payload).ok) notFound();

  // Look resolution, most specific first:
  //  1. `?look=` names one of THIS design's gallery palettes (its own colours
  //     and fonts, e.g. maison-v2 + "rose");
  //  2. `?look=` names a published Look row (Maison palettes);
  //  3. no / unknown look: the design's OWN default (Maison: maison-pink,
  //     collection designs: first gallery palette + fonts). The platform's
  //     generic default is never the whole answer for a catalog design.
  const cleanLook = lookSlug && SLUG_RE.test(lookSlug) ? lookSlug : null;
  const paletteTokens = cleanLook ? galleryPaletteLookTokens(design.slug, cleanLook) : null;
  const rowSlug =
    paletteTokens ? null : cleanLook ?? (design.slug === "maison" ? MAISON_DEFAULT_LOOK : null);
  const lookRow = rowSlug ? await loadRow("look", rowSlug) : null;
  const look = lookRow && validateLook(lookRow.payload).ok ? lookRow : null;
  const lookTokens: Record<string, string> | null =
    paletteTokens ??
    (look
      ? getGalleryDesign(design.slug) && design.slug !== "maison"
        ? { ...look.payload.tokens, ...designTypographyTokens(design.slug) }
        : look.payload.tokens
      : galleryDefaultLookTokens(design.slug));

  // P4: a gallery-meta demo talent's content (allow-listed), else the
  // owner-gated hydration exactly as before.
  const demoSource = resolveDemoPreviewSource(designSlug, demo);
  const hydration =
    (demoSource ? await resolveDemoPreviewHydration(demoSource) : null) ??
    (await resolvePreviewHydration(talentProfileId));
  const built = buildDesignTrees(design.payload, hydration.tokens);
  if (!built.ok) notFound();

  const platformDefault = await loadPlatformDefaultTheme("talent");
  // Same layering as the live render: the Look lands in the (empty) site
  // draft layer, then platform < site. A key the Look omits keeps the
  // platform default, exactly as on the published site.
  const effectiveTokens = lookTokens
    ? resolveEffectiveSiteTokens(
        {},
        mergeLookIntoTokens({}, lookTokens),
        platformDefault.tokens,
      )
    : platformDefault.tokens;

  // Seeded labels follow the locale and (for the owner) the booking mode,
  // exactly as the live site renders them.
  const ctaMode =
    hydration.isReal && talentProfileId
      ? await loadTalentSiteCtaMode(talentProfileId, await loadTalentPlanKey(talentProfileId))
      : null;
  const localise = (tree: BuilderNode[]) => localiseSeededDesignLabels(tree, locale, ctaMode);

  const [shellHeader, shellFooter] = splitShell(built.shellTree);
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
    // Header, page, footer: the same order the live site renders. Spreading
    // the whole shell first put the footer under the header in every preview.
    builderTree: localise([...shellHeader, ...built.homeTree, ...shellFooter]),
  };

  return (
    <ThemeTokenPreviewFrame initialTokens={effectiveTokens} locale={locale} designSlug={design.slug}>
      <GoogleFontsLink tokens={effectiveTokens} />
      <DesignSkinStyle slug={design.slug} />
      <TalentSiteRenderer snapshot={snapshot} locale={locale} />
    </ThemeTokenPreviewFrame>
  );
}
