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
import { loadApplyDesignRow } from "@/lib/talent-site/theme-releases/release-design.server";
import { loadMaisonCatalogRow, maisonBuiltinRow } from "@/lib/talent-site/server/maison-catalog-row";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { isCodeSourceRequested } from "./theme-preview-source";
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
  galleryPreviewLookSlug,
} from "@/lib/talent-site/theme-catalog/gallery-meta";
import { TypeSystemStyle } from "@/lib/talent-site/theme-catalog/collection/design-type-system-style";
import {
  COLLECTION_DEFAULT_LOOK,
  folioLookTokensFromCode,
} from "@/lib/talent-site/theme-catalog/collection/folio-looks";
import { gridlineLookTokensFromCode } from "@/lib/talent-site/theme-catalog/collection/gridline-looks";
import { designTokenDefaults } from "@/lib/talent-site/theme-catalog/collection/design-token-defaults";
import { localiseSeededDesignLabels } from "@/lib/talent-site/design-label-locale";
import { loadTalentPlanKey, loadTalentSiteCtaMode } from "@/lib/talent-site/server/load-max-site";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { resolveDemoPreviewSource } from "./demo-preview-source";
import { loadDemoSavedTrees, resolveDemoPreviewHydration } from "./demo-preview-hydration";
import {
  prepareMyContentPreview,
  resolveMyContentPreviewLocale,
} from "@/lib/talent-site/server/preview-my-content.server";

/** Maison renders in its own default Look when the gallery picks none. */
const MAISON_DEFAULT_LOOK = "maison-pink";
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Folio magazine leaf kinds — Design defaults stamp `edition: "magazine"`. */
const FOLIO_MAGAZINE_KINDS = new Set([
  "masthead",
  "contents",
  "portfolio",
  "comp_card",
  "spec_table",
  "statement_footer",
]);

