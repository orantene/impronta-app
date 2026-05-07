import type { SectionTypeKey } from "../registry";

export type SectionTemplateStarterKind = "data" | "design" | "conversion";
export type SectionTemplateStarterSourceKind =
  | "live-data"
  | "starter-content"
  | "navigation"
  | "route-action";

export interface SectionTemplateStarter {
  id: string;
  label: string;
  description: string;
  sectionTypeKey: SectionTypeKey;
  category: string;
  kind: SectionTemplateStarterKind;
  sourceKind: SectionTemplateStarterSourceKind;
  dataSource: string;
  editScope: string;
  preview: "search" | "talent" | "map" | "chips" | "gallery" | "cta";
  previewImageUrl?: string;
  stylePresets?: ReadonlyArray<Omit<SectionTemplateStarterStylePreset, "props">>;
  searchTerms: string[];
}

export interface SectionTemplateStarterDefault {
  name: string;
  sectionTypeKey: SectionTypeKey;
  props: Record<string, unknown>;
}

export interface SectionTemplateStarterStylePreset {
  id: string;
  label: string;
  description: string;
  props: Record<string, unknown>;
}

export const SECTION_TEMPLATE_STARTERS = [
  {
    id: "directory-search-hero",
    label: "Directory Search Hero",
    description:
      "A centered talent-directory opener with search-first copy and category navigation.",
    sectionTypeKey: "hero",
    category: "hero",
    kind: "design",
    sourceKind: "starter-content",
    dataSource: "Static copy now; ready for directory search wiring.",
    editScope: "Copy, CTAs, presentation, and future search controls.",
    preview: "search",
    stylePresets: [
      {
        id: "editorial-center",
        label: "Editorial center",
        description: "Airy centered search page with calm spacing.",
      },
      {
        id: "compact-brief",
        label: "Compact brief",
        description: "Shorter opening for pages that need more content above the fold.",
      },
    ],
    searchTerms: ["search", "directory", "hero", "brief", "category", "landing"],
  },
  {
    id: "featured-talent-live-grid",
    label: "Featured Talent Grid",
    description:
      "Live roster cards pulled from the tenant directory using the featured talent flag.",
    sectionTypeKey: "featured_talent",
    category: "showcase",
    kind: "data",
    sourceKind: "live-data",
    dataSource: "Database: featured talent profiles.",
    editScope: "Heading, limit, layout, and live talent source controls.",
    preview: "talent",
    previewImageUrl:
      "https://images.unsplash.com/photo-1496747611176-843222e1e57c",
    stylePresets: [
      {
        id: "editorial-grid",
        label: "Editorial grid",
        description: "Four-column roster with large portrait rhythm.",
      },
      {
        id: "tight-roster",
        label: "Tight roster",
        description: "Denser profile grid for directory-heavy homepages.",
      },
    ],
    searchTerms: ["talent", "profiles", "roster", "database", "models", "featured"],
  },
  {
    id: "explore-by-location-map",
    label: "Explore by Location",
    description:
      "A map-led destination section for operating markets, location counts, and regional discovery.",
    sectionTypeKey: "map_overlay",
    category: "embed",
    kind: "data",
    sourceKind: "live-data",
    dataSource: "Data-ready: destinations and talent counts.",
    editScope: "Location copy, map embed, card position, and layout.",
    preview: "map",
    stylePresets: [
      {
        id: "wide-map",
        label: "Wide map",
        description: "Large panoramic map for destination-led agencies.",
      },
      {
        id: "compact-card",
        label: "Compact card",
        description: "Shorter map with the location card closer to the content.",
      },
    ],
    searchTerms: ["location", "map", "destinations", "markets", "city", "geo"],
  },
  {
    id: "browse-by-type-pills",
    label: "Browse By Type",
    description:
      "A compact icon-chip section for service categories like models, hosts, creators, and photo/video.",
    sectionTypeKey: "category_grid",
    category: "navigation",
    kind: "data",
    sourceKind: "navigation",
    dataSource: "Navigation: tenant taxonomy links.",
    editScope: "Category labels, links, icons, columns, and spacing.",
    preview: "chips",
    stylePresets: [
      {
        id: "pill-cloud",
        label: "Pill cloud",
        description: "Centered rounded chips like a premium directory search page.",
      },
      {
        id: "card-grid",
        label: "Card grid",
        description: "More structured cards for service-led pages.",
      },
    ],
    searchTerms: ["categories", "types", "chips", "taxonomy", "services", "browse"],
  },
  {
    id: "editorial-photo-story",
    label: "Editorial Photo Story",
    description:
      "A ready-made image strip with premium editorial rhythm for campaign, venue, or talent storytelling.",
    sectionTypeKey: "gallery_strip",
    category: "showcase",
    kind: "design",
    sourceKind: "starter-content",
    dataSource: "Starter images; swappable through the inspector.",
    editScope: "Images, captions, aspect rhythm, and section styling.",
    preview: "gallery",
    previewImageUrl:
      "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91",
    stylePresets: [
      {
        id: "mosaic-story",
        label: "Mosaic story",
        description: "Editorial image mix with varied proportions.",
      },
      {
        id: "clean-strip",
        label: "Clean strip",
        description: "Even image rhythm for portfolio or campaign pages.",
      },
    ],
    searchTerms: ["gallery", "photos", "story", "lookbook", "images", "editorial"],
  },
  {
    id: "brief-intake-cta",
    label: "Brief Intake CTA",
    description:
      "A conversion band for routing visitors into an agency-managed booking or inquiry flow.",
    sectionTypeKey: "cta_banner",
    category: "convert",
    kind: "conversion",
    sourceKind: "route-action",
    dataSource: "Static CTA; connects to inquiry routes.",
    editScope: "CTA copy, links, tone, imagery, and conversion layout.",
    preview: "cta",
    previewImageUrl:
      "https://images.unsplash.com/photo-1529139574466-a303027c1d8b",
    stylePresets: [
      {
        id: "soft-inquiry",
        label: "Soft inquiry",
        description: "Warm conversion band with reassurance copy.",
      },
      {
        id: "direct-brief",
        label: "Direct brief",
        description: "More direct CTA for conversion-focused pages.",
      },
    ],
    searchTerms: ["cta", "booking", "inquiry", "brief", "contact", "convert"],
  },
] as const satisfies ReadonlyArray<SectionTemplateStarter>;

