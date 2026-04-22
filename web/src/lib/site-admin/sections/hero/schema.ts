import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";
import { pgUuidSchema } from "../../validators";

/**
 * One hero slide. When `slides` has a single entry the hero renders as a
 * static composition; with 2+ entries it renders as an auto-advancing CSS
 * slider with scroll-snap fallback.
 *
 * A slide's copy is optional: when omitted the slide is rendered purely as
 * a background frame (useful for lifestyle photo reels).
 */
const heroSlideSchema = z.object({
  eyebrow: z.string().max(80).optional(),
  headline: z.string().max(140).optional(),
  subheadline: z.string().max(240).optional(),
  /** Media-library asset (M5). Component resolves the URL from tenant media. */
  backgroundMediaAssetId: pgUuidSchema().optional(),
  /** Absolute URL (for seeded hosts, unsplash, etc.). Used when no asset id. */
  backgroundImageUrl: z.string().url().max(2048).optional(),
  /** 0–100; how dark the photographic scrim renders over the image. */
  overlayOpacity: z.number().int().min(0).max(100).optional(),
});

export const heroSchemaV1 = z.object({
  headline: z.string().min(1).max(140),
  subheadline: z.string().max(240).optional(),
  primaryCta: z
    .object({
      label: z.string().min(1).max(60),
      href: z.string().min(1).max(500),
    })
    .optional(),
  secondaryCta: z
    .object({
      label: z.string().min(1).max(60),
      href: z.string().min(1).max(500),
    })
    .optional(),
  backgroundMediaAssetId: pgUuidSchema().optional(),

  // ---- lifestyle / slider extensions (added without a version bump:
  // every field here is optional and defaulting renders the classic M0
  // hero, so legacy rows keep parsing) ---------------------------------
  /** Visual treatment behind the hero copy. */
  overlay: z
    .enum(["none", "gradient-scrim", "aurora", "soft-vignette"])
    .optional(),
  /** Editorial rhythm preset. Drives type scale + spacing. */
  mood: z.enum(["clean", "editorial", "cinematic"]).optional(),
  /** Auto-advancing image reel. Up to 8 slides; 2+ triggers slider render. */
  slides: z.array(heroSlideSchema).max(8).optional(),
  /** Per-slide duration in ms (2s–20s). Applied as CSS animation-duration. */
  autoplayMs: z.number().int().min(2000).max(20000).optional(),
  /** M8 — shared presentation controls. */
  presentation: sectionPresentationSchema,
});

export type HeroV1 = z.infer<typeof heroSchemaV1>;
export type HeroSlide = z.infer<typeof heroSlideSchema>;

export const heroSchemasByVersion = {
  1: heroSchemaV1,
} as const;
