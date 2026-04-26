import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

const slideSchema = z.object({
  imageUrl: z.string().url().max(2048).optional(),
  imageAlt: z.string().max(200).optional(),
  title: z.string().max(140).optional(),
  caption: z.string().max(280).optional(),
  href: z.string().max(500).optional(),
});

export const scrollCarouselSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  slides: z.array(slideSchema).min(2).max(20),
  /** Card width in vw (5..40). */
  cardWidthVw: z.number().min(5).max(40).default(28),
  showProgress: z.boolean().default(true),
  presentation: sectionPresentationSchema,
});

export type ScrollCarouselV1 = z.infer<typeof scrollCarouselSchemaV1>;
export type ScrollCarouselSlide = z.infer<typeof slideSchema>;
export const scrollCarouselSchemasByVersion = { 1: scrollCarouselSchemaV1 } as const;
