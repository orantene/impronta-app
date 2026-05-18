import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";
import { nodePresentationSchema } from "../shared/node-presentation";

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
  manualProfileCodes: z.array(z.string().min(1).max(40)).max(15).optional(),
  /** Service slug filter when sourceMode === 'auto_by_service'. */
  filterServiceSlug: z.string().max(120).optional(),
  /** Destination slug filter when sourceMode === 'auto_by_destination'. */
  filterDestinationSlug: z.string().max(120).optional(),
  /** Max cards to show (1–15). Widened from 12 (P1-2) — pure relaxation,
   * no migration: any previously-valid value (≤12) still validates. */
  limit: z.number().int().min(1).max(15).default(6),
  /** Grid columns on desktop. */
  columnsDesktop: z.number().int().min(2).max(4).default(3),
  variant: z.enum(["grid", "carousel"]).default("grid"),
  /**
   * P1-2 — reusable talent_collection controls. All optional; when unset
   * the renderer keeps the prior default appearance (fields shown), so
   * existing saved compositions are visually unchanged (no migration).
   */
  cardVariant: z
    .enum(["editorial", "compact", "minimal", "profile"])
    .optional(),
  /** Card field visibility. Undefined = shown (back-compat default). */
  showName: z.boolean().optional(),
  showPrimaryType: z.boolean().optional(),
  showSecondaryType: z.boolean().optional(),
  showCity: z.boolean().optional(),
  showLanguages: z.boolean().optional(),
  showAvailability: z.boolean().optional(),
  showBadge: z.boolean().optional(),
  /** Show the talent's parent category instead of the leaf talent type. */
  parentCategoryDisplay: z.boolean().optional(),
  /** Optional Request/add-to-inquiry CTA per card. */
  requestCta: ctaSchema.optional(),
  /** Copy shown when the resolved collection is empty. */
  emptyStateText: z.string().max(240).optional(),
  footerCta: ctaSchema.optional(),
  /** Optional child-node-level layout/style overrides (Phase 4 bridge). */
  nodePresentation: z
    .object({
      subheadline: nodePresentationSchema,
      headline: nodePresentationSchema,
      copy: nodePresentationSchema,
      footerCta: nodePresentationSchema,
    })
    .optional(),
  presentation: sectionPresentationSchema,
});

export type FeaturedTalentV1 = z.infer<typeof featuredTalentSchemaV1>;

export const featuredTalentSchemasByVersion = {
  1: featuredTalentSchemaV1,
} as const;
