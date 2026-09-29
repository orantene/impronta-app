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
import { resolveDemoPreviewSource } from "./demo-preview-source";
import { resolveDemoPreviewHydration } from "./demo-preview-hydration";
import {
  prepareMyContentPreview,
  resolveMyContentPreviewLocale,
} from "@/lib/talent-site/server/preview-my-content.server";
import {
  COLLECTION_DEFAULT_LOOK,
  folioLookTokensFromCode,
} from "@/lib/talent-site/theme-catalog/collection/folio-looks";
import { DesignSkinStyle } from "@/lib/talent-site/theme-catalog/collection/design-skin-style";
import { MAGAZINE_LABEL_FAMILY } from "@/lib/site-admin/builder-node/magazine-edition";

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

  // Folio Looks always come from code (`folio-looks.ts`), never the DB, so
  // stone applies before sync and cannot drift. Other Designs keep the row path.
  const effectiveLookSlug = resolveFolioLookSlug(designSlug, lookSlug);
  const folioTokens = folioLookTokensFromCode(effectiveLookSlug);
  const lookRow =
    !folioTokens && effectiveLookSlug && SLUG_RE.test(effectiveLookSlug)
      ? await loadRow("look", effectiveLookSlug)
      : null;
  const look = lookRow && validateLook(lookRow.payload).ok ? lookRow : null;
  const lookTokens: Record<string, string> | null =
    folioTokens ?? (look ? look.payload.tokens : null);

  // P4: a gallery-meta demo talent's content (allow-listed), else the
  // owner-gated hydration exactly as before.
  const demoSource = resolveDemoPreviewSource(designSlug, demo);
  const hydration =
    (demoSource ? await resolveDemoPreviewHydration(demoSource) : null) ??
    (await resolvePreviewHydration(talentProfileId));
  const built = buildDesignTrees(design.payload, hydration.tokens);
  if (!built.ok) notFound();

  // My content (the owner's real data): the talent's site locale, the live
  // render's locale swaps, the live data sources, and hide-empty. Demo
  // content keeps the requested locale and the untouched design.
  const ownerId = !demoSource && hydration.isReal ? talentProfileId?.trim() || null : null;
  const locale = ownerId
    ? await resolveMyContentPreviewLocale(ownerId, localeExplicit ? requestedLocale : null)
    : requestedLocale;
  const mine = ownerId
    ? await prepareMyContentPreview({
        talentProfileId: ownerId,
        locale,
        shellTree: built.shellTree,
        homeTree: built.homeTree,
      })
    : null;
  const homeTree = mine ? mine.homeTree : built.homeTree;

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
    builderTree: [...shellHeader, ...homeTree, ...shellFooter],
  };

  const localeNorm = locale === "es" ? "es" : "en";
  // Instrument Serif + Archivo from Look tokens; Archivo Narrow for magazine labels / nav.
  const extraFonts =
    designSlug === "folio"
      ? [MAGAZINE_LABEL_FAMILY, "Archivo Narrow", "Instrument Serif", "Archivo"]
      : [];

  return (
    <ThemeTokenPreviewFrame
      initialTokens={effectiveTokens}
      locale={localeNorm}
      designSlug={design.slug}
    >
      <GoogleFontsLink tokens={effectiveTokens} fontFamilies={extraFonts} />
      <DesignSkinStyle slug={design.slug} />
      <TalentSiteRenderer
        snapshot={snapshot}
        locale={locale}
        freeformDataSources={mine?.dataSources}
      />
    </ThemeTokenPreviewFrame>
  );
}
