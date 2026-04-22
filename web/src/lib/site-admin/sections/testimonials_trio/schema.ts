import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

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
  quote: z.string().min(1).max(360),
  author: z.string().max(80).optional(),
  context: z.string().max(120).optional(),
  location: z.string().max(120).optional(),
  accent: accentSchema.optional(),
});

export const testimonialsTrioSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  items: z.array(testimonialItemSchema).min(1).max(4),
  /** Layout variant. */
  variant: z
    .enum(["trio-card", "single-hero", "carousel-row"])
    .default("trio-card"),
  /** Default accent when items don't set one. `auto` cycles. */
  defaultAccent: accentSchema.default("auto"),
  /** M8 — shared presentation controls. */
  presentation: sectionPresentationSchema,
});

export type TestimonialsTrioV1 = z.infer<typeof testimonialsTrioSchemaV1>;
export type TestimonialsTrioItem = z.infer<typeof testimonialItemSchema>;

export const testimonialsTrioSchemasByVersion = {
  1: testimonialsTrioSchemaV1,
} as const;
