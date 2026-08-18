import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";
import { nodePresentationSchema } from "../shared/node-presentation";
import { i18nCopy } from "../shared/i18n-text";

/**
 * Testimonials trio — three elegant quote cards with a palette accent
 * drawn from the theme (blush / sage / champagne / ivory). Used as
 * social-proof social proof in high-consideration verticals (bridal,
 * staffing, creator, wellness).
 */

const accentSchema = z.enum([
  "blush",
  "sage",
  "champagne",
  "ivory",
  "auto", // cycle blush→sage→champagne by index
]);

const testimonialItemSchema = z.object({
  quote: i18nCopy(360, { min: 1 }),
  author: i18nCopy(80).optional(),
  context: i18nCopy(120).optional(),
  location: i18nCopy(120).optional(),
  accent: accentSchema.optional(),
});

export const testimonialsTrioSchemaV1 = z.object({
  eyebrow: i18nCopy(60).optional(),
  headline: i18nCopy(200).optional(),
  items: z.array(testimonialItemSchema).min(1).max(4),
  /** Layout variant. */
  variant: z
    .enum(["trio-card", "single-hero", "carousel-row"])
    .default("trio-card"),
  /** Default accent when items don't set one. `auto` cycles. */
  defaultAccent: accentSchema.default("auto"),
  /** Optional child-node-level overrides for eyebrow/headline roles. */
  nodePresentation: z
    .object({
      subheadline: nodePresentationSchema,
      headline: nodePresentationSchema,
    })
    .optional(),
  /** M8 — shared presentation controls. */
  presentation: sectionPresentationSchema,
});

export type TestimonialsTrioV1 = z.infer<typeof testimonialsTrioSchemaV1>;
export type TestimonialsTrioItem = z.infer<typeof testimonialItemSchema>;

export const testimonialsTrioSchemasByVersion = {
  1: testimonialsTrioSchemaV1,
} as const;
