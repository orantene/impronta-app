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
import { resolveShellSocialContact } from "@/lib/site-admin/server/shell-social-contact";
import {
  fetchTenantTalentCount,
  fetchTenantTalentDisciplines,
} from "@/lib/site-admin/server/native-data-block-sources";

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

// A4 — a `social_links` node carries its OWN `dataBinding` (it is not a generic
// repeater container), so detect it separately. When any social_links node binds
// to `workspace_social_links`, the loader fetches the tenant's social/contact
// profiles once and exposes them on `dataSources.socialLinks`.
function hasBoundSocialLinksNode(nodes: ReadonlyArray<BuilderNode>): boolean {
  const visit = (node: BuilderNode): boolean => {
    if (
      node.kind === "social_links" &&
      (node.props.dataBinding?.sourceKey === "workspace_social_links" ||
        node.props.dataBinding?.sourceKey === "social_links")
    ) {
      return true;
    }
    if ("children" in node && Array.isArray(node.children)) {
      return node.children.some(visit);
    }
    return false;
  };
  return nodes.some(visit);
}

/**
 * WS7 Phase 0 — the NATIVE data blocks (`hero_search`, `talent_type_grid`) are
 * their own data source: they carry no `dataBinding`, they ARE the binding. This
 * walk answers two questions in one pass — does the tree contain a hero whose
 * stat line is roster-derived, and does it contain a discipline grid in dynamic
 * mode (and with what settings)?
 *
 * Returning `null` for either means "nothing to fetch", which keeps the loader's
 * existing zero-round-trip fast path intact for every page that uses neither.
 */
function collectNativeDataBlockNeeds(nodes: ReadonlyArray<BuilderNode>): {
  needsTalentCount: boolean;
  disciplines: {
    maxItems: number;
    parentCategoryMode: boolean;
    selectedTermIds?: string[];
  } | null;
} {
  let needsTalentCount = false;
  let disciplines: {
    maxItems: number;
    parentCategoryMode: boolean;
    selectedTermIds?: string[];
  } | null = null;

  const visit = (node: BuilderNode) => {
    if (
      node.kind === "hero_search" &&
      node.props.statSource === "tenant_talent_count"
    ) {
      needsTalentCount = true;
    }
    if (node.kind === "talent_type_grid" && node.props.mode === "dynamic") {
      // Several grids on one page: fetch ONE superset (the largest cap, the
      // union of selected terms) and let each node slice it down at render.
      const maxItems = node.props.maxItems ?? 7;
      const selected = node.props.selectedTermIds ?? [];
      if (!disciplines) {
        disciplines = {
          maxItems,
          parentCategoryMode: node.props.parentCategoryMode === true,
          ...(selected.length > 0 ? { selectedTermIds: [...selected] } : {}),
        };
      } else {
        disciplines.maxItems = Math.max(disciplines.maxItems, maxItems);
        disciplines.parentCategoryMode =
          disciplines.parentCategoryMode || node.props.parentCategoryMode === true;
        // A node with NO selection wants everything, so any such node clears the
        // narrowing rather than intersecting it away.
        if (selected.length === 0) {
          delete disciplines.selectedTermIds;
        } else if (disciplines.selectedTermIds) {
          disciplines.selectedTermIds = [
            ...new Set([...disciplines.selectedTermIds, ...selected]),
          ];
        }
      }
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  for (const node of nodes) visit(node);
  return { needsTalentCount, disciplines };
}

export async function loadBuilderNodeDataSources(
  nodes: ReadonlyArray<BuilderNode>,
  tenantId: string,
  locale: string,
  /**
   * In-editor PREVIEW SUBJECT (Builder Lab / talent + workspace surfaces). When
   * present, tenant-scoped data (featured talent / locations / directory) is
   * resolved against `previewSubject.id` instead of the active `tenantId`, so a
   * talent/workspace page builder previews THAT subject's data — matching the
   * published render which scopes the same sources to that subject.
   *
   * Homepage callers OMIT this argument → `dataTenantId` falls back to
   * `tenantId`, keeping the homepage path byte-identical.
   */
  previewSubject?: { kind: string; id: string } | null,
): Promise<BuilderNodeRenderDataSources> {
  const dataTenantId = previewSubject?.id ?? tenantId;
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
  const needsSocialLinks = hasBoundSocialLinksNode(nodes);
  // WS7 Phase 0 — native data blocks.
  const nativeNeeds = collectNativeDataBlockNeeds(nodes);
  if (
    featuredLimit == null &&
    !needsLocations &&
    !needsDirectoryShortcuts &&
    !needsSocialLinks &&
    !nativeNeeds.needsTalentCount &&
    nativeNeeds.disciplines == null &&
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

  const [
    featuredTalentProfiles,
    homepageData,
    mediaAssets,
    collections,
    socialContact,
    tenantTalentCount,
    talentDisciplines,
  ] = await Promise.all([
    featuredLimit == null
      ? Promise.resolve(undefined)
      : fetchFeaturedTalentForSection(
          dataTenantId,
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
      ? getHomepageData({ tenantId: dataTenantId })
      : Promise.resolve(null),
    mediaSupabase
      ? listBuilderImageMediaAssets(mediaSupabase, tenantId, mediaIds)
      : Promise.resolve(undefined),
    serviceSupabase && collectionSourceKeys.length > 0
      ? resolveCollectionDataSources(serviceSupabase, tenantId, collectionSourceKeys)
      : Promise.resolve(undefined),
    // A4 — RLS-scoped social/contact read (anon-safe public client inside the
    // resolver). Combines social + contact links into one platform/href list
    // the social_links node renders. Empty when nothing is configured.
    needsSocialLinks
      ? resolveShellSocialContact({ tenantId: dataTenantId })
      : Promise.resolve(null),
    // WS7 Phase 0 — both reads are scoped to `dataTenantId` (the preview subject
    // when previewing, else the active tenant) and gated inside the fetchers by
    // `listTalentIdsOnTenantRoster`, so they can only ever see this tenant's
    // visible roster. See lib/site-admin/server/native-data-block-sources.ts.
    nativeNeeds.needsTalentCount
      ? fetchTenantTalentCount(dataTenantId)
      : Promise.resolve(undefined),
    nativeNeeds.disciplines
      ? fetchTenantTalentDisciplines({
          tenantId: dataTenantId,
          parentCategoryMode: nativeNeeds.disciplines.parentCategoryMode,
          selectedTermIds: nativeNeeds.disciplines.selectedTermIds,
          maxItems: nativeNeeds.disciplines.maxItems,
          locale,
        })
      : Promise.resolve(undefined),
  ]);

  const socialLinks = socialContact
    ? [
        ...socialContact.socialLinks.map((link) => ({
          platform: link.platform,
          href: link.href,
          ...(link.label ? { label: link.label } : {}),
        })),
        ...socialContact.contactLinks.map((link) => ({
          platform: link.type,
          href: link.value,
          ...(link.label ? { label: link.label } : {}),
        })),
      ]
    : undefined;

  return {
    featuredTalentProfiles,
    talentLocations: homepageData?.locations,
    directoryShortcuts: homepageData?.talentTypes,
    mediaAssets,
    collections,
    ...(socialLinks ? { socialLinks } : {}),
    ...(tenantTalentCount === undefined ? {} : { tenantTalentCount }),
    ...(talentDisciplines === undefined ? {} : { talentDisciplines }),
  };
}
