/**
 * The services widget's presentation, per card (TUL-1272 #3, #4, #9).
 *
 * The server loader sends `ServicePresentationSource` ONLY when the
 * SERVICE_PRESENTATION_RESOLVER_ENABLED flag is on; absent = legacy (today's
 * links, untouched). With it, each card resolves its mode (stored setting,
 * then trade default, then plan degradation), the widget's "Al tocar" setting
 * may force one, and every card gets a real href plus the quick views the list
 * must carry in its HTML.
 */
import { isServicePageEligible } from "@/lib/talent-site/service-page";
import type { ServiceReviews } from "@/lib/talent-site/service-page-reviews";
import {
  isServiceTapAction,
  serviceCardTarget,
  serviceQuickViewId,
  wantedModeForTap,
  type ServiceCardTarget,
} from "./card-target";
import { buildServiceQuickView, type QuickViewOffering, type ServiceQuickView } from "./quick-view-model";
import { resolveServicePresentation } from "./resolve";
import type { PresentationMode } from "./types";

export type ServicePresentationSource = {
  /** Talent type / trade slug of the owner; null for unknown. */
  tradeSlug: string | null;
  /** Modes the owner's plan allows (talent or workspace entitlements). */
  allowedModes: readonly PresentationMode[];
  /** Per-service stored setting (held migration 415800); empty until it lands. */
  settings?: Record<string, PresentationMode>;
  /** The owner's published FAQ, shown in every quick view. */
  talentFaq?: ReadonlyArray<{ question: string; answer: string }>;
  reviews?: ServiceReviews | null;
};

export type ServiceCatalogPresentation = {
  /** offering id -> card href (replaces the legacy page hrefs). */
  hrefs: Record<string, string>;
  targets: Record<string, ServiceCardTarget>;
  /** Quick views this list must render (facts in the HTML). */
  quickViews: ServiceQuickView[];
};

export function serviceCatalogPresentation(input: {
  /** The widget node: keeps dialog ids unique when a page has two services widgets. */
  nodeId: string;
  offerings: readonly QuickViewOffering[];
  source: ServicePresentationSource | null | undefined;
  /** Locale path of the published site ("" / "/en"); null in the builder and previews. */
  linkBase: string | null | undefined;
  /** Legacy page hrefs (`servicePageHrefs`). */
  pageHrefs: Record<string, string>;
  locale: string;
  tapAction?: unknown;
}): ServiceCatalogPresentation | null {
  const { source } = input;
  if (!source || input.linkBase == null) return null;
  const tap = isServiceTapAction(input.tapAction) ? input.tapAction : "auto";
  const homePath = input.linkBase.replace(/\/+$/, "") || "/";
  const pageAllowed = source.allowedModes.includes("own_page");
  const out: ServiceCatalogPresentation = { hrefs: {}, targets: {}, quickViews: [] };
  for (const o of input.offerings) {
    if (!isServicePageEligible(o)) continue;
    const resolved = resolveServicePresentation({
      enabled: true,
      setting: source.settings?.[o.id] ?? null,
      tradeSlug: source.tradeSlug,
      entitlements: { allowedModes: source.allowedModes },
    }).mode;
    const pageHref = input.pageHrefs[o.id] ?? null;
    const quickViewId = serviceQuickViewId(o, input.nodeId);
    const target = serviceCardTarget({
      mode: wantedModeForTap(tap, resolved),
      pageAllowed,
      pageHref,
      quickViewId,
    });
    out.hrefs[o.id] = target.href;
    out.targets[o.id] = target;
    if (target.quickViewId) {
      out.quickViews.push(
        buildServiceQuickView(o, {
          quickViewId,
          locale: input.locale,
          homePath,
          pageHref: pageAllowed ? pageHref : null,
          talentFaq: source.talentFaq,
          reviews: source.reviews,
        }),
      );
    }
  }
  return out;
}
