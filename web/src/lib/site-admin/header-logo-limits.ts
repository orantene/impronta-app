/**
 * Platform limits for an owner logo in EVERY public header template:
 * the `site_header` section (`.site-header__brand-mark`), the kit-shell row
 * header (a builder `image` node), and the `utility_bar` brand tile.
 *
 * Height-led so a wide wordmark keeps its proportions and a square mark never
 * shrinks to a favicon. `app/token-presets.css` repeats these literals (plain
 * CSS cannot import TS); `header-brand-mark-size.static.test.ts` keeps it in sync.
 */
export const HEADER_LOGO_LIMITS = {
  height: "clamp(36px, 3.2vw, 44px)",
  minHeightPx: 30,
  maxHeightPx: 72,
  maxWidth: "min(240px, 50vw)",
} as const;

/**
 * Declarations a header logo `<img>` gets; `important` beats a builder node's
 * inline width/fit. Width is `fit-content`, not `auto`: a kit header row
 * collapses to a stretch column on phones, which widens an auto-width image.
 */
export function headerLogoDeclarations(important = false): string {
  const i = important ? "!important" : "";
  const L = HEADER_LOGO_LIMITS;
  return [
    `width:fit-content${i}`,
    `height:${L.height}`,
    `min-height:${L.minHeightPx}px${i}`,
    `max-height:${L.maxHeightPx}px${i}`,
    `max-width:${L.maxWidth}${i}`,
    `object-fit:contain${i}`,
    `aspect-ratio:auto${i}`,
  ].join(";");
}
