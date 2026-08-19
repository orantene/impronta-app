/**
 * Which style keys the renderer actually honors at a breakpoint.
 *
 * The panel's viewport toggle routes EVERY control's patch into
 * `responsive[viewport]`. For a key with no responsive lane the value is
 * validated, saved, and read back into the field on reload — and emits
 * nothing. The control looks like it worked; the page never changes. That is
 * the worst kind of editor bug, because the operator's only feedback says yes.
 *
 * This module is the single source of truth both sides read: the renderer's
 * lane list and the panel's "can this be set per breakpoint" question. The
 * static test beside it re-derives the set from `builderNodeStyleAttrs` and
 * fails if the two ever drift, so adding a lane without updating this list
 * (or vice versa) is a red build rather than a silent regression.
 */

import type { BuilderNodeStyleValue } from "./types";

export type BuilderNodeStyleKey = keyof BuilderNodeStyleValue;

/**
 * Keys with a full tablet AND mobile lane (presence attribute + CSS custom
 * property + `@media` rule). Derived from the renderer, pinned by test.
 */
export const RESPONSIVE_PLUMBED_KEYS: ReadonlySet<string> = new Set([
  "accentColor", "align", "alignItems", "alignSelf", "aspectRatio",
  "aspectRatioFree", "backdropFilter", "background", "backgroundColor",
  "backgroundImage", "borderColor", "borderRadius", "borderStyle",
  "borderWidth", "bottom", "boxShadow", "caretColor", "clipPath", "cursor",
  "filter", "flexBasis", "flexGrow", "flexShrink", "flexWrap", "fontFamily",
  "fontSize", "fontStyle", "fontWeight", "gap", "gridAutoFlow", "gridColumn",
  "gridRow", "gridTemplateColumns", "gridTemplateRows", "height",
  "justifyContent", "left", "letterSpacing", "lineHeight", "marginBottom",
  "marginBottomFree", "marginLeftFree", "marginRightFree", "marginTop",
  "marginTopFree", "maskImage", "maxHeight", "maxWidth", "maxWidthFree",
  "minHeight", "minWidth", "mixBlendMode", "objectFit", "objectPosition",
  "opacity", "order", "outline", "outlineOffset", "overflow", "paddingBottom",
  "paddingLeft", "paddingRight", "paddingTop", "paddingX", "paddingY",
  "pointerEvents", "position", "radius", "right", "rotate", "scale",
  "scrollSnapAlign", "scrollSnapType", "size", "textColor", "textDecoration",
  "textShadow", "textStroke", "textTransform", "tone", "top",
  "transformOrigin", "translate", "userSelect", "visibility", "width",
  "zIndex",
]);

/**
 * True when this key can be set per breakpoint. Everything else is a
 * DESKTOP-ONLY setting: authoring it at a breakpoint is a no-op, so the panel
 * disables the control there and says why instead of accepting a value that
 * will never render.
 */
export function isResponsivePlumbedStyleKey(key: string): boolean {
  return RESPONSIVE_PLUMBED_KEYS.has(key);
}

/** Shown on a disabled control so the operator knows it is not broken. */
export const DESKTOP_ONLY_STYLE_HINT =
  "This one is set once for every screen size — switch to Desktop to change it.";
