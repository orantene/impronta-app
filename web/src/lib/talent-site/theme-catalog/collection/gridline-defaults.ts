/**
 * Gridline Design = DEFAULTS only (editable tokens), the shape and type layer
 * of the TH16 mockup (`web/design-references/gridline/`). Look owns colour
 * (`gridline-looks.ts`). The talent can change every key in the theme drawer;
 * "Reset to design default" restores this map.
 *
 * Mockup values: Archivo 800 to 850 at 110 to 118% width, JetBrains Mono for
 * specs and labels, 6px buttons, 10px blocks, 1.5px ink rules, highlighter
 * accent words.
 */
export const GRIDLINE_HEADING_FONT = "Archivo, system-ui, sans-serif";
export const GRIDLINE_BODY_FONT = "Archivo, system-ui, sans-serif";
/** The label role. Stored on `shell.header-nav-font` until a label-role token exists (as Folio does). */
export const GRIDLINE_LABEL_FONT = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';

/** Style-token defaults (validateDesign allow-list / theme Style tab). */
export const GRIDLINE_STYLE_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "type.system": "utility",
  "type.accent-style": "highlight",
  "type.display-weight": "850",
  "type.stretch": "118%",
  "type.display-tracking": "-0.03em",
  "type.display-line-height": "1.1",
  "type.hero-size": "34px",
  "type.hero-size-desktop": "60px",
  "type.hero-line-height": "1.14",
  "type.hero-line-height-desktop": "1.12",
  "type.section-title-size": "25px",
  "type.section-title-size-desktop": "40px",
  "type.label-size": "11px",
  "type.label-weight": "500",
  "type.label-tracking": "0.06em",
  "button.radius": "6px",
  "button.height": "44px",
  "button.padding-x": "18px",
  "button.font-size": "14px",
  "button.font-weight": "700",
  "shape.card-radius": "10px",
  "shape.rule-width": "1.5px",
};

/** Non-style registry defaults. */
export const GRIDLINE_REGISTRY_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "shell.header-nav-font": GRIDLINE_LABEL_FONT,
};

/** Full Design default map used by `designTokenDefaults("gridline")`. */
export const GRIDLINE_DESIGN_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  ...GRIDLINE_STYLE_TOKEN_DEFAULTS,
  ...GRIDLINE_REGISTRY_TOKEN_DEFAULTS,
};

/** Look-layer type defaults every Gridline palette shares. */
export const GRIDLINE_LOOK_TYPE_DEFAULTS: Readonly<Record<string, string>> = {
  "typography.heading-font-family": GRIDLINE_HEADING_FONT,
  "typography.body-font-family": GRIDLINE_BODY_FONT,
};
