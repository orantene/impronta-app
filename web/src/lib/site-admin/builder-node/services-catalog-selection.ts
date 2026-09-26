/**
 * Selection + eligibility helpers for `services_catalog`.
 * Widget stores references only — never duplicates catalog rows.
 */

import type { TalentOffering } from "@/lib/talent/offerings-types";

export type ServicesCatalogSelectionMode = "all" | "categories" | "ids";

export type ServicesCatalogSelectionProps = {
  selectionMode?: ServicesCatalogSelectionMode;
  selectedCategoryNames?: string[];
  selectedOfferingIds?: string[];
  autoIncludeNew?: boolean;
  featuredOfferingIds?: string[];
  sort?: "catalog" | "manual";
  manualOrderIds?: string[];
};

export function isPublicEligibleOffering(o: TalentOffering): boolean {
  return (
    o.status === "published" &&
    o.visibility !== "agency_only" &&
    o.moderationState === "approved"
  );
}

/** Offering IDs the talent selected that are no longer publicly eligible. */
export function ineligibleSelectedOfferingIds(
  selectedIds: readonly string[] | undefined,
  eligible: readonly TalentOffering[],
): string[] {
  if (!selectedIds?.length) return [];
  const ok = new Set(eligible.filter(isPublicEligibleOffering).map((o) => o.id));
  return selectedIds.filter((id) => !ok.has(id));
}

export function filterOfferingsForCatalog(
  all: readonly TalentOffering[],
  props: ServicesCatalogSelectionProps,
): TalentOffering[] {
  const eligible = all.filter(isPublicEligibleOffering);
  const mode = props.selectionMode ?? "all";

  let visible: TalentOffering[];
  if (mode === "ids") {
    const want = new Set(props.selectedOfferingIds ?? []);
    visible = eligible.filter((o) => want.has(o.id));
  } else if (mode === "categories") {
    const cats = new Set(
      (props.selectedCategoryNames ?? []).map((c) => c.trim()).filter(Boolean),
    );
    visible = cats.size
      ? eligible.filter((o) => o.category?.trim() && cats.has(o.category.trim()))
      : [];
    // autoIncludeNew is the default for category mode — new items in those
    // categories appear automatically because we filter by category name, not id.
    void props.autoIncludeNew;
  } else {
    visible = eligible;
  }

  if (props.sort === "manual" && props.manualOrderIds?.length) {
    const rank = new Map(props.manualOrderIds.map((id, i) => [id, i]));
    visible = [...visible].sort((a, b) => {
      const ai = rank.has(a.id) ? rank.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const bi = rank.has(b.id) ? rank.get(b.id)! : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.sortOrder - b.sortOrder;
    });
  }

  // Featured ids win; else fall back to offering.isFeatured so Featured layout
  // still gets a hero when the talent marked items in Services but never set
  // widget-level featuredOfferingIds.
  const featuredIds = props.featuredOfferingIds ?? [];
  if (featuredIds.length) {
    const rank = new Map(featuredIds.map((id, i) => [id, i]));
    visible = [...visible].sort((a, b) => {
      const ai = rank.has(a.id) ? rank.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const bi = rank.has(b.id) ? rank.get(b.id)! : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.sortOrder - b.sortOrder;
    });
  } else if (visible.some((o) => o.isFeatured)) {
    visible = [...visible].sort((a, b) => {
      const af = a.isFeatured ? 0 : 1;
      const bf = b.isFeatured ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.sortOrder - b.sortOrder;
    });
  }

  return visible;
}
