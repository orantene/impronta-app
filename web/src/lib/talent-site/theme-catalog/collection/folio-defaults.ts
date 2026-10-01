/**
 * Folio Design = DEFAULTS only (editable tokens / component styles).
 *
 * Look owns colour + type faces. Design owns shape (square buttons, sharp
 * radius, editorial spacing, no shadow) and shell nav font. Talent can change
 * every key in the theme panel or per-block; "Reset to design default"
 * restores this map.
 *
 * `FOLIO_STYLE_TOKEN_DEFAULTS` go on `DesignPayload.tokenDefaults` (style-token
 * allow-list). `FOLIO_REGISTRY_TOKEN_DEFAULTS` are ordinary registry keys
 * applied via `designTokenDefaults("folio")` at resolve time.
 */
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";

export const FOLIO_HEADING_FONT = "Instrument Serif, Didot, Georgia, serif";
export const FOLIO_BODY_FONT = "Archivo, system-ui, sans-serif";
/** Label / tracked-caps face. Stored on existing `shell.header-nav-font` until a label role token exists. */
export const FOLIO_LABEL_FONT = "Archivo Narrow, Arial Narrow, system-ui, sans-serif";

/** Style-token defaults (validateDesign allow-list / theme Style tab). */
export const FOLIO_STYLE_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "type.system": "magazine",
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
  // Type scale (TH02): every size is an editable token and the default is the mockup's.
  // Section / rate card titles 44px; hero name 105px on desktop (capped so it always fits
  // the frame); chapter titles 38px; closing statement 64px at every width.
  "type.section-title-size": "44px",
  "type.section-title-size-desktop": "44px",
  "type.hero-size-desktop": "105px",
  "type.group-title-size": "38px",
  "type.group-title-size-desktop": "38px",
  "type.footer-title-size": "64px",
  "type.footer-title-size-desktop": "64px",
};

/** Non-style registry defaults (radius / spacing / shadow / shell). */
export const FOLIO_REGISTRY_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "radius.base": "none",
  "radius.scale-preset": "sharp",
  "spacing.scale": "editorial",
  "shadow.preset": "none",
  "shell.header-nav-font": FOLIO_LABEL_FONT,
};

/** Full Design default map used by `designTokenDefaults("folio")`. */
export const FOLIO_DESIGN_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  ...FOLIO_STYLE_TOKEN_DEFAULTS,
  ...FOLIO_REGISTRY_TOKEN_DEFAULTS,
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
