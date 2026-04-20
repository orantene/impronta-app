/**
 * Phase 5 / M1 — agency_branding Zod schema (basics only).
 *
 * M1 covers the "branding basics" surface:
 *   - logo / logo_dark / favicon / og_image (media asset ids)
 *   - primary / secondary / accent / neutral color (hex)
 *   - font_preset / heading_font / body_font (free-text; presets validated M6)
 *
 * The token registry + `theme_json` editor ship with M6. M1 writes DO NOT
 * touch theme_json; the column stays '{}'::jsonb unless the tenant opts into
 * M6 design controls later.
 *
 * Concurrency: `expectedVersion` is required on every upsert.
 */

import { z } from "zod";

// Hex color `#rgb` or `#rrggbb`. DB CHECK on secondary_color enforces the
// 6-char form; the Zod layer accepts both for UX, then normalizes to lowercase
// 6-char — transform output stays aligned with the stricter storage form.
const hexColorOptional = z
  .union([
    z.literal(""),
    z
      .string()
      .trim()
      .regex(
        /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
        "Color must be a hex value like #1a2b3c",
      ),
  ])
  .transform((v) => {
    if (v === "" || v == null) return null;
    // Expand shorthand #abc -> #aabbcc and lowercase.
    if (/^#[0-9a-fA-F]{3}$/.test(v)) {
      const [, r, g, b] = v.match(/^#(.)(.)(.)$/)!;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return v.toLowerCase();
  })
  .nullable()
  .optional();

const uuidOptional = z
  .union([z.literal(""), z.string().uuid()])
  .transform((v) => (v === "" ? null : v ?? null))
  .nullable()
  .optional();

const trimmedOptional = (max = 240) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const brandingFormSchema = z.object({
  // Colors -------------------------------------------------------------------
  primaryColor: hexColorOptional,
  secondaryColor: hexColorOptional,
  accentColor: hexColorOptional,
  neutralColor: hexColorOptional,

  // Media --------------------------------------------------------------------
  logoMediaAssetId: uuidOptional,
  logoDarkMediaAssetId: uuidOptional,
  faviconMediaAssetId: uuidOptional,
  ogImageMediaAssetId: uuidOptional,

  // Typography (free-text placeholders; M6 will switch to registry-validated) -
  fontPreset: trimmedOptional(60),
  headingFont: trimmedOptional(120),
  bodyFont: trimmedOptional(120),

  // Concurrency --------------------------------------------------------------
  expectedVersion: z.number().int().min(0),
});

export type BrandingFormInput = z.input<typeof brandingFormSchema>;
export type BrandingFormValues = z.output<typeof brandingFormSchema>;
