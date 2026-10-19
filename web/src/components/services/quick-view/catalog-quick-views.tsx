/**
 * One call for the services widget renderer (kept out of builder-node/render.tsx,
 * a size-ratcheted god file): the card hrefs plus the quick-view layer.
 * Legacy (flag off, builder, previews): the page hrefs unchanged, no layer.
 */
import type { ReactNode } from "react";

import { serviceCatalogPresentation, type ServicePresentationSource } from "@/lib/services/presentation/catalog-presentation";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import type { TalentBookingPosture } from "@/lib/talent/selling-booking-settings";

import { ServiceQuickViewLayer } from "./ServiceQuickViewLayer";

export function servicesCatalogQuickViews(input: {
  offerings: readonly TalentOffering[];
  nodeId: string;
  locale: string;
  pageHrefs: Record<string, string>;
  linkBase: string | null | undefined;
  source: ServicePresentationSource | null | undefined;
  tapAction?: unknown;
  confirmsByHand: boolean;
  bookingPosture?: TalentBookingPosture;
}): { hrefs: Record<string, string>; layer: ReactNode } {
  const out = serviceCatalogPresentation({
    nodeId: input.nodeId,
    offerings: input.offerings,
    source: input.source,
    linkBase: input.linkBase,
    pageHrefs: input.pageHrefs,
    locale: input.locale,
    tapAction: input.tapAction,
  });
  if (!out) return { hrefs: input.pageHrefs, layer: null };
  const ids = new Set(Object.keys(out.targets));
  return {
    hrefs: out.hrefs,
    layer: (
      <ServiceQuickViewLayer
        nodeId={input.nodeId}
        views={out.quickViews}
        targets={out.targets}
        offerings={input.offerings.filter((o) => ids.has(o.id))}
        confirmsByHand={input.confirmsByHand}
        bookingPosture={input.bookingPosture}
      />
    ),
  };
}
