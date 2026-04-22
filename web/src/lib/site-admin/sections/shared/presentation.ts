/**
 * M8 — SectionPresentation: shared sub-schema inherited by every section.
 *
 * One extension point, 8 per-section controls:
 *   - background       neutral-to-espresso palette toggle
 *   - paddingTop       section vertical rhythm (top)
 *   - paddingBottom    section vertical rhythm (bottom)
 *   - containerWidth   narrow / standard / wide / editorial / full-bleed
 *   - align            left / center / right (applies to headings + copy)
 *   - dividerTop       none / thin-line / gradient-fade / decorative
 *   - mobileStack      default / single-column / horizontal-scroll
 *   - visibility       always / desktop-only / mobile-only / hidden
 *
 * Every field is optional so legacy section instances continue to parse.
 * The component reads the presentation object and sets data attributes;
 * `token-presets.css` maps the attrs onto CSS rules that work across all
 * section types without per-section CSS duplication.
 *
 * Why optional?
 *   - Backward compat: existing saved sections must keep rendering.
 *   - Theme presets control defaults — when a tenant picks Editorial Bridal,
 *     storefront CSS fills in "editorial" padding/container automatically.
 */

import { z } from "zod";

export const sectionPresentationSchema = z
  .object({
    background: z
      .enum([
        "canvas",       // follows the tenant's background.mode (default)
        "ivory",
        "champagne",
        "espresso",
        "blush",
        "sage",
        "muted-surface",
      ])
      .optional(),

    paddingTop: z
      .enum(["none", "tight", "standard", "airy", "editorial"])
      .optional(),
    paddingBottom: z
      .enum(["none", "tight", "standard", "airy", "editorial"])
      .optional(),

    containerWidth: z
      .enum(["narrow", "standard", "wide", "editorial", "full-bleed"])
      .optional(),

    align: z.enum(["left", "center", "right"]).optional(),

    dividerTop: z
      .enum(["none", "thin-line", "gradient-fade", "decorative"])
      .optional(),

    mobileStack: z
      .enum(["default", "single-column", "horizontal-scroll"])
      .optional(),

    visibility: z
      .enum(["always", "desktop-only", "mobile-only", "hidden"])
      .optional(),
  })
  .optional();

export type SectionPresentation = z.infer<typeof sectionPresentationSchema>;

/**
 * Flatten a SectionPresentation object into a Record of HTML data attributes.
 * Call this in every section Component and spread into the root element.
 *
 * Resulting attrs are consumed by `token-presets.css`:
 *   [data-section-background="champagne"] → champagne gradient
 *   [data-section-padding-top="editorial"] → clamp section_y
 *   ...etc.
 */
export function presentationDataAttrs(
  p?: SectionPresentation,
): Record<string, string> {
  if (!p) return {};
  const out: Record<string, string> = {};
  if (p.background) out["data-section-background"] = p.background;
  if (p.paddingTop) out["data-section-padding-top"] = p.paddingTop;
  if (p.paddingBottom) out["data-section-padding-bottom"] = p.paddingBottom;
  if (p.containerWidth) out["data-section-container"] = p.containerWidth;
  if (p.align) out["data-section-align"] = p.align;
  if (p.dividerTop) out["data-section-divider-top"] = p.dividerTop;
  if (p.mobileStack) out["data-section-mobile-stack"] = p.mobileStack;
  if (p.visibility) out["data-section-visibility"] = p.visibility;
  return out;
}

/**
 * Labels for the admin editor — single source of truth for copy across
 * every section's presentation panel.
 */
export const PRESENTATION_FIELD_LABELS = {
  background: "Background",
  paddingTop: "Padding (top)",
  paddingBottom: "Padding (bottom)",
  containerWidth: "Container width",
  align: "Alignment",
  dividerTop: "Top divider",
  mobileStack: "Mobile layout",
  visibility: "Visibility",
} as const;

export const PRESENTATION_OPTIONS = {
  background: [
    { value: "canvas", label: "Match canvas (default)" },
    { value: "ivory", label: "Ivory" },
    { value: "champagne", label: "Champagne" },
    { value: "espresso", label: "Espresso (dark)" },
    { value: "blush", label: "Blush" },
    { value: "sage", label: "Sage" },
    { value: "muted-surface", label: "Muted surface" },
  ],
  paddingTop: [
    { value: "none", label: "None" },
    { value: "tight", label: "Tight" },
    { value: "standard", label: "Standard" },
    { value: "airy", label: "Airy" },
    { value: "editorial", label: "Editorial" },
  ],
  paddingBottom: [
    { value: "none", label: "None" },
    { value: "tight", label: "Tight" },
    { value: "standard", label: "Standard" },
    { value: "airy", label: "Airy" },
    { value: "editorial", label: "Editorial" },
  ],
  containerWidth: [
    { value: "narrow", label: "Narrow (880px)" },
    { value: "standard", label: "Standard (1120px)" },
    { value: "wide", label: "Wide (1280px)" },
    { value: "editorial", label: "Editorial (1240px + 48px gutter)" },
    { value: "full-bleed", label: "Full-bleed (100%)" },
  ],
  align: [
    { value: "left", label: "Left" },
    { value: "center", label: "Center" },
    { value: "right", label: "Right" },
  ],
  dividerTop: [
    { value: "none", label: "None" },
    { value: "thin-line", label: "Thin line" },
    { value: "gradient-fade", label: "Gradient fade" },
    { value: "decorative", label: "Decorative" },
  ],
  mobileStack: [
    { value: "default", label: "Default (stack)" },
    { value: "single-column", label: "Single column" },
    { value: "horizontal-scroll", label: "Horizontal scroll" },
  ],
  visibility: [
    { value: "always", label: "Always visible" },
    { value: "desktop-only", label: "Desktop only" },
    { value: "mobile-only", label: "Mobile only" },
    { value: "hidden", label: "Hidden" },
  ],
} as const;
