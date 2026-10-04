/**
 * H-4 section switcher: the pure parts (no DOM, no React), so the scroll-spy
 * rule, the index label and the link filter are unit-tested on their own.
 */

export interface SwitcherLink {
  label: string;
  href: string;
}

/** The reading line, as a fraction of the viewport height, below the sticky header. */
export const SWITCHER_LINE_RATIO = 0.3;

/** "03": the section's 1-based position, two digits. */
export function sectionIndexLabel(index: number): string {
  return String(Math.max(0, index) + 1).padStart(2, "0");
}

/** The fragment of an in-page link (`#services` gives `services`), else null. */
export function hashTargetOf(href: string): string | null {
  return href.startsWith("#") && href.length > 1 ? href.slice(1) : null;
}

/** Keep only links that point at an in-page anchor; everything else cannot be spied on. */
export function switcherLinksFrom(links: ReadonlyArray<SwitcherLink>): SwitcherLink[] {
  return links.filter((l) => l.label.trim().length > 0 && hashTargetOf(l.href) !== null);
}

/** The anchor the hero band carries (`stampHero` in the section kit). */
export const SWITCHER_HOME_ANCHOR = "hero";

/**
 * The first entry of the switcher is the top of the page ("01 Inicio" / "01
 * Home"), so the bar names the hero at scroll 0 instead of the first menu
 * section. Skipped when a link already points at the hero. The SectionSwitcher
 * drops it again on pages that have no `#hero` anchor.
 */
export function withSwitcherHome(links: ReadonlyArray<SwitcherLink>, homeLabel: string): SwitcherLink[] {
  const homeHref = `#${SWITCHER_HOME_ANCHOR}`;
  if (links.some((l) => l.href === homeHref)) return [...links];
  return [{ label: homeLabel, href: homeHref }, ...links];
}

/**
 * Scroll-spy: the active section is the LAST one whose top has reached the
 * reading line; before the first one does, nothing is active (the switcher then
 * shows the first link). `tops` are viewport-relative tops in document order.
 */
export function pickActiveSection(
  tops: ReadonlyArray<{ id: string; top: number }>,
  lineY: number,
): string | null {
  let active: string | null = null;
  for (const entry of tops) {
    if (entry.top <= lineY) active = entry.id;
  }
  return active;
}

/** Animation direction when the active index changes: scrolling down slides the name up. */
export function switchDirection(from: number, to: number): "up" | "down" {
  return to >= from ? "up" : "down";
}
