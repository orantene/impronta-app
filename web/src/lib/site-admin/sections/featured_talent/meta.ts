import type { SectionMeta } from "../types";

export const featuredTalentMeta: SectionMeta = {
  key: "featured_talent",
  label: "Featured professionals",
  description:
    "Talent cards on the homepage. Source modes: manual pick, featured flag, service, destination, recent. Inherits the tenant's active directory card family.",
  businessPurpose: "feature",
  visibleToAgency: true,
  category: "showcase",
  inDefault: true,
  tag: "new",
};
