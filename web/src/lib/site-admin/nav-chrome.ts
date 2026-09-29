/**
 * Shared Header navigation style (`navChrome`).
 *
 * Geometry / placement of site nav — distinct from visual header themes
 * (`shell.header-variant`, `site_header.variant`). Default `top_bar` keeps
 * every existing tree byte-identical until an operator or Design stamps a
 * different mode.
 *
 * Used by builder `nav` props (Design kit shells) and `site_header`
 * sectionProps (Max / standard shells). Not Maison-only.
 */

export const NAV_CHROME_STYLES = [
  "top_bar",
  "overlay",
  "side_rail",
  "bottom_tab",
  "filter_bar",
  "chapter_dots",
] as const;

export type NavChromeStyle = (typeof NAV_CHROME_STYLES)[number];

export const DEFAULT_NAV_CHROME: NavChromeStyle = "top_bar";

/** Operator-facing labels (EN). Keep short; no em dashes. */
export const NAV_CHROME_LABELS: Readonly<Record<NavChromeStyle, string>> = {
  top_bar: "Top bar",
  overlay: "Overlay",
  side_rail: "Side rail",
  bottom_tab: "Bottom tabs",
  filter_bar: "Filter bar",
  chapter_dots: "Chapter dots",
};

export const NAV_CHROME_HELPERS: Readonly<Record<NavChromeStyle, string>> = {
  top_bar: "Classic sticky bar with inline links.",
  overlay: "Transparent bar over the hero; solidifies on scroll when set.",
  side_rail: "Fixed vertical section links with scroll-spy.",
  bottom_tab: "Phone tab bar pinned to the bottom edge.",
  filter_bar: "Sticky horizontal chip strip of section anchors.",
  chapter_dots: "Phone dots with text labels for each chapter.",
};

export function isNavChromeStyle(value: unknown): value is NavChromeStyle {
  return (
    typeof value === "string" &&
    (NAV_CHROME_STYLES as readonly string[]).includes(value)
  );
}

export function normalizeNavChrome(value: unknown): NavChromeStyle {
  return isNavChromeStyle(value) ? value : DEFAULT_NAV_CHROME;
}

/** Modes that light the active section via IntersectionObserver. */
export function navChromeNeedsScrollSpy(chrome: NavChromeStyle): boolean {
  return (
    chrome === "side_rail" ||
    chrome === "bottom_tab" ||
    chrome === "filter_bar" ||
    chrome === "chapter_dots"
  );
}
