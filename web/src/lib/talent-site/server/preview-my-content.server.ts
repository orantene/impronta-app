import "server-only";

import {
  loadBuilderNodeDataSources,
  loadPersonalMaxNativeSources,
} from "@/components/home/homepage-cms-data-sources";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { BuilderNodeRenderDataSources } from "@/lib/site-admin/builder-node/render";
import { getLanguageSettingsPublicCached } from "@/lib/language-settings/get-language-settings";
import { loadTalentPreferredLocale } from "@/lib/site-admin/server/talent-locale";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";
import {
  pruneDeadAnchorLinks,
  pruneEmptyMyContentBlocks,
  type MyContentAlbum,
} from "@/lib/talent-site/my-content-prune";
import { normalizeTalentMediaAlbums } from "@/lib/site-admin/builder-node/portfolio-albums";
import { readBlobFieldValuesFromCatalog } from "@/lib/talent/blob-field-values-catalog";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { builderTreeHasFaqBind, builderTreeHasKind } from "./builder-tree-has-kind";
import {
  loadTalentManagingTenantId,
  loadTalentPlanKey,
  loadTalentSiteCtaMode,
} from "./load-max-site";
import { prepareTalentSiteTrees } from "./talent-site-render-fixups.server";
import { loadUsdRatesForSitePrices } from "./vanity-usd-rates";

/**
 * Theme gallery "My content" preview: the talent's site locale. The talent's
 * own preference when the platform publishes it, else the explicit `?locale=`,
 * else the platform default (what the vanity host serves a first visitor).
 */
export async function resolveMyContentPreviewLocale(
  talentProfileId: string,
  requested: string | null | undefined,
): Promise<string> {
  const [preferred, settings] = await Promise.all([
    loadTalentPreferredLocale(talentProfileId),
    getLanguageSettingsPublicCached(),
  ]);
  if (preferred && settings.publicLocales.includes(preferred)) return preferred;
  if (requested === "es" || requested === "en") return requested;
  return settings.defaultLocale ?? "en";
}

/**
 * Same data sources the live Max-site render (`renderMaxSiteDocument`) binds:
 * the managing agency's loader when rostered, else the personal native
 * loaders; plus the talent's own public offerings and USD rates. Preview
 * never books (`catalogBookingLive: false`).
 */
async function loadPreviewDataSources(
  talentProfileId: string,
  tree: BuilderNode[],
  locale: string,
): Promise<BuilderNodeRenderDataSources> {
  const has = (kind: string) => builderTreeHasKind(tree, kind);
  const needsCatalog = has("services_catalog");
  const needsPortfolio = has("portfolio");
  const needsChip = has("next_free_chip");
  const tenantId = await loadTalentManagingTenantId(talentProfileId);
  const [dataSources, offerings] = await Promise.all([
    tenantId
      ? loadBuilderNodeDataSources(tree, tenantId, locale, null, talentProfileId)
      : loadPersonalMaxNativeSources({
          talentProfileId,
          locale,
          servicesCatalog: needsCatalog,
          portfolio: needsPortfolio,
          nextFreeChip: needsChip,
          reviews: has("reviews"),
          visit: has("visit"),
          compCard: has("comp_card"),
          talentFaq: builderTreeHasFaqBind(tree),
        }),
    loadPublicOfferingsForProfile(talentProfileId, locale, null),
  ]);
  const talentOfferings =
    Array.isArray(dataSources.talentOfferings) && dataSources.talentOfferings.length > 0
      ? dataSources.talentOfferings
      : offerings;
  const usdRates = await loadUsdRatesForSitePrices([
    ...talentOfferings,
    ...(dataSources.menuOfferings ?? []),
  ]);
  return { ...dataSources, talentOfferings, usdRates, catalogBookingLive: false };
}

/** The talent's media albums, in her order (chapter titles). Never throws. */
async function loadPreviewAlbums(talentProfileId: string): Promise<MyContentAlbum[]> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return [];
    const blobs = await readBlobFieldValuesFromCatalog(admin, talentProfileId);
    return normalizeTalentMediaAlbums(blobs.media_albums_data);
  } catch (err) {
    logServerError("themePreview.loadAlbums", err);
    return [];
  }
}

/**
 * My content: localise the trees like the live render, bind the live data
 * sources, then hide every block with no real content (and its Contents
 * entry). Pure read; writes nothing.
 */
export async function prepareMyContentPreview(input: {
  talentProfileId: string;
  locale: string;
  shellTree: BuilderNode[];
  homeTree: BuilderNode[];
}): Promise<{
  shellTree: BuilderNode[];
  homeTree: BuilderNode[];
  dataSources: BuilderNodeRenderDataSources;
}> {
  const planKey = await loadTalentPlanKey(input.talentProfileId);
  const ctaMode = await loadTalentSiteCtaMode(input.talentProfileId, planKey);
  const fixed = await prepareTalentSiteTrees({
    talentProfileId: input.talentProfileId,
    locale: input.locale,
    logoUrl: null,
    shellTree: input.shellTree,
    body: input.homeTree,
    ctaMode,
  });
  const [dataSources, albums] = await Promise.all([
    loadPreviewDataSources(input.talentProfileId, fixed.body, input.locale),
    loadPreviewAlbums(input.talentProfileId),
  ]);
  const homeTree = pruneEmptyMyContentBlocks(fixed.body, dataSources, input.locale, albums);
  return {
    shellTree: pruneDeadAnchorLinks(fixed.shellTree, fixed.body, homeTree),
    homeTree,
    dataSources,
  };
}
