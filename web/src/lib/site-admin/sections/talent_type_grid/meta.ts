import type { SectionMeta } from "../types";

export const talentTypeGridMeta: SectionMeta = {
  key: "talent_type_grid",
  // W2-T2 — async server data-loader (roster-derived taxonomy/counts resolved at
  // render time): an in-editor prop edit must still router.refresh() to repaint.
  hasLiveData: true,
  label: "Talent by discipline",
  description:
    "Category/discipline grid — manual cards or tenant-roster-derived taxonomy with optional parent rollup, counts and directory links. Theme-neutral; works for any tenant.",
  businessPurpose: "feature",
  visibleToAgency: true,
  category: "showcase",
  inDefault: false,
};
