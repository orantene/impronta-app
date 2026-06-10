/**
 * Storefront data-source resolution for builder-node-bound homepage sections.
 *
 * Extracted from `homepage-cms-sections.tsx` (kept that renderer under the
 * 800-line cap). `loadBuilderNodeDataSources` walks a builder subtree, figures
 * out which live data sources its data-bound nodes need (featured talent,
 * locations, directory shortcuts, media assets, collections), and fetches them
 * in one parallel batch — returning `{}` (no round-trips) when nothing is bound.
 */
import {
  collectBuilderCollectionSourceKeys,
  collectBuilderImageMediaIds,
  type BuilderNode,
  type BuilderNodeRenderDataSources,
} from "@/lib/site-admin/builder-node";
import { fetchFeaturedTalentForSection } from "@/lib/site-admin/sections/featured_talent/fetch";
import { listBuilderImageMediaAssets } from "@/lib/site-admin/media/assets";
import { resolveCollectionDataSources } from "@/lib/site-admin/collections/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getHomepageData } from "@/lib/home-data";

function collectBuilderDataBindingMax(
  nodes: ReadonlyArray<BuilderNode>,
  sourceKey: string,
): number | null {
  let max: number | null = null;
  const visit = (node: BuilderNode) => {
    if (
      node.kind === "container" &&
      node.props.dataBinding?.sourceKey === sourceKey
    ) {
      max = Math.max(max ?? 0, node.props.dataBinding.maxItems ?? 4);
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  for (const node of nodes) visit(node);
  return max;
}

function hasBuilderDataBinding(
  nodes: ReadonlyArray<BuilderNode>,
  sourceKey: string,
): boolean {
  return collectBuilderDataBindingMax(nodes, sourceKey) != null;
}

export async function loadBuilderNodeDataSources(
  nodes: ReadonlyArray<BuilderNode>,
  tenantId: string,
  locale: string,
): Promise<BuilderNodeRenderDataSources> {
  const featuredLimit = collectBuilderDataBindingMax(
    nodes,
    "featured_talent_profiles",
  );
  const needsLocations = hasBuilderDataBinding(nodes, "talent_locations");
  const needsDirectoryShortcuts = hasBuilderDataBinding(
    nodes,
    "tenant_directory_search",
  );
  const mediaIds = collectBuilderImageMediaIds(nodes);
  const collectionSourceKeys = collectBuilderCollectionSourceKeys(nodes);
  if (
    featuredLimit == null &&
    !needsLocations &&
    !needsDirectoryShortcuts &&
    mediaIds.length === 0 &&
    collectionSourceKeys.length === 0
  ) {
    return {};
  }
  // The storefront read bypasses RLS (service role) for media + collections.
  const serviceSupabase =
    mediaIds.length > 0 || collectionSourceKeys.length > 0
      ? createServiceRoleClient()
      : null;
  const mediaSupabase = mediaIds.length > 0 ? serviceSupabase : null;

  const [featuredTalentProfiles, homepageData, mediaAssets, collections] =
    await Promise.all([
    featuredLimit == null
      ? Promise.resolve(undefined)
      : fetchFeaturedTalentForSection(
          tenantId,
          {
            sourceMode: "auto_featured_flag",
            limit: Math.min(Math.max(featuredLimit, 1), 12),
            columnsDesktop: 4,
            variant: "grid",
            presentation: {},
          },
          locale,
        ),
    needsLocations || needsDirectoryShortcuts
      ? getHomepageData({ tenantId })
      : Promise.resolve(null),
    mediaSupabase
      ? listBuilderImageMediaAssets(mediaSupabase, tenantId, mediaIds)
      : Promise.resolve(undefined),
    serviceSupabase && collectionSourceKeys.length > 0
      ? resolveCollectionDataSources(serviceSupabase, tenantId, collectionSourceKeys)
      : Promise.resolve(undefined),
  ]);

  return {
    featuredTalentProfiles,
    talentLocations: homepageData?.locations,
    directoryShortcuts: homepageData?.talentTypes,
    mediaAssets,
    collections,
  };
}