export type SectionTemplateStarterId = (typeof SECTION_TEMPLATE_STARTERS)[number]["id"];

export interface SectionTemplateKit {
  id: string;
  label: string;
  description: string;
  category: string;
  kind: "home-kit" | "story-kit" | "conversion-kit";
  starterIds: SectionTemplateStarterId[];
  searchTerms: string[];
}

export const SECTION_TEMPLATE_KITS = [
  {
    id: "directory-home-4",
    label: "Directory Home",
    description:
      "Four-section homepage starter: search hero, category browse, featured talent, and location map.",
    category: "hero",
    kind: "home-kit",
    starterIds: [
      "directory-search-hero",
      "browse-by-type-pills",
      "featured-talent-live-grid",
      "explore-by-location-map",
    ],
    searchTerms: ["home", "homepage", "directory", "search", "talent", "location"],
  },
  {
    id: "agency-proof-3",
    label: "Agency Proof",
    description:
      "A fast agency landing sequence with directory search, live talent, and a managed brief CTA.",
    category: "showcase",
    kind: "conversion-kit",
    starterIds: [
      "directory-search-hero",
      "featured-talent-live-grid",
      "brief-intake-cta",
    ],
    searchTerms: ["agency", "proof", "cta", "booking", "featured", "brief"],
  },
  {
    id: "editorial-lookbook-3",
    label: "Editorial Lookbook",
    description:
      "A visual brand sequence with search-led entry, photo story, and booking CTA.",
    category: "showcase",
    kind: "story-kit",
    starterIds: [
      "directory-search-hero",
      "editorial-photo-story",
      "brief-intake-cta",
    ],
    searchTerms: ["editorial", "lookbook", "gallery", "photo", "campaign", "brand"],
  },
] as const satisfies ReadonlyArray<SectionTemplateKit>;

