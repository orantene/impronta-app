import type { BuilderServicesCatalogNode } from "./types";

/** Default props for a freshly inserted `services_catalog` block. */
export const SERVICES_CATALOG_DEFAULT_PROPS: BuilderServicesCatalogNode["props"] = {
  layout: "rows",
  categoryNav: "pills",
  eyebrow: "The menu",
  title: "Services {i}and prices{/i}",
  showStats: true,
  showPhoto: true,
  showDescription: true,
  showDuration: true,
  showUsdEquivalent: true,
  selectionMode: "all",
  autoIncludeNew: true,
  rowCtaVariant: "outline",
  photoRadius: "soft",
  durationFormat: "auto",
  mobileBar: "float",
  useWebsiteTheme: true,
  showAskLink: true,
  ctaLabel: "",
  emptyMessage: "No services are published yet.",
  bookingSheet: { accent: "primary" },
};
