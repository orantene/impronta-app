import type { SectionMeta } from "../types";

export const locationDiscoveryMeta: SectionMeta = {
  key: "location_discovery",
  // W2-T2 — async server data-loader (roster-derived cities/counts resolved at
  // render time): an in-editor prop edit must still router.refresh() to repaint.
  hasLiveData: true,
  label: "Location discovery",
  description:
    "Markets/cities block — manual locations or tenant-roster-derived cities with optional counts and directory links. Theme-neutral; zero-data safe.",
  businessPurpose: "feature",
  visibleToAgency: true,
  category: "showcase",
  inDefault: false,
};
