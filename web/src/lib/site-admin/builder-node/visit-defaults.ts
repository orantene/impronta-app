import type { BuilderVisitNode } from "./types";

/** Default props for a freshly inserted `visit` block. */
export const VISIT_DEFAULT_PROPS: BuilderVisitNode["props"] = {
  layout: "facts",
  eyebrow: "",
  title: "Your visit",
  titleAccent: "visit",
  showMap: true,
  mapImageUrl: "",
  mapCaption: "",
  band: true,
  useWebsiteTheme: true,
};

export type VisitLayout = NonNullable<BuilderVisitNode["props"]["layout"]>;

export const VISIT_LAYOUTS: readonly VisitLayout[] = ["facts", "split", "location", "area"] as const;

/** Defaults the "Location" layout starts from (title is derived from the kind when empty). */
export const LOCATION_DEFAULT_PROPS: BuilderVisitNode["props"] = {
  layout: "location",
  // `eyebrow` is left unset on purpose: unset reads as the mockup's "Tu visita" / "Your visit".
  title: "",
  titleAccent: "",
  band: true,
  mapSide: "left",
  mapSize: "md",
  showMapButton: true,
  useWebsiteTheme: true,
};

/**
 * Defaults the "Area" layout starts from (Gridline W-13 area card: approximate
 * area, municipality chips, travel note, a generated grid drawing).
 */
export const AREA_DEFAULT_PROPS: BuilderVisitNode["props"] = {
  layout: "area",
  title: "",
  titleAccent: "",
  band: false,
  useWebsiteTheme: true,
};