/** Ensure Folio magazine blocks keep `edition: "magazine"` after saved-tree bind. */
function stampFolioMagazineEdition(tree: BuilderNode[]): BuilderNode[] {
  const visit = (node: BuilderNode): BuilderNode => {
    const kids = "children" in node && Array.isArray(node.children) ? node.children : null;
    const props = (node.props ?? {}) as Record<string, unknown>;
    const nextProps = FOLIO_MAGAZINE_KINDS.has(node.kind)
      ? { ...props, edition: "magazine" }
      : props;
    return {
      ...node,
      props: nextProps,
      ...(kids ? { children: kids.map(visit) } : {}),
    } as BuilderNode;
  };
  return tree.map(visit);
}




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
  source = null,
}: {
  /** `?source=code` (platform admin / dev): render the in-code payload, not the published row. */
  source?: string | null;
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
  // F109: a Design previews at the version a new apply would pin (newest released).
  // `?source=code`: the in-code built-in, hydrated with the demo's content.
  const actor = source ? await getCachedActorSession() : null;
  const viewerIsAdmin = !!actor && isPlatformAdmin(actor.profile);
  const codeSource = isCodeSourceRequested(source, { isPlatformAdmin: viewerIsAdmin });
  const loadRow = async <K extends "design" | "look">(kind: K, slug: string) => {
    if (kind === "design" && codeSource) {
      const inCode = maisonBuiltinRow("design", slug);
      if (inCode) return inCode as never;
    }
    if (kind === "design") {
      const applied = await loadApplyDesignRow(admin, slug);
      if (applied) return applied as never;
    }
    return isMaisonCatalogSlug(slug)
      ? loadMaisonCatalogRow(admin, kind, slug)
      : loadPublishedCatalogRow(admin, kind, slug);
  };
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
  const effectiveLookSlug = resolveFolioLookSlug(design.slug, lookSlug);
  // Folio and Gridline resolve their Looks from code (never DB); `?look=green` or `gridline-green` both work.
  const folioTokens =
    design.slug === "gridline"
      ? gridlineLookTokensFromCode(effectiveLookSlug)
      : folioLookTokensFromCode(effectiveLookSlug);
  const codeDemo = codeSource ? resolveDemoPreviewSource(designSlug, demo) : null;
  const codeDemoGallery = codeDemo ? getGalleryDesign(design.slug) : null;
  const cleanLook =
    lookSlug && SLUG_RE.test(lookSlug)
      ? lookSlug
      : codeDemo && codeDemoGallery
        ? galleryPreviewLookSlug(codeDemoGallery, codeDemo.defaultPalette)
        : null;
  const paletteTokens =
    folioTokens ? null : cleanLook ? galleryPaletteLookTokens(design.slug, cleanLook) : null;
  const rowSlug =
    folioTokens || paletteTokens
      ? null
      : cleanLook ?? (design.slug === "maison" ? MAISON_DEFAULT_LOOK : null);
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
  const demoHydration = demoSource ? await resolveDemoPreviewHydration(demoSource, { platformAdminVerified: codeSource && viewerIsAdmin }) : null;
  const hydration = demoHydration ?? (await resolvePreviewHydration(talentProfileId));
  const built = buildDesignTrees(design.payload, hydration.tokens);
  if (!built.ok) notFound();

  // My content (the owner's real data): the talent's site locale, the live
  // render's locale swaps, the live data sources, and hide-empty. Demo
  // content keeps the requested locale and the untouched design.
  const ownerId = !demoSource && hydration.isReal ? talentProfileId?.trim() || null : null;
  // A demo talent's own live widgets (services, photos, reviews, visit) bind
  // too, read-only, in the requested locale.
  const contentId = ownerId ?? demoHydration?.demoTalentProfileId ?? null;
  const locale = ownerId
    ? await resolveMyContentPreviewLocale(ownerId, localeExplicit ? requestedLocale : null)
    : requestedLocale;
  // A demo shows its SAVED page (her own headline, eyebrow, lede, photos);
  // My content keeps the design tree bound to the owner's data.
  const saved = demoHydration && !codeSource
    ? await loadDemoSavedTrees(demoHydration.demoTalentProfileId, design.slug)
    : null;
  const folioDesign = design.slug === "folio";
  const shellForBind = folioDesign ? built.shellTree : (saved?.shellTree ?? built.shellTree);
  const homeForBind = folioDesign
    ? stampFolioMagazineEdition(built.homeTree)
    : (saved?.homeTree ?? built.homeTree);
  const mine = contentId
    ? await prepareMyContentPreview({
        talentProfileId: contentId,
        locale,
        shellTree: shellForBind,
        homeTree: homeForBind,
      })
    : null;
  const homeTree = mine
    ? folioDesign
      ? stampFolioMagazineEdition(mine.homeTree)
      : mine.homeTree
    : homeForBind;

  const platformDefault = await loadPlatformDefaultTheme("talent");
  // Same layering as the live render: Design defaults sit between platform and Look.
  const designDefaults = designTokenDefaults(design.slug);
  // A demo wears its OWN saved Look (palette, fonts, shape: the site's token
  // layer), unless the viewer picked a different palette than the demo's
  // gallery default. F19: every Maison v2 demo rendered in Rosé.
  const galleryDesign = getGalleryDesign(design.slug);
  const demoDefaultLook =
    demoSource && galleryDesign ? galleryPreviewLookSlug(galleryDesign, demoSource.defaultPalette) : null;
  const demoOwnTokens =
    saved && Object.keys(saved.tokens).length > 0 && (!cleanLook || cleanLook === demoDefaultLook)
      ? saved.tokens
      : null;
  const effectiveTokens = resolveEffectiveSiteTokens(
    {},
    demoOwnTokens ?? (lookTokens ? mergeLookIntoTokens({}, lookTokens) : {}),
    platformDefault.tokens,
    designDefaults,
  );

  // Seeded labels follow the locale and (for the owner) the booking mode,
  // exactly as the live site renders them.
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

  return (
    <ThemeTokenPreviewFrame initialTokens={effectiveTokens} locale={locale === "es" ? "es" : "en"} designSlug={design.slug}>
      <GoogleFontsLink tokens={effectiveTokens} />
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
