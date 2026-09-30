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

export const VISIT_LAYOUTS: readonly VisitLayout[] = ["facts", "split", "location"] as const;

/** Defaults the "Location" layout starts from (title is derived from the kind when empty). */
export const LOCATION_DEFAULT_PROPS: BuilderVisitNode["props"] = {
  layout: "location",
  eyebrow: "",
  title: "",
  titleAccent: "",
  band: true,
  mapSide: "left",
  mapSize: "md",
  showMapButton: true,
  useWebsiteTheme: true,
};
