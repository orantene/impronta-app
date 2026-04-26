import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";
import { pgUuidSchema } from "../../validators";

/**
 * CTA banner — the emotional conversion block that usually lives right
 * before the footer. Three variants:
 *   - centered-overlay : big headline + copy over a lifestyle image
 *   - split-image      : image left / text+CTAs right (or reverse)
 *   - minimal-band     : solid band, no image, bold type
 */

const ctaSchema = z.object({
  label: z.string().min(1).max(60),
  href: z.string().min(1).max(500),
});

export const ctaBannerSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().min(1).max(160),
  copy: z.string().max(320).optional(),
  /** Italic serif reassurance line below CTAs. */
  reassurance: z.string().max(120).optional(),

  primaryCta: ctaSchema.optional(),
  secondaryCta: ctaSchema.optional(),

  /** Background image — asset id or absolute URL. */
  backgroundMediaAssetId: pgUuidSchema().optional(),
  backgroundImageUrl: z.string().url().max(2048).optional(),
  /** Phase 10 — alt text for screen-readers. */
  backgroundImageAlt: z.string().max(200).optional(),
  /** 0..100 — overlay darkness over the image. */
  overlayOpacity: z.number().int().min(0).max(100).optional(),

  variant: z
    .enum(["centered-overlay", "split-image", "minimal-band"])
    .default("centered-overlay"),
  /** Side the image renders on (split-image only). */
  imageSide: z.enum(["left", "right"]).default("right"),
  /** Surface tone when variant = minimal-band. */
  bandTone: z.enum(["ivory", "champagne", "espresso", "blush"]).default("ivory"),
  /** Wrap the banner in an inset card? (Muse Bridal uses this.) */
  insetCard: z.boolean().default(true),
  /** M8 — shared presentation controls. */
  presentation: sectionPresentationSchema,
});

export type CtaBannerV1 = z.infer<typeof ctaBannerSchemaV1>;

export const ctaBannerSchemasByVersion = {
  1: ctaBannerSchemaV1,
} as const;