const STARTER_DEFAULTS: Record<SectionTemplateStarterId, SectionTemplateStarterDefault> = {
  "directory-search-hero": {
    name: "Directory search hero",
    sectionTypeKey: "hero",
    props: {
      headline: "Find the right talent for your brief",
      subheadline:
        "Search the directory by role, location, or fit. Agency-managed, no direct contact.",
      presentation: {
        background: "canvas",
        paddingTop: "editorial",
        paddingBottom: "airy",
        containerWidth: "wide",
        align: "center",
      },
    },
  },
  "featured-talent-live-grid": {
    name: "Featured talent grid",
    sectionTypeKey: "featured_talent",
    props: {
      eyebrow: "Featured Talent",
      headline: "Handpicked by the agency",
      copy: "",
      sourceMode: "auto_featured_flag",
      limit: 5,
      columnsDesktop: 4,
      variant: "grid",
      footerCta: { label: "View all", href: "/directory" },
      presentation: {
        background: "canvas",
        paddingTop: "airy",
        paddingBottom: "airy",
        containerWidth: "wide",
        align: "left",
      },
    },
  },
  "explore-by-location-map": {
    name: "Explore by location",
    sectionTypeKey: "map_overlay",
    props: {
      eyebrow: "Explore by location",
      headline: "Where we operate",
      mapEmbedUrl:
        "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d4850000!2d-91.795!3d23.6345!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1",
      card: {
        title: "Cancun, Ibiza, Playa del Carmen, Tulum",
        body: "Surface active markets with talent counts and destination filters.",
        address: "Primary agency operating locations",
        hours: "Updated from tenant directory data",
      },
      side: "card-bottom",
      ratio: "21/9",
      presentation: {
        background: "canvas",
        paddingTop: "airy",
        paddingBottom: "airy",
        containerWidth: "wide",
        align: "center",
      },
    },
  },
  "browse-by-type-pills": {
    name: "Browse by type",
    sectionTypeKey: "category_grid",
    props: {
      eyebrow: "Browse by type",
      headline: "Choose the right discipline",
      copy: "Start with the role, then refine by location, look, availability, and fit.",
      items: [
        { label: "Models", tagline: "Fashion and commercial", iconKey: "sparkle", href: "/directory?type=models" },
        { label: "Hosts", tagline: "Hospitality and events", iconKey: "clipboard", href: "/directory?type=hosts" },
        { label: "Performers", tagline: "Stage and atmosphere", iconKey: "star", href: "/directory?type=performers" },
        { label: "Music", tagline: "DJs and live acts", iconKey: "music", href: "/directory?type=music" },
        { label: "Wellness", tagline: "Care and recovery", iconKey: "floral", href: "/directory?type=wellness" },
        { label: "Photo & Video", tagline: "Capture teams", iconKey: "camera", href: "/directory?type=photo-video" },
      ],
      variant: "small-icon-list",
      columnsDesktop: 4,
      footerCta: { label: "Browse directory", href: "/directory" },
      presentation: {
        background: "canvas",
        paddingTop: "standard",
        paddingBottom: "standard",
        containerWidth: "wide",
        align: "center",
      },
    },
  },
  "editorial-photo-story": {
    name: "Editorial photo story",
    sectionTypeKey: "gallery_strip",
    props: {
      eyebrow: "Selected work",
      headline: "A visual rhythm for the brand.",
      items: [
        {
          src: "https://images.unsplash.com/photo-1496747611176-843222e1e57c",
          alt: "Editorial portrait",
          aspect: "tall",
        },
        {
          src: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91",
          alt: "Studio campaign",
          aspect: "square",
        },
        {
          src: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b",
          alt: "Agency talent shoot",
          aspect: "wide",
        },
      ],
      caption: "Use this as a starter kit, then replace images from the inspector.",
      variant: "mosaic",
      presentation: {
        background: "canvas",
        paddingTop: "airy",
        paddingBottom: "airy",
        containerWidth: "wide",
        align: "left",
      },
    },
  },
  "brief-intake-cta": {
    name: "Brief intake CTA",
    sectionTypeKey: "cta_banner",
    props: {
      eyebrow: "Start a brief",
      headline: "Tell us what you need and we will build the shortlist.",
      copy: "A single agency-managed request for talent, locations, timing, and production needs.",
      reassurance: "No direct contact. Every booking stays managed by the agency.",
      primaryCta: { label: "Start a request", href: "/contact" },
      secondaryCta: { label: "Browse talent", href: "/directory" },
      variant: "centered-overlay",
      imageSide: "right",
      bandTone: "ivory",
      insetCard: true,
      overlayOpacity: 35,
      presentation: {
        background: "muted-surface",
        paddingTop: "airy",
        paddingBottom: "airy",
        containerWidth: "wide",
        align: "center",
      },
    },
  },
};

