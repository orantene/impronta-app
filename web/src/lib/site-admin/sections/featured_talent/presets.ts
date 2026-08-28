import type { FeaturedTalentV1 } from "./schema";

export const v11FeaturedTalentPreset = {
  eyebrow: "Selected",
  headline: "Featured Talent",
  copy: "",
  sourceMode: "auto_featured_flag",
  limit: 4,
  columnsDesktop: 4,
  variant: "grid",
  layoutPreset: "v11-showcase",
  headerAlign: "center",
  cardChrome: "v11-noir",
  imageTreatment: "cinematic",
  showBookmarkIcon: false,
  actionStyle: "outline-duo",
  cardVariant: "editorial",
  showName: true,
  showPrimaryType: true,
  showSecondaryType: true,
  showCity: true,
  showLanguages: true,
  showAvailability: true,
  showBadge: false,
  parentCategoryDisplay: false,
  // `/directory` for the same reason `footerCta` below already uses it: on an
  // agency host `/contact` is NOT the platform contact route. It is outside
  // AGENCY_STOREFRONT_PREFIXES, so the proxy rewrites it to `/p/contact`,
  // which 404s until the operator creates that page — and #1395 deliberately
  // stopped seeding a placeholder. This preset was missed in that pass, so
  // every seeded talent card on a brand-new site shipped a dead Request CTA.
  requestCta: { label: "Request", href: { kind: "tenant-page", value: "/directory" } },
  footerCta: { label: "Explore Talent", href: { kind: "tenant-page", value: "/directory" } },
  emptyStateText: "Featured profiles appear here as talent are added to the roster.",
  presentation: {
    background: "canvas",
    paddingTop: "editorial",
    paddingBottom: "editorial",
    containerWidth: "wide",
    align: "center",
    dividerTop: "thin-line",
  },
} as const satisfies FeaturedTalentV1;
