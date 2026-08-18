import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";
import { nodePresentationSchema } from "../shared/node-presentation";
import { i18nCopy } from "../shared/i18n-text";
import { pgUuidSchema, publicImagePathOrUrlSchema } from "../../validators";
import { linkRefOrLegacy, optionalLinkRefOrLegacy } from "../../links/link-ref";

/**
 * One hero slide. When `slides` has a single entry the hero renders as a
 * static composition; with 2+ entries it renders as an auto-advancing CSS
 * slider with scroll-snap fallback.
 *
 * A slide's copy is optional: when omitted the slide is rendered purely as
 * a background frame (useful for lifestyle photo reels).
 */
const heroSlideSchema = z.object({
  eyebrow: i18nCopy(80).optional(),
  headline: i18nCopy(140).optional(),
  subheadline: i18nCopy(240).optional(),
  /** Media-library asset (M5). Component resolves the URL from tenant media. */
  backgroundMediaAssetId: pgUuidSchema().optional(),
  /**
   * Absolute URL (media library, unsplash, etc.) OR a root-relative path
   * into `public/` (seeded starter imagery — host-agnostic). Used when no
   * asset id. Widening only — every previously-valid value still parses.
   */
  backgroundImageUrl: publicImagePathOrUrlSchema().optional(),
  /** Phase 10 — alt text for screen-readers. Optional; empty = decorative. */
  backgroundImageAlt: z.string().max(200).optional(),
  /** 0–100; how dark the photographic scrim renders over the image. */
  overlayOpacity: z.number().int().min(0).max(100).optional(),
});

export const heroSchemaV1 = z.object({
  headline: i18nCopy(140, { min: 1 }),
  subheadline: i18nCopy(240).optional(),
  search: z
    .object({
      placeholder: z.string().min(1).max(120),
      buttonLabel: z.string().min(1).max(40).optional(),
      actionHref: z.string().min(1).max(500).optional(),
    })
    .optional(),
  categoryChips: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        /** 6C — structured LinkRef; legacy string auto-coerced. */
        href: optionalLinkRefOrLegacy,
      }),
    )
    .max(12)
    .optional(),
  primaryCta: z
    .object({
      label: z.string().min(1).max(60),
      /** 6C — structured LinkRef; legacy string auto-coerced. */
      href: linkRefOrLegacy,
    })
    .optional(),
  secondaryCta: z
    .object({
      label: z.string().min(1).max(60),
      /** 6C — structured LinkRef; legacy string auto-coerced. */
      href: linkRefOrLegacy,
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
  /**
   * P7B — Layout variant. Spatial composition for the hero copy + media.
   *   - "centered"    (default): headline + subheadline + CTAs centered;
   *                              background is full-bleed image or scrim
   *   - "split-left":  background image / media on the LEFT, copy on RIGHT
   *   - "split-right": copy on the LEFT, background image on the RIGHT
   *
   * Emitted as `data-hero-layout` on the container so CSS / tenant brand
   * stylesheets can target each variant. Component rendering applies a
   * grid template based on the variant for the desktop breakpoint;
   * mobile collapses to a single column.
   */
  layout: z.enum(["centered", "split-left", "split-right"]).optional(),
  /** Auto-advancing image reel. Up to 8 slides; 2+ triggers slider render. */
  slides: z.array(heroSlideSchema).max(8).optional(),
  /** Per-slide duration in ms (2s–20s). Applied as CSS animation-duration. */
  autoplayMs: z.number().int().min(2000).max(20000).optional(),
  /** Optional child-node-level layout/style overrides (Phase 4 bridge). */
  nodePresentation: z
    .object({
      headline: nodePresentationSchema,
      subheadline: nodePresentationSchema,
      primaryCta: nodePresentationSchema,
      secondaryCta: nodePresentationSchema,
    })
    .optional(),
  /** M8 — shared presentation controls. */
  presentation: sectionPresentationSchema,
});

export type HeroV1 = z.infer<typeof heroSchemaV1>;
export type HeroSlide = z.infer<typeof heroSlideSchema>;

export const heroSchemasByVersion = {
  1: heroSchemaV1,
} as const;
