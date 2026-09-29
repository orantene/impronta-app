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

import { GoogleFontsLink } from "@/app/google-fonts-link";
import { TalentSiteRenderer } from "@/components/talent/site/TalentSiteRenderer";
import { isThemePreviewAllowed } from "./theme-preview-gate";
import { mergeLookIntoTokens } from "@/lib/talent-site/theme-catalog/look-layer";
import {
  designTypographyTokens,
  galleryDefaultLookTokens,
  galleryPaletteLookTokens,
  getGalleryDesign,
} from "@/lib/talent-site/theme-catalog/gallery-meta";
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
import { TypeSystemStyle } from "@/lib/talent-site/theme-catalog/collection/design-type-system-style";
import { designTokenDefaults } from "@/lib/talent-site/theme-catalog/collection/design-token-defaults";
import { resolveDemoPreviewSource } from "./demo-preview-source";
import { loadDemoSavedTrees, resolveDemoPreviewHydration } from "./demo-preview-hydration";
import {
  prepareMyContentPreview,
  resolveMyContentPreviewLocale,
} from "@/lib/talent-site/server/preview-my-content.server";
import {
  COLLECTION_DEFAULT_LOOK,
  folioLookTokensFromCode,
} from "@/lib/talent-site/theme-catalog/collection/folio-looks";
import { MAGAZINE_LABEL_FAMILY } from "@/lib/site-admin/builder-node/magazine-edition";
import { localiseSeededDesignLabels } from "@/lib/talent-site/design-label-locale";
import { loadTalentPlanKey, loadTalentSiteCtaMode } from "@/lib/talent-site/server/load-max-site";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/** Maison renders in its own default Look when the gallery picks none. */
const MAISON_DEFAULT_LOOK = "maison-pink";
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Gallery palette keys (`stone`) and full Look slugs (`folio-stone`). */
function resolveFolioLookSlug(designSlug: string, lookSlug: string | null | undefined): string | null {
  const fallback = COLLECTION_DEFAULT_LOOK[designSlug] ?? null;
  const raw = (lookSlug || fallback || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw.startsWith("folio-")) return raw;
  if (designSlug === "folio" && ["stone", "light", "dark"].includes(raw)) return `folio-${raw}`;
  return raw || fallback;
}

export async function ThemeCatalogPreview({
  designSlug,
  lookSlug,
  talentProfileId,
  locale: requestedLocale = "en",
  localeExplicit = false,
  demo = null,
}: {
  /** True when `?locale=` was in the URL; My content otherwise uses the site locale. */
  localeExplicit?: boolean;
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
  //  1. Folio Looks always from code (`folio-looks.ts`), never the DB;
  //  2. `?look=` names a gallery palette (e.g. maison-v2 + "rose");
  //  3. `?look=` names a published Look row;
  //  4. design default (Folio → folio-stone, Maison → maison-pink, else gallery).
  const effectiveLookSlug = resolveFolioLookSlug(design.slug, lookSlug);
  const folioTokens = folioLookTokensFromCode(effectiveLookSlug);
  const cleanLook = lookSlug && SLUG_RE.test(lookSlug) ? lookSlug : null;
  const paletteTokens =
    folioTokens ? null : cleanLook ? galleryPaletteLookTokens(design.slug, cleanLook) : null;
  const rowSlug =
    folioTokens || paletteTokens
      ? null
      : (effectiveLookSlug && SLUG_RE.test(effectiveLookSlug) ? effectiveLookSlug : null) ??
        (design.slug === "maison" ? MAISON_DEFAULT_LOOK : null);
  const lookRow = rowSlug ? await loadRow("look", rowSlug) : null;
  const look = lookRow && validateLook(lookRow.payload).ok ? lookRow : null;
  const lookTokens: Record<string, string> | null =
    folioTokens ??
    paletteTokens ??
    (look
      ? getGalleryDesign(design.slug) && design.slug !== "maison"
        ? { ...look.payload.tokens, ...designTypographyTokens(design.slug) }
        : look.payload.tokens
      : galleryDefaultLookTokens(design.slug));

  // P4: a gallery-meta demo talent's content (allow-listed), else the
  // owner-gated hydration exactly as before.
  const demoSource = resolveDemoPreviewSource(designSlug, demo);
  const demoHydration = demoSource ? await resolveDemoPreviewHydration(demoSource) : null;
  const hydration = demoHydration ?? (await resolvePreviewHydration(talentProfileId));
  const built = buildDesignTrees(design.payload, hydration.tokens);
  if (!built.ok) notFound();

  // Bind live widgets (portfolio chapters, rate card, comp card) for:
  //  - Demo: the allow-listed demo talent (`demoTalentProfileId`)
  //  - My content: the signed-in owner (`isReal`)
  // Both paths prune sections that are truly empty. Demo without a
  // resolved talent id keeps the seeded tree untouched.
  const ownerId = !demoSource && hydration.isReal ? talentProfileId?.trim() || null : null;
  const contentId = ownerId ?? demoHydration?.demoTalentProfileId ?? null;
  const locale = contentId
    ? await resolveMyContentPreviewLocale(contentId, localeExplicit ? requestedLocale : null)
    : requestedLocale;
  // A demo shows its SAVED page (her own headline, eyebrow, lede, photos);
  // My content keeps the design tree bound to the owner's data.
  const saved = demoHydration
    ? await loadDemoSavedTrees(demoHydration.demoTalentProfileId, design.slug)
    : null;
  const mine = contentId
    ? await prepareMyContentPreview({
        talentProfileId: contentId,
        locale,
        shellTree: saved?.shellTree ?? built.shellTree,
        homeTree: saved?.homeTree ?? built.homeTree,
      })
    : null;
  const homeTree = mine ? mine.homeTree : built.homeTree;

  const platformDefault = await loadPlatformDefaultTheme("talent");
  // Same layering as the live render: the Look lands in the (empty) site
  // draft layer, then platform < site. A key the Look omits keeps the
  // platform default, exactly as on the published site.
  // The Design's token defaults sit between the platform and the Look.
  const designDefaults = designTokenDefaults(design.slug);
  const effectiveTokens = resolveEffectiveSiteTokens(
    {},
    lookTokens ? mergeLookIntoTokens({}, lookTokens) : {},
    platformDefault.tokens,
    designDefaults,
  );

  const ctaMode = contentId
    ? await loadTalentSiteCtaMode(contentId, await loadTalentPlanKey(contentId))
    : null;
  const localise = (tree: BuilderNode[]) => localiseSeededDesignLabels(tree, locale, ctaMode);

  const [shellHeader, shellFooter] = splitShell(mine ? mine.shellTree : built.shellTree);
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
    builderTree: localise([...shellHeader, ...homeTree, ...shellFooter]),
  };

  const localeNorm = locale === "es" ? "es" : "en";
  // Instrument Serif + Archivo from Look tokens; Archivo Narrow for magazine labels / nav.
  const extraFonts =
    design.slug === "folio"
      ? [MAGAZINE_LABEL_FAMILY, "Archivo Narrow", "Instrument Serif", "Archivo"]
      : [];

  return (
    <ThemeTokenPreviewFrame
      initialTokens={effectiveTokens}
      locale={localeNorm}
      designSlug={design.slug}
    >
      <GoogleFontsLink tokens={effectiveTokens} fontFamilies={extraFonts} />
      <TypeSystemStyle />
      <TalentSiteRenderer
        snapshot={snapshot}
        locale={locale}
        freeformDataSources={mine?.dataSources}
        designSlug={design.slug}
      />
    </ThemeTokenPreviewFrame>
  );
}
