import type { SectionMeta } from "../types";

export const featuredTalentMeta: SectionMeta = {
  key: "featured_talent",
  // W2-T2 — async server data-loader (awaits the roster query at render time):
  // an in-editor prop edit must still router.refresh() to repaint the island.
  hasLiveData: true,
  label: "Featured professionals",
  description:
    "Talent cards on the homepage. Source modes: manual pick, featured flag, service, destination, recent. Inherits the tenant's active directory card family.",
  businessPurpose: "feature",
  visibleToAgency: true,
  category: "showcase",
  inDefault: true,
  tag: "new",
};
