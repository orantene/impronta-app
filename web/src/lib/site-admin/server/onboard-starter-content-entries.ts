/**
 * Free-starter CONTENT definitions (composition entries + demo talent
 * seeds). Split from onboard-starter-content.ts to honor the 800-line cap;
 * the seeding ORCHESTRATION stays in that file.
 */

import type { SectionTypeKey } from "@/lib/site-admin/sections/registry";

export interface FreeStarterEntry {
  slotKey: string;
  sectionTypeKey: SectionTypeKey;
  propsOverride?: Record<string, unknown>;
}

/**
 * Curated, license-cleared editorial imagery shipped in `web/public` (the
 * same demo set the impronta/nova template tenants use). Root-relative paths
 * on purpose: they resolve on EVERY tenant host (custom domains included)
 * and cost zero Supabase storage egress. The section schemas accept them via
 * `publicImagePathOrUrlSchema`.
 */
const STARTER_IMG = {
  hero: "/talent-templates/demo/impronta-2026/lifestyle-1.jpg",
  tileMakeup: "/talent-templates/demo/impronta-2026/hero-a.jpg",
  tileHair: "/marketing/photos/case-studies/cs-salon.jpg",
  tilePhotography: "/marketing/photos/case-studies/cs-models.jpg",
  tileStyling: "/talent-templates/demo/impronta-2026/atelier-1.jpg",
  ctaBanner: "/marketing/photos/case-studies/cs-wedding.jpg",
} as const;

/**
 * Free one-page starter composition. Copy reads like a real studio's
 * homepage (the owner rejected the previous template-describing meta-copy:
 * "Your studio, live in one page" is documentation, not a business site).
 *
 * `studioName` personalizes the hero with the workspace's display name;
 * callers without one (static recipes) get a neutral premium register.
 * House rules: no em dashes, no dead CTAs (every link goes to /contact,
 * which every tenant has; the Free tier has no /directory page).
 */
export function buildFreeStarterEntries(
  studioName?: string | null,
): ReadonlyArray<FreeStarterEntry> {
  const name = studioName?.trim() || "Our studio";
  return [
    {
      slotKey: "hero",
      sectionTypeKey: "hero",
      propsOverride: {
        headline: "A curated roster, ready for your next production.",
        subheadline:
          `${name} represents makeup, hair, photography, and styling professionals for editorial work, events, and campaigns. Tell us about your project and we will assemble the right team.`,
        primaryCta: { label: "Start an inquiry", href: "/contact" },
        slides: [
          {
            backgroundImageUrl: STARTER_IMG.hero,
            backgroundImageAlt: "",
          },
        ],
        overlay: "gradient-scrim",
        mood: "editorial",
      },
    },
    {
      slotKey: "services",
      sectionTypeKey: "category_grid",
      propsOverride: {
        eyebrow: "Services",
        headline: "One booking, a full creative team.",
        items: [
          {
            label: "Makeup",
            tagline: "Editorial and events",
            imageUrl: STARTER_IMG.tileMakeup,
          },
          {
            label: "Hair",
            tagline: "Set and ceremony ready",
            imageUrl: STARTER_IMG.tileHair,
          },
          {
            label: "Photography",
            tagline: "Portrait and campaign",
            imageUrl: STARTER_IMG.tilePhotography,
          },
          {
            label: "Styling",
            tagline: "Wardrobe and direction",
            imageUrl: STARTER_IMG.tileStyling,
          },
        ],
        columnsDesktop: 4,
        variant: "portrait-masonry",
      },
    },
    {
      slotKey: "featured",
      sectionTypeKey: "featured_talent",
      propsOverride: {
        eyebrow: "The roster",
        headline: "Featured professionals",
        intro:
          "A first look at the artists and specialists available through the studio.",
        sourceMode: "auto_recent",
        limit: 5,
        columnsDesktop: 3,
        variant: "grid",
        // The library default for this section is the v11 NOIR showcase
        // (ivory display heading + black card chrome), which is tuned for
        // dark storefronts. On the light starter theme it rendered as a
        // huge ghost heading over pitch-black cards. Pin the neutral,
        // token-driven treatment instead.
        layoutPreset: "standard",
        headerAlign: "split",
        cardChrome: "standard",
        imageTreatment: "natural",
        actionStyle: "primary-duo",
        // The default footer CTA points to /directory, which Free tenants
        // do not have (Amendment A3). Shallow-merge with undefined unsets it.
        footerCta: undefined,
      },
    },
    {
      slotKey: "final_cta",
      sectionTypeKey: "cta_banner",
      propsOverride: {
        eyebrow: "Bookings",
        headline: "Tell us about your project.",
        copy:
          "Share your date, location, and creative direction. We reply within one business day with availability and a suggested team.",
        primaryCta: { label: "Start an inquiry", href: "/contact" },
        backgroundImageUrl: STARTER_IMG.ctaBanner,
        backgroundImageAlt: "",
        overlayOpacity: 55,
        variant: "centered-overlay",
        // Unset the library default's Muse Bridal reassurance line
        // ("Quiet, unhurried..."), which reads off-brand for a generic
        // studio starter.
        reassurance: undefined,
      },
    },
  ];
}

export interface FreeStarterTalentSeed {
  displayName: string;
  firstName: string;
  lastName: string;
  shortBio: string;
  /**
   * Root-relative demo headshot (web/public). Stored in
   * `media_assets.storage_path`; the thumb resolvers pass absolute URLs and
   * root-relative paths through untouched, so the card renders it on every
   * host without touching Supabase storage.
   */
  portraitPath: string;
}

export const FREE_STARTER_TALENT_SEEDS: ReadonlyArray<FreeStarterTalentSeed> = [
  {
    displayName: "Luna Alvarez",
    firstName: "Luna",
    lastName: "Alvarez",
    shortBio:
      "Editorial makeup artist with destination and campaign experience.",
    portraitPath: "/talent-templates/demo/impronta-2026/portrait-1.jpg",
  },
  {
    displayName: "Mateo Rossi",
    firstName: "Mateo",
    lastName: "Rossi",
    shortBio:
      "Wedding and lifestyle photographer focused on candid storytelling.",
    portraitPath: "/talent-templates/demo/impronta-2026/portrait-4.jpg",
  },
  {
    displayName: "Sofia Bennett",
    firstName: "Sofia",
    lastName: "Bennett",
    shortBio: "Bridal and event hairstylist for luxury and editorial productions.",
    portraitPath: "/talent-templates/demo/impronta-2026/portrait-6.jpg",
  },
  {
    displayName: "Noah Sinclair",
    firstName: "Noah",
    lastName: "Sinclair",
    shortBio:
      "Creative stylist helping teams build cohesive wardrobe direction.",
    portraitPath: "/talent-templates/demo/impronta-2026/portrait-3.jpg",
  },
  {
    displayName: "Camila Ortega",
    firstName: "Camila",
    lastName: "Ortega",
    shortBio:
      "Production coordinator keeping timelines, vendors, and on-set flow aligned.",
    portraitPath: "/talent-templates/demo/impronta-2026/portrait-5.jpg",
  },
];
