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
  fetchWorkspaceMenuOfferings,
} from "@/lib/site-admin/server/native-data-block-sources";
import { loadTenantWords } from "@/lib/words/server";
import { fetchNativeDirectoryProfilesByNodeId } from "@/lib/site-admin/server/native-directory-source";
import { collectNativeDataBlockNeeds } from "@/lib/site-admin/builder-node/native-data-block-needs";

export { collectNativeDataBlockNeeds } from "@/lib/site-admin/builder-node/native-data-block-needs";

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
 * WS7 Phase 0 — the NATIVE data blocks (`hero_search`, `menu_board`, `talent_type_grid`) are
 * their own data source: they carry no `dataBinding`, they ARE the binding. The
 * pure walk lives in `native-data-block-needs.ts` (imported above) so unit tests
 * can call it without pulling this server module graph.
 */

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
  // BUILDER 2027 · P2B — a native `directory` node renders its category chips
  // from `directoryShortcuts`, but carries no `dataBinding`, so the binding
  // walk above never saw it and every native directory rendered chip-less.
  const needsNativeDirectoryChips = nativeNeeds.directories.some(
    (need) => need.needsShortcuts,
  );
  if (
    featuredLimit == null &&
    !needsLocations &&
    !needsDirectoryShortcuts &&
    !needsNativeDirectoryChips &&
    !needsSocialLinks &&
    !nativeNeeds.needsTalentCount &&
    !nativeNeeds.menuBoard &&
    nativeNeeds.disciplines == null &&
    nativeNeeds.directories.length === 0 &&
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
    menuOfferings,
    menuWords,
    directoryProfilesByNodeId,
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
    needsLocations || needsDirectoryShortcuts || needsNativeDirectoryChips
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
    nativeNeeds.menuBoard
      ? fetchWorkspaceMenuOfferings(dataTenantId, locale)
      : Promise.resolve(undefined),
    // The operator's menu nouns, same gate as the offerings. This must never
    // reject: a words failure degrades the board to catalog copy, it does not
    // blank it, and a board with no Order button is worse than a generic label.
    nativeNeeds.menuBoard
      ? loadTenantWords(dataTenantId, locale === "es" ? "es" : "en")
          .then((w) => ({
            soldOut: w.word("menu.sold_out"),
            orderSent: w.word("menu.order_sent"),
            cta: w.word("menu.cta"),
            noun: w.word("menu.item"),
            nounPlural: w.word("menu.items"),
          }))
          .catch(() => undefined)
      : Promise.resolve(undefined),
    // BUILDER 2027 · P2B — the native `directory` node's FALLBACK cards, one
    // list per node so two differently-scoped bands on a page cannot share (and
    // therefore swap) each other's people. Gated inside the fetcher by the same
    // `listTalentIdsOnTenantRoster` query-layer predicate every other roster
    // read here uses, so a talent this tenant removed cannot appear.
    nativeNeeds.directories.length > 0
      ? fetchNativeDirectoryProfilesByNodeId({
          tenantId: dataTenantId,
          needs: nativeNeeds.directories,
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
    tenantId: dataTenantId,
    featuredTalentProfiles,
    talentLocations: homepageData?.locations,
    directoryShortcuts: homepageData?.talentTypes,
    mediaAssets,
    collections,
    ...(socialLinks ? { socialLinks } : {}),
    ...(tenantTalentCount === undefined ? {} : { tenantTalentCount }),
    ...(talentDisciplines === undefined ? {} : { talentDisciplines }),
    ...(menuOfferings === undefined ? {} : { menuOfferings }),
    ...(menuWords === undefined ? {} : { menuWords }),
    ...(directoryProfilesByNodeId === undefined
      ? {}
      : { directoryProfilesByNodeId }),
  };
}
