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
  showCategory: false,
  showDuration: true,
  showDelivery: false,
  showAvailability: false,
  showPrice: true,
  showUsdEquivalent: true,
  showBadges: false,
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

/** Visible-field keys in the Content inspector — mirrors render show* gates. */
export const SERVICES_CATALOG_VISIBLE_FIELD_KEYS = [
  "showStats",
  "showPhoto",
  "showDescription",
  "showCategory",
  "showDuration",
  "showDelivery",
  "showAvailability",
  "showPrice",
  "showUsdEquivalent",
  "showBadges",
] as const;

export type ServicesCatalogVisibleFieldKey =
  (typeof SERVICES_CATALOG_VISIBLE_FIELD_KEYS)[number];

/**
 * Checkbox checked state must match render defaults. Opt-in fields
 * (`showCategory` / `showDelivery` / `showAvailability` / `showBadges`) default
 * false — `!== false` would show them checked when unset while the island
 * still hides them (dead control).
 */
export function servicesCatalogVisibleFieldChecked(
  catalog: Partial<BuilderServicesCatalogNode["props"]>,
  key: ServicesCatalogVisibleFieldKey,
): boolean {
  const fallback = SERVICES_CATALOG_DEFAULT_PROPS[key];
  return (catalog[key] ?? fallback) === true;
}

/** Pass-through for booking sheet accent — both options are live CSS. */
export function resolveServicesCatalogSheetAccent(
  accent: "ink" | "primary" | undefined,
): "ink" | "primary" {
  return accent === "ink" ? "ink" : "primary";
}
