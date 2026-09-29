/**
 * Folio Design = DEFAULTS only (editable tokens / component styles).
 *
 * Look owns colour + type faces. Design owns shape (square buttons, sharp
 * radius, editorial spacing, no shadow) and shell nav font. Talent can change
 * every key in the theme panel or per-block; "Reset to design default"
 * restores this map.
 *
 * Uses EXISTING registry keys only. When Claude's
 * `refactor/design-defaults-editable` lands (typography roles, button shape,
 * rule width, …), rebase onto it — do not invent parallel Folio-only tokens.
 * Magazine CSS already falls back through `--token-typography-label-font-family`
 * / `--token-border-rule-width` so those light up when registered.
 */
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";

export const FOLIO_HEADING_FONT = "Instrument Serif, Didot, Georgia, serif";
export const FOLIO_BODY_FONT = "Archivo, system-ui, sans-serif";
/** Label / tracked-caps face. Stored on existing `shell.header-nav-font` until a label role token exists. */
export const FOLIO_LABEL_FONT = "Archivo Narrow, Arial Narrow, system-ui, sans-serif";

/**
 * Design-owned token defaults (not Look-layer). Keys are all in the shared
 * registry today: radius / spacing / shadow / shell.
 */
export const FOLIO_DESIGN_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  // Magazine type system (replaces slug-keyed Folio skin).
  "type.system": "magazine",
  "radius.base": "none",
  "radius.scale-preset": "sharp",
  "spacing.scale": "editorial",
  "shadow.preset": "none",
  "shell.header-nav-font": FOLIO_LABEL_FONT,
  "button.radius": "0px",
  "button.height": "44px",
  "button.padding-x": "16px",
  "button.font-size": "11px",
  "button.font-weight": "600",
  "shape.rule-width": "1px",
  "type.label-size": "11px",
  "type.label-weight": "600",
  "type.label-tracking": "0.18em",
  "type.display-weight": "400",
  "type.display-tracking": "-0.02em",
  "type.section-title-size": "40px",
  "type.section-title-size-desktop": "72px",
};

/** Look-layer type defaults every Folio palette shares. */
export const FOLIO_LOOK_TYPE_DEFAULTS: Readonly<Record<string, string>> = {
  "typography.heading-font-family": FOLIO_HEADING_FONT,
  "typography.body-font-family": FOLIO_BODY_FONT,
  "typography.label-preset": "uppercase-tracked",
};

/** Square magazine buttons — editable in Theme → Components. */
export const FOLIO_COMPONENT_STYLE_DEFAULTS: ComponentStyleDefaults = {
  button: {
    borderRadius: "0",
  },
};

/** True when the working draft looks like an applied Folio Look (for reset UI). */
export function draftLooksLikeFolio(draft: Readonly<Record<string, string>>): boolean {
  const heading = (draft["typography.heading-font-family"] ?? "").toLowerCase();
  return heading.includes("instrument serif");
}

/** Full token map to restore on "Reset to design default". */
export function folioResetTokenDefaults(lookOrDraft: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = { ...lookOrDraft };
  for (const [key, value] of Object.entries(FOLIO_LOOK_TYPE_DEFAULTS)) out[key] = value;
  for (const [key, value] of Object.entries(FOLIO_DESIGN_TOKEN_DEFAULTS)) out[key] = value;
  return out;
}
