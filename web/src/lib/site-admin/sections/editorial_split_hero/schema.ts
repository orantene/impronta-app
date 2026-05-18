import { z } from "zod";

import { nodePresentationSchema } from "../shared/node-presentation";
import { sectionPresentationSchema } from "../shared/presentation";

/**
 * editorial_split_hero — two-column editorial hero ("Discover premium
 * talent across destination cities").
 *
 * Reusable/theme-neutral. Static media mode ships now (operator-supplied
 * MediaFrame image — no hardcoded mannequin/image assumptions; neutral
 * fallback when absent). `selected`/`dynamic` talent-preview media modes
 * are a documented follow-on (they would couple to the cache-trimmed
 * featured-talent DTO; deferred per the DTO-extension decision). All
 * styling token-driven; overlay via the P0-4 presentation overlay model.
 */

const ctaSchema = z.object({
  label: z.string().min(1).max(60),
  href: z.string().min(1).max(500),
});

export const editorialSplitHeroSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  highlight: z.string().max(120).optional(),
  body: z.string().max(600).optional(),

  primaryCta: ctaSchema.optional(),
  secondaryCta: ctaSchema.optional(),

  mediaMode: z.enum(["static", "selected", "dynamic"]).default("static"),
  /** Static media image URL (mediaMode = static). */
  mediaUrl: z.string().url().max(2048).optional(),
  mediaAlt: z.string().max(160).optional(),
  mediaRatio: z.enum(["1/1", "3/4", "4/3", "16/9"]).default("4/3"),
  overlayColor: z.string().max(32).optional(),
  overlayOpacity: z.number().min(0).max(1).optional(),
  overlayStrength: z
    .enum(["none", "soft", "medium", "strong"])
    .default("none"),

  /** Desktop column order. */
  mediaSide: z.enum(["left", "right"]).default("right"),
  /** Which column comes first when stacked on mobile. */
  mobileOrder: z.enum(["text-first", "media-first"]).default("text-first"),

  nodePresentation: z
    .object({
      subheadline: nodePresentationSchema,
      headline: nodePresentationSchema,
      copy: nodePresentationSchema,
      primaryCta: nodePresentationSchema,
      secondaryCta: nodePresentationSchema,
    })
    .optional(),
  presentation: sectionPresentationSchema,
});

export type EditorialSplitHeroV1 = z.infer<typeof editorialSplitHeroSchemaV1>;

export const editorialSplitHeroSchemasByVersion = {
  1: editorialSplitHeroSchemaV1,
} as const;
