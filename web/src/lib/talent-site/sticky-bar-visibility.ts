/**
 * TUL-344 (2026-10-08): the phone sticky "Reservar cita" bar must not sit over the hero or over
 * in-flow content. ONE rule for every theme and bar style (pill, float, dock):
 *
 * - while the hero's primary booking button is still on screen, the bar is hidden (the hero already
 *   offers the same action);
 * - without a hero button to watch, it appears only after the page has scrolled past a threshold;
 * - it is never hidden while the booking sheet is open, and once the services menu is on screen the
 *   reader is past the hero, so it shows.
 *
 * PURE: the DOM observers live in the island hook, this only decides.
 */

/** Scroll distance (px) after which the bar shows when the page has no hero button to watch. */
export const STICKY_BAR_SCROLL_THRESHOLD_PX = 320;

/** Hero primary booking buttons across the builder heroes; first match wins. */
export const HERO_PRIMARY_CTA_SELECTOR = "[data-hero-primary-cta], .site-bn-hero__btn--primary";

/** Default reserved bottom space (px, before the safe-area inset) until the bar has been measured. */
export const STICKY_BAR_DEFAULT_RESERVE_PX = 86;

export type StickyBarVisibilityInput = {
  scrollY: number;
  /** The hero primary CTA is currently intersecting the viewport. */
  heroCtaVisible: boolean;
  /** A hero primary CTA exists on this page. */
  hasHeroCta: boolean;
  /** The services menu is on screen (at least a third of it). */
  menuInView: boolean;
  sheetOpen: boolean;
};

export function stickyBarVisible(input: StickyBarVisibilityInput): boolean {
  if (input.sheetOpen) return true;
  if (input.menuInView) return true;
  if (input.hasHeroCta) return !input.heroCtaVisible;
  return input.scrollY >= STICKY_BAR_SCROLL_THRESHOLD_PX;
}

/** Bottom space to reserve: the bar's height plus its bottom offset, or 0 while it is not displayed. */
export function stickyBarReservePx(input: { displayed: boolean; heightPx: number; bottomPx: number }): number {
  if (!input.displayed || !(input.heightPx > 0)) return 0;
  return Math.ceil(input.heightPx + Math.max(0, input.bottomPx || 0));
}
