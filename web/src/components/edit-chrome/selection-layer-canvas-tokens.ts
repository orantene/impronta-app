/**
 * selection-layer-canvas-tokens.ts
 *
 * The handful of literal visual constants the canvas selection chrome shares
 * between `selection-layer.tsx` and the modules extracted out of it (starting
 * with `canvas-node-children-panel.tsx`). Lifted verbatim so the extraction is
 * a pure move: no value changed, and there is still exactly ONE definition of
 * each so the panel and the layer can never drift apart.
 */

/**
 * Blue (#2c5fdb) used only for drop indicators — matches mockup var(--blue).
 * End-cap dots use the 58,123,255 lighter shade for the glow.
 */
export const BLUE = "#2c5fdb";
export const BLUE_RGB = "58,123,255";

export const DROP_LINE_HEIGHT = 4;
export const DROP_LINE_RADIUS = 2;

/**
 * Rounded to match the rest of the editor chrome (topbar popovers + drawers
 * are 8-10px). Floating cards get the standard popover radius.
 */
export const CANVAS_CHROME_RADIUS = 8;
