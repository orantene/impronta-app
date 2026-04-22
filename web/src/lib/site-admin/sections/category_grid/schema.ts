import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

/**
 * Category / service grid — portrait tiles with optional icon, image, label,
 * tagline, and optional link. Powers the "Services" grid in Muse Bridal but
 * generalises to any category navigation (creator verticals, staffing roles,
 * speaker tracks, wellness modalities).
 */

const iconKeySchema = z.enum([
  // editorial-line family
  "brush",
  "scissors",
  "camera",
  "film",
  "clipboard",
  "floral",
  "sparkle",
  "music",
  "ring",
  "pin",
  "calendar",
  "plane",
  // geometric / general-purpose
  "star",
  "circle",
  "square",
  "diamond",
]);

const categoryItemSchema = z.object({
  label: z.string().min(1).max(60),
  tagline: z.string().max(120).optional(),
  /** Icon rendered when image absent (or atop image for editorial mode). */
  iconKey: iconKeySchema.optional(),
  /** Tile image URL (e.g. category cover). */
  imageUrl: z.string().url().max(2048).optional(),
  /** Where the tile links to. */
  href: z.string().max(500).optional(),
});

export const categoryGridSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  copy: z.string().max(320).optional(),
  items: z.array(categoryItemSchema).min(1).max(12),
  /**
   * Layout variant:
   *   - portrait-masonry : editorial portrait tiles with overlay + icon
   *   - horizontal-scroll: single-row scroll rail on mobile; grid on desktop
   *   - small-icon-list  : dense icon grid with no imagery
   */
  variant: z
    .enum(["portrait-masonry", "horizontal-scroll", "small-icon-list"])
    .default("portrait-masonry"),
  /** Columns on desktop (clamped 2–5). */
  columnsDesktop: z.number().int().min(2).max(5).default(4),
  /** Footer CTA link (e.g. "Browse all services"). */
  footerCta: z
    .object({
      label: z.string().min(1).max(60),
      href: z.string().min(1).max(500),
    })
    .optional(),
  /** M8 — shared presentation controls. */
  presentation: sectionPresentationSchema,
});

export type CategoryGridV1 = z.infer<typeof categoryGridSchemaV1>;
export type CategoryGridItem = z.infer<typeof categoryItemSchema>;

export const categoryGridSchemasByVersion = {
  1: categoryGridSchemaV1,
} as const;
