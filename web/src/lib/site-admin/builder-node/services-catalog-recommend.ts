/**
 * First-use layout recommendation for `services_catalog`.
 * Suggestion only — inspector always allows another choice.
 */

export type ServicesCatalogLayout =
  | "rows"
  | "cards"
  | "grid"
  | "compact_list"
  | "editorial"
  | "featured";

export type CatalogRecommendSignal = {
  offeringCount: number;
  withPhotoCount: number;
};

export type CatalogLayoutRecommendation = {
  layout: ServicesCatalogLayout;
  reason: string;
};

/** Sensible starting layout from available content (brief §3). */
export function recommendServicesCatalogLayout(
  signal: CatalogRecommendSignal,
): CatalogLayoutRecommendation {
  const { offeringCount, withPhotoCount } = signal;
  if (offeringCount <= 0) {
    return {
      layout: "rows",
      reason: "Default service list until you publish offerings.",
    };
  }
  const photoShare = withPhotoCount / offeringCount;
  if (photoShare >= 0.6 && offeringCount <= 12) {
    return {
      layout: "cards",
      reason: "Most offerings have photos — image cards show them best.",
    };
  }
  if (offeringCount >= 10 && photoShare < 0.35) {
    return {
      layout: "compact_list",
      reason: "Many offerings, few photos — compact price menu scans faster.",
    };
  }
  return {
    layout: "rows",
    reason: "Service list matches a classic menu of name, duration, price, and action.",
  };
}
