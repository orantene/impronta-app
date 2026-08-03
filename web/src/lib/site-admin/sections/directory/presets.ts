import type { DirectoryV1 } from "./schema";

/**
 * Impronta canonical look (the launch default): Atelier template +
 * Portrait card + AI hero band + slim talent-type top bar + sidebar off.
 * This is the seed for the default starter "Directory" page — tenants
 * rename / re-scope / duplicate / delete it like any builder page.
 */
export const fashionDirectoryPreset: DirectoryV1 = {
  eyebrow: "Roster",
  headline: "Talent",
  copy: "Browse the roster. Filter by discipline, refine with natural language.",
  headerAlign: "center",
  showHeading: true,

  entityLabel: "talent",
  scope: "all",
  talentTypeKeys: [],
  tagKeys: [],
  manualProfileCodes: [],
  pinnedProfileCodes: [],
  excludedProfileCodes: [],
  requirePhoto: false,
  excludeUnavailable: false,
  minTrustTier: "any",
  defaultSort: "recommended",
  pagination: "infinite",
  pageSize: 24,

  template: "atelier",
  columnsDesktop: 4,
  columnsTablet: 3,
  columnsMobile: 2,
  // density / cardStyle / cardAspect / hoverBehavior are deliberately UNSET:
  // the starter section follows the tenant's Card Design defaults
  // (`directory.card.*` tokens), which themselves default to the same values
  // this preset used to hardcode — so zero-config tenants render identically,
  // and tenants who set a Card Design default actually see it apply.
  containerWidth: "boxed",
  background: "cool_ground",

  showName: true,
  nameFallback: "first_name",
  showTalentType: true,
  showLocation: true,
  showAttributes: true,
  showRating: false,
  showPriceFrom: true,
  showAvailability: true,
  // Single-agency storefront: every card is this agency's talent, so the
  // per-card ownership badge ("Impronta Models" stamped on every tile) is
  // pure repetition. Off by default for the storefront look; cross-agency
  // surfaces (hub / Discover) use their own configs and keep it on.
  showBadges: false,
  showSave: true,
  showAddToInquiry: true,
  showQuickView: true,
  cardClickAction: "modal",
  cardFieldKeys: [],
  maxFieldLines: 3,

  sidebarShow: false,
  sidebarPosition: "left",
  sidebarSticky: true,
  sidebarDefaultCollapsed: true,
  filterSearchBox: true,
  topBarMode: "talent_type",
  sortControlShow: true,
  showResultCount: true,
  showActiveChips: true,
  mobileFilterStyle: "sheet",

  aiMode: "hero_band",
  aiPlacement: "above_center",
  aiTitle: "Describe who you're looking for",
  aiBody: "",
  aiPlaceholder: "e.g. a bilingual host in Milan available next month",
  aiExamplePrompts: [],
  aiBehavior: "interpret",

  emptyStateText:
    "No one matches yet — broaden the filters or check back as the roster grows.",
  structuredData: true,

  presentation: {
    background: "canvas",
    paddingTop: "editorial",
    paddingBottom: "editorial",
    containerWidth: "wide",
    align: "center",
    dividerTop: "thin-line",
  },
};
