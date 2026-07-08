/**
 * Map a design-token `background.mode` to the page's light/dark polarity (AIQ-12).
 *
 * Derived from each mode's base `--token-color-background` in token-presets.css:
 * the four dark palettes set a near-black canvas (editorial-noir #0a0a0a,
 * espresso #1a1410, mesh-noir #0c0c0e, noir-or #0b0a0d); every other mode sets a
 * light canvas or inherits the white `:root` default. Feeding the resolved
 * polarity to the generator lets it invert a deliberate color band into a
 * guaranteed-readable pairing instead of gambling on an unknown polarity.
 */
export type BackgroundPolarity = "light" | "dark";

/** Modes whose base `--token-color-background` is near-black (see token-presets.css). */
export const DARK_BACKGROUND_MODES: ReadonlySet<string> = new Set([
  "editorial-noir",
  "espresso",
  "mesh-noir",
  "noir-or",
]);

/**
 * Classify a `background.mode` value. Unknown/undefined → undefined (the caller
 * says "polarity unknown" rather than guessing); any other known mode → light
 * (the `:root` canvas is white). Every enum value must classify — the drift test
 * in polarity.test.ts fails CI if a newly added mode is left unclassified.
 */
export function backgroundModeToPolarity(mode: unknown): BackgroundPolarity | undefined {
  if (typeof mode !== "string" || mode.length === 0) return undefined;
  return DARK_BACKGROUND_MODES.has(mode) ? "dark" : "light";
}
