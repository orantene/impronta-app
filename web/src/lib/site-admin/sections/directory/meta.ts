import type { SectionMeta } from "../types";

export const directoryMeta: SectionMeta = {
  key: "directory",
  // W2-T2 — async server data-loader (awaits the roster query at render time):
  // an in-editor prop edit must still router.refresh() to repaint the island.
  hasLiveData: true,
  label: "Directory",
  description:
    "A portable, filterable talent directory. Drop it on any page, scope it to a talent type (e.g. \"Our Chefs\"), pick a template + card style, and add optional AI search. One engine, unlimited directory pages.",
  businessPurpose: "feature",
  visibleToAgency: true,
  category: "showcase",
  inDefault: true,
  tag: "premium",
};
