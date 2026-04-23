/**
 * Service catalog — the top-level category taxonomy for the collective.
 *
 * Field-model mapping:
 *   - `slug`       → `taxonomy.services.slug`
 *   - `label`      → `taxonomy.services.label`
 *   - `tagline`    → `taxonomy.services.tagline`
 *   - `ideal_for`  → `taxonomy.services.ideal_for[]`  (multi-select)
 *   - `image`      → `taxonomy.services.cover_image`
 *   - `icon_key`   → `taxonomy.services.icon_key`     (enum of icon family)
 *
 * Each row is what a CMS editor would see on a "Service" record. The icon
 * is referenced by key so the theme's icon family can swap them.
 */

import { IMAGERY } from "./imagery";

export type IconKey =
  | "brush"
  | "scissors"
  | "camera"
  | "film"
  | "clipboard"
  | "floral"
  | "sparkle"
  | "music";

export type ServiceCategory = {
  slug: string;
  label: string;
  kicker: string;
  tagline: string;
  description: string;
  idealFor: string[];
  image: string;
  iconKey: IconKey;
};

export const SERVICES: ServiceCategory[] = [
  {
    slug: "bridal-makeup",
    label: "Bridal Makeup",
    kicker: "Beauty",
    tagline: "Long-wear, luminous, editorial.",
    description:
      "Makeup artists who specialize in all-day wearability under beach light, long veils, and three-camera coverage. Natural glam, romantic soft focus, and editorial statement looks.",
    idealFor: ["Ceremonies", "Getting-ready suites", "Editorial previews"],
    image: IMAGERY.serviceMakeup,
    iconKey: "brush",
  },
  {
    slug: "hair-styling",
    label: "Hair Styling",
    kicker: "Beauty",
    tagline: "Timeless silhouettes that hold.",
    description:
      "Classical chignons, soft Hollywood waves, and low ballerina buns engineered to travel with you from first look to late-night reception.",
    idealFor: ["Bridal party styling", "Destination weddings", "Two-look days"],
    image: IMAGERY.serviceHair,
    iconKey: "scissors",
  },
  {
    slug: "photography",
    label: "Photography",
    kicker: "Image",
    tagline: "Candid warmth, editorial polish.",
    description:
      "A spectrum from film-forward documentary to high-fashion editorial. Our photographers are multi-lingual and travel with assisted lighting teams.",
    idealFor: ["Full-day coverage", "Pre-wedding editorials", "Legacy portraits"],
    image: IMAGERY.servicePhoto,
    iconKey: "camera",
  },
  {
    slug: "videography",
    label: "Videography",
    kicker: "Image",
    tagline: "Films that feel like a memory.",
    description:
      "Cinematic wedding films, social reels, and a same-day highlight edit delivered before the after-party. Drone-licensed across Mexico and the Caribbean.",
    idealFor: ["Cinematic films", "Same-day edits", "Social teaser reels"],
    image: IMAGERY.serviceVideo,
    iconKey: "film",
  },
  {
    slug: "planning",
    label: "Event Planning",
    kicker: "Production",
    tagline: "Calm, coordinated, considered.",
    description:
      "Partial and full-service planners who hold the room together — logistics, vendor selection, design direction, and an unflappable wedding-day lead.",
    idealFor: ["Destination weddings", "Multi-day programs", "Private estates"],
    image: IMAGERY.servicePlanning,
    iconKey: "clipboard",
  },
  {
    slug: "floral-design",
    label: "Floral Design",
    kicker: "Design",
    tagline: "Sculptural, seasonal, sensory.",
    description:
      "Installations that live inside the architecture — ceiling clouds, tablescapes, ceremony portals — sourced from local growers where possible.",
    idealFor: ["Ceremony installations", "Tablescapes", "Editorial styling"],
    image: IMAGERY.serviceFloral,
    iconKey: "floral",
  },
  {
    slug: "content-creation",
    label: "Content Creation",
    kicker: "Image",
    tagline: "Social-ready, beautifully captured.",
    description:
      "Dedicated content creators shooting vertical, behind-the-scenes, and same-day social cuts — so your phone can stay tucked away.",
    idealFor: ["Same-day reels", "Behind-the-scenes", "Brand collaborations"],
    image: IMAGERY.serviceContent,
    iconKey: "sparkle",
  },
  {
    slug: "music-performance",
    label: "Music & Performance",
    kicker: "Experience",
    tagline: "Ceremony strings to sunrise sets.",
    description:
      "Violin quartets for vows, Latin jazz ensembles for cocktail, and resident DJs who close the night with taste. All artists offer curated playlists in advance.",
    idealFor: ["Ceremony live music", "Reception bands", "Late-night DJ sets"],
    image: IMAGERY.serviceMusic,
    iconKey: "music",
  },
];

export const SERVICE_BY_SLUG = Object.fromEntries(
  SERVICES.map((s) => [s.slug, s] as const),
) as Record<string, ServiceCategory>;
