import type { ReactNode } from "react";

import {
  BuilderNodeFontLinks,
  BuilderNodeRendererStyles,
  hasRenderableBuilderNodes,
  renderBuilderNodes,
  type BuilderNode,
} from "@/lib/site-admin/builder-node";
import { treeHasInstances } from "@/lib/site-admin/builder-node/component-instances";
import { makeSectionEmbedRenderer } from "@/lib/site-admin/builder-node/section-embed-renderer";
import { loadBuilderNodeDataSources } from "@/components/home/homepage-cms-data-sources";
import { loadBuilderComponentsForTenant } from "@/lib/site-admin/edit-mode/builder-components-loader";

/**
 * Public renderer for a FREEFORM talent Max snapshot (the platform-default
 * freeform profile). Renders the snapshot's `builderTree` through the SAME
 * shared builder-node renderer the agency storefront and talent extra pages
 * (`/t/[code]/[slug]`) use — it does NOT reimplement any node.
 *
 * Render context (all optional, additive):
 *   - The managing agency `tenantId` scopes any curated `section_embed`'s
 *     data fetch (Supabase / host scope) + bound data sources.
 *   - `talentProfileId` is threaded as the section-embed `previewSubject`
 *     (`{ kind: "talent" }`) so connected curated sections that support a talent
 *     subject hydrate from THIS talent, matching the talent extra-page path.
 *
 * The default tree is build-time hydrated with the talent's real profile data
 * (name/bio/photo/services), so the page renders fully even with no tenant
 * context — section embeds simply degrade to their "connects on publish"
 * placeholder in that case (never throw, never blank out the page).
 */
export async function TalentSiteFreeformRenderer({
  tree,
  locale,
  context,
}: {
  tree: BuilderNode[];
  locale: string;
  context?: {
    tenantId: string | null;
    talentProfileId: string;
    publicPathPrefix?: string;
  };
}): Promise<ReactNode> {
  if (!hasRenderableBuilderNodes(tree, { mode: "freeform" })) {
    return null;
  }

  const tenantId = context?.tenantId ?? null;
  const publicPathPrefix = context?.publicPathPrefix ?? "";

  // Curated section_embed nodes need a tenant render context. previewSubject
  // points the curated sections at THIS talent so connected data hydrates from
  // the talent (matching `/t/[code]/[slug]`). Without a managing tenant the
  // embeds fall back to their placeholder.
  const renderSectionEmbed =
    tenantId && context
      ? makeSectionEmbedRenderer({
          tenantId,
          locale,
          publicPathPrefix,
          previewSubject: { kind: "talent", id: context.talentProfileId, locale },
        })
      : null;

  // Data sources + live component instances — only load when the tree actually
  // binds them AND a managing tenant exists (the loaders are tenant-scoped
  // service-role reads). Empty objects are the no-op default.
  const [dataSources, components] = await Promise.all([
    tenantId
      ? loadBuilderNodeDataSources(tree, tenantId, locale)
      : Promise.resolve({}),
    tenantId && treeHasInstances(tree)
      ? loadBuilderComponentsForTenant(tenantId)
      : Promise.resolve({}),
  ]);

  return (
    <div data-talent-personal-site="" data-talent-personal-site-freeform="">
      <BuilderNodeRendererStyles />
      <BuilderNodeFontLinks nodes={tree} components={components} />
      {renderBuilderNodes(tree, {
        publicPathPrefix,
        mode: "freeform",
        includeRendererStyles: false,
        includeFontLinks: false,
        dataSources,
        components,
        renderSectionEmbed,
      })}
    </div>
  );
}
