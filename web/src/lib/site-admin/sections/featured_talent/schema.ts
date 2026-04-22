import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

/**
 * Featured talent section — surfaces directory cards on the homepage via
 * the tenant's active `template.directory-card-family`. Source modes let
 * admins pick talent manually or auto-fill by service/destination/featured.
 *
 * NOTE: the actual card render today pulls from the live directory; this
 * schema carries only the configuration. When the `manual_pick` mode ships
 * a talent picker UI, it will write the chosen profile_codes here.
 */

const ctaSchema = z.object({
  label: z.string().min(1).max(60),
  href: z.string().min(1).max(500),
});

export const featuredTalentSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  copy: z.string().max(400).optional(),
  sourceMode: z
    .enum([
      "manual_pick",
      "auto_featured_flag",
      "auto_by_service",
      "auto_by_destination",
      "auto_recent",
    ])
    .default("auto_featured_flag"),
  /** Talent profile codes to feature when sourceMode === 'manual_pick'. */
  manualProfileCodes: z.array(z.string().min(1).max(40)).max(12).optional(),
  /** Service slug filter when sourceMode === 'auto_by_service'. */
  filterServiceSlug: z.string().max(120).optional(),
  /** Destination slug filter when sourceMode === 'auto_by_destination'. */
  filterDestinationSlug: z.string().max(120).optional(),
  /** Max cards to show (1–12). */
  limit: z.number().int().min(1).max(12).default(6),
  /** Grid columns on desktop. */
  columnsDesktop: z.number().int().min(2).max(4).default(3),
  variant: z.enum(["grid", "carousel"]).default("grid"),
  footerCta: ctaSchema.optional(),
  presentation: sectionPresentationSchema,
});

export type FeaturedTalentV1 = z.infer<typeof featuredTalentSchemaV1>;

export const featuredTalentSchemasByVersion = {
  1: featuredTalentSchemaV1,
} as const;
