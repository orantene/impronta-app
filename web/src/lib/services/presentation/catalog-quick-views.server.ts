/**
 * Server-side presentation for every services widget on a published talent page (TUL-1272 #3, #9).
 *
 * Why here and not in builder-node/render.tsx: render.tsx is also in the ADMIN client graph
 * (the builder's device preview), which has a hard bundle ceiling. So the resolver, the quick
 * view model, FAQ / reviews copy and the dialog layer never ship to admin: this computes the card
 * hrefs, targets and quick views per widget on the server, and render.tsx only reads the result
 * from `dataSources.serviceQuickViews[node.id]` and lazy-loads the dialog layer.
 */
import { filterOfferingsForCatalog } from "@/lib/site-admin/builder-node/services-catalog-selection";
import { servicePageHrefs } from "@/lib/talent-site/service-page";
import type { TalentOffering } from "@/lib/talent/offerings-types";

import { serviceCatalogPresentation, type ServicePresentationSource } from "./catalog-presentation";
import type { ServiceCardTarget } from "./card-target";
import type { ServiceQuickView } from "./quick-view-model";

export type CatalogQuickViews = {
  hrefs: Record<string, string>;
  targets: Record<string, ServiceCardTarget>;
  views: ServiceQuickView[];
};

type TreeNode = { id?: unknown; kind?: unknown; props?: unknown; children?: unknown };

function collectCatalogNodes(nodes: unknown, out: Array<{ id: string; props: Record<string, unknown> }>): void {
  if (Array.isArray(nodes)) {
    for (const n of nodes) collectCatalogNodes(n, out);
    return;
  }
  if (!nodes || typeof nodes !== "object") return;
  const n = nodes as TreeNode;
  if (n.kind === "services_catalog" && typeof n.id === "string") {
    out.push({ id: n.id, props: (n.props && typeof n.props === "object" ? n.props : {}) as Record<string, unknown> });
  }
  collectCatalogNodes(n.children, out);
}

export function buildCatalogQuickViewsByNode(input: {
  blocks: unknown;
  offerings: readonly TalentOffering[];
  /** Undefined while SERVICE_PRESENTATION_RESOLVER_ENABLED is off. */
  source: ServicePresentationSource | null | undefined;
  /** Locale path of the published site; null for drafts and previews. */
  linkBase: string | null | undefined;
  locale: string;
}): Record<string, CatalogQuickViews> {
  const out: Record<string, CatalogQuickViews> = {};
  if (!input.source || input.linkBase == null) return out;
  const nodes: Array<{ id: string; props: Record<string, unknown> }> = [];
  collectCatalogNodes(input.blocks, nodes);
  for (const node of nodes) {
    const p = node.props as Parameters<typeof filterOfferingsForCatalog>[1] & { tapAction?: unknown };
    const visible = filterOfferingsForCatalog(input.offerings, p);
    const res = serviceCatalogPresentation({
      nodeId: node.id,
      offerings: visible,
      source: input.source,
      linkBase: input.linkBase,
      pageHrefs: servicePageHrefs(visible, input.linkBase),
      locale: input.locale,
      tapAction: p.tapAction,
    });
    if (res) out[node.id] = { hrefs: res.hrefs, targets: res.targets, views: res.quickViews };
  }
  return out;
}
