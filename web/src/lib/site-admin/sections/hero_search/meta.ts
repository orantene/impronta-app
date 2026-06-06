import type { SectionMeta } from "../types";

export const heroSearchMeta: SectionMeta = {
  key: "hero_search",
  // W2-T2 — server data-loader (the @tenant_talent_count stat is resolved on the
  // server): an in-editor prop edit must still router.refresh() to repaint it.
  hasLiveData: true,
  label: "Hero — search",
  description:
    "Search-first hero: eyebrow, headline + highlight, subcopy, directory search, two CTAs, chips and a stat line. Theme-neutral; reusable across tenants.",
  businessPurpose: "feature",
  visibleToAgency: true,
  category: "hero",
  inDefault: false,
};
