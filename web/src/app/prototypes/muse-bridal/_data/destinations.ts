/**
 * Service area taxonomy.
 *
 * Field-model mapping:
 *   - slug           → taxonomy.destinations.slug
 *   - label          → taxonomy.destinations.label
 *   - region         → taxonomy.destinations.region
 *   - image          → taxonomy.destinations.cover_image
 *   - tagline        → taxonomy.destinations.tagline
 *   - featured       → flag for homepage surfacing
 *
 * Used by: Destinations section (home), directory filter, profile detail.
 */

import { IMAGERY } from "./imagery";

export type Destination = {
  slug: string;
  label: string;
  region: string;
  tagline: string;
  image: string;
  featured?: boolean;
};

export const DESTINATIONS: Destination[] = [
  {
    slug: "tulum",
    label: "Tulum",
    region: "Quintana Roo",
    tagline: "Jungle, cenotes, and slow Caribbean light.",
    image: IMAGERY.destTulum,
    featured: true,
  },
  {
    slug: "los-cabos",
    label: "Los Cabos",
    region: "Baja California Sur",
    tagline: "Pacific cliffs and golden-hour terraces.",
    image: IMAGERY.destCabos,
    featured: true,
  },
  {
    slug: "riviera-maya",
    label: "Riviera Maya",
    region: "Quintana Roo",
    tagline: "Private beaches and colonial grounds.",
    image: IMAGERY.destRiviera,
    featured: true,
  },
  {
    slug: "mexico-city",
    label: "Mexico City",
    region: "CDMX",
    tagline: "Garden patios, hotel salons, art-world venues.",
    image: IMAGERY.destCdmx,
    featured: true,
  },
  {
    slug: "europe",
    label: "Europe & Mediterranean",
    region: "Destination",
    tagline: "Amalfi, Mallorca, Provence, Mykonos.",
    image: IMAGERY.destEurope,
    featured: true,
  },
];
