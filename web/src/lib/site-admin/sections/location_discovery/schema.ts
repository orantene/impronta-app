import { z } from "zod";

import { nodePresentationSchema } from "../shared/node-presentation";
import { sectionPresentationSchema } from "../shared/presentation";
import { optionalLinkRefOrLegacy } from "../../links/link-ref";

/**
 * location_discovery — "Local faces, international reach" block.
 *
 * Reusable/theme-neutral. Sources:
 *   - manual        : operator-authored location cards (safe; no data).
 *   - roster_cities : tenant-scoped — distinct residence cities across THIS
 *                     tenant's roster (`talent_profiles.residence_city_id`
 *                     → `locations`, filtered by `listTalentIdsOnTenantRoster`).
 *   - service_areas : documented follow-on (manual is the safe interim).
 *
 * No tenant favorite-locations table is introduced. Counts derive
 * tenant-scoped. The map visual is a token-driven editorial map, not an
 * external map dependency or duplicate legacy embed. Per-location links
 * default to `/directory` with an operator override — no directory
 * route/param is invented.
 */

const locationItemSchema = z.object({
  label: z.string().min(1).max(80),
  region: z.string().max(80).optional(),
  /** 6C — structured LinkRef; legacy string auto-coerced. */
  href: optionalLinkRefOrLegacy,
  /** Manual count override (manual mode). */
  count: z.number().int().min(0).max(100000).optional(),
  /** Highlights this market in the map-side preview card. */
  featured: z.boolean().optional(),
  /** Used by the map to distinguish active markets from expansion markets. */
  status: z.enum(["active", "coming_soon"]).default("active").optional(),
});

export const locationDiscoverySchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  subheadline: z.string().max(320).optional(),

  source: z
    .enum(["manual", "roster_cities", "service_areas"])
    .default("manual"),
  items: z.array(locationItemSchema).max(24).optional(),

  maxItems: z.number().int().min(1).max(24).default(8),
  showCount: z.boolean().optional(),
  /** Map/pin visual. Off renders the simpler card grid. */
  showMap: z.boolean().optional(),

  ctaLabel: z.string().max(40).optional(),
  /** Section-level CTA link (e.g. browse all). 6C — structured LinkRef. */
  ctaHref: optionalLinkRefOrLegacy,

  layout: z.enum(["grid", "list", "compact"]).default("grid"),
  emptyStateText: z.string().max(240).optional(),

  nodePresentation: z
    .object({
      subheadline: nodePresentationSchema,
      headline: nodePresentationSchema,
      copy: nodePresentationSchema,
    })
    .optional(),
  presentation: sectionPresentationSchema,
});

export type LocationDiscoveryV1 = z.infer<typeof locationDiscoverySchemaV1>;
export type LocationDiscoveryItem = z.infer<typeof locationItemSchema>;

export const locationDiscoverySchemasByVersion = {
  1: locationDiscoverySchemaV1,
} as const;