const STARTER_STYLE_PRESET_DEFAULTS: Partial<
  Record<SectionTemplateStarterId, Record<string, Record<string, unknown>>>
> = {
  "directory-search-hero": {
    "editorial-center": {
      presentation: {
        background: "canvas",
        paddingTop: "editorial",
        paddingBottom: "airy",
        containerWidth: "wide",
        align: "center",
      },
    },
    "compact-brief": {
      subheadline: "Search by role, location, look, and fit. Every brief stays agency-managed.",
      presentation: {
        background: "muted-surface",
        paddingTop: "standard",
        paddingBottom: "standard",
        containerWidth: "narrow",
        align: "center",
      },
    },
  },
  "featured-talent-live-grid": {
    "editorial-grid": {
      columnsDesktop: 4,
      limit: 5,
      presentation: {
        background: "canvas",
        paddingTop: "airy",
        paddingBottom: "airy",
        containerWidth: "wide",
        align: "left",
      },
    },
    "tight-roster": {
      columnsDesktop: 4,
      limit: 5,
      presentation: {
        background: "muted-surface",
        paddingTop: "standard",
        paddingBottom: "standard",
        containerWidth: "wide",
        align: "left",
      },
    },
  },
  "explore-by-location-map": {
    "wide-map": {
      ratio: "21/9",
      side: "card-bottom",
    },
    "compact-card": {
      ratio: "16/9",
      side: "card-right",
      presentation: {
        paddingTop: "standard",
        paddingBottom: "standard",
      },
    },
  },
  "browse-by-type-pills": {
    "pill-cloud": {
      variant: "small-icon-list",
      columnsDesktop: 4,
    },
    "card-grid": {
      variant: "horizontal-scroll",
      columnsDesktop: 3,
      presentation: {
        align: "left",
      },
    },
  },
  "editorial-photo-story": {
    "mosaic-story": {
      variant: "mosaic",
    },
    "clean-strip": {
      variant: "scroll-rail",
      presentation: {
        align: "center",
      },
    },
  },
  "brief-intake-cta": {
    "soft-inquiry": {
      bandTone: "ivory",
      insetCard: true,
      overlayOpacity: 35,
    },
    "direct-brief": {
      headline: "Send the brief. We will shape the shortlist.",
      copy: "Tell us the role, timing, location, and creative direction.",
      bandTone: "espresso",
      insetCard: false,
      overlayOpacity: 55,
    },
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function mergeRecords(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = next[key];
    next[key] =
      isPlainObject(current) && isPlainObject(value)
        ? mergeRecords(current, value)
        : value;
  }
  return next;
}

export function getSectionTemplateStarterDefault(
  starterId: string | null | undefined,
  stylePresetId?: string | null | undefined,
): SectionTemplateStarterDefault | null {
  if (!starterId) return null;
  const defaults = STARTER_DEFAULTS[starterId as SectionTemplateStarterId];
  if (!defaults) return null;
  if (!stylePresetId) return defaults;
  const presetProps =
    STARTER_STYLE_PRESET_DEFAULTS[starterId as SectionTemplateStarterId]?.[
      stylePresetId
    ];
  if (!presetProps) return null;
  return {
    ...defaults,
    props: mergeRecords(defaults.props, presetProps),
  };
}

export function isSectionTemplateStarterId(
  starterId: string | null | undefined,
): starterId is SectionTemplateStarterId {
  if (!starterId) return false;
  return starterId in STARTER_DEFAULTS;
}

export function isSectionTemplateStarterStylePresetId(
  starterId: string | null | undefined,
  stylePresetId: string | null | undefined,
): boolean {
  if (!starterId || !stylePresetId) return false;
  return Boolean(
    STARTER_STYLE_PRESET_DEFAULTS[starterId as SectionTemplateStarterId]?.[
      stylePresetId
    ],
  );
}
