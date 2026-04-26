import type { SectionMeta } from "../types";

export const statsMeta: SectionMeta = {
  key: "stats",
  label: "Stats",
  description:
    "Big number row (3-6 metrics) with optional caption. Trust signals like '12 years', '180 cities', 'NPS 72'.",
  businessPurpose: "trust",
  visibleToAgency: true,
};
