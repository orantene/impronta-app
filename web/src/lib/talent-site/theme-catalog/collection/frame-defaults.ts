/**
 * Frame Design = DEFAULTS only, ported from the owner original TH08-Frame
 * (1440px screenshot). Every value is an editable token: the builder can
 * change any font, size, colour or shape, and "Reset to design default"
 * restores this map. No hex in components.
 *
 * Read off the screenshot (assumptions are listed in the PR notes):
 *  - display: IBM Plex Sans Condensed, bold, uppercase, tight
 *  - body: IBM Plex Sans; labels, captions and meta: IBM Plex Mono, tracked caps
 *  - square buttons and square frames, 1px rules, a single red accent
 */
export const FRAME_HEADING_FONT = "IBM Plex Sans Condensed, Arial Narrow, system-ui, sans-serif";
export const FRAME_BODY_FONT = "IBM Plex Sans, system-ui, sans-serif";
export const FRAME_LABEL_FONT = "IBM Plex Mono, ui-monospace, Menlo, monospace";

/** Sampled from TH08: warm light-grey page, near-black ink, one red. */
export const FRAME_PALETTE = {
  page: "#E6E6E1",
  surface: "#F5F5F2",
  line: "#CFCFC8",
  ink: "#121212",
  accent: "#D4351C",
  onAccent: "#FFFFFF",
  muted: "#5C5C57",
} as const;

/** Style-token defaults (validateDesign allow-list / theme Style tab). */
export const FRAME_STYLE_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "button.radius": "0px",
  "button.height": "44px",
  "button.padding-x": "18px",
  "button.font-size": "12px",
  "button.font-weight": "600",
  "shape.rule-width": "1px",
  "type.label-size": "11px",
  "type.label-weight": "500",
  "type.label-tracking": "0.12em",
  "type.display-weight": "700",
  "type.display-tracking": "-0.01em",
};

/** Non-style registry defaults (radius / spacing / shadow / shell). */
export const FRAME_REGISTRY_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "radius.base": "none",
  "radius.scale-preset": "sharp",
  "shadow.preset": "none",
  "shell.header-nav-font": FRAME_LABEL_FONT,
};

export const FRAME_DESIGN_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  ...FRAME_STYLE_TOKEN_DEFAULTS,
  ...FRAME_REGISTRY_TOKEN_DEFAULTS,
};
