/**
 * TUL-516 F1–F5 — shared floating-UI stacking + safe-area clearance (theme/chrome core).
 *
 * Layers that share the phone bottom corner (cookie banner, language strip,
 * sticky booking bar, chat FAB, help teaser) must coordinate from ONE place so
 * every theme inherits the same rules. Per-talent patches are out of scope.
 *
 * Stack (bottom → top): sticky bar (80) / dock (81) → chat FAB (95) → help
 * teaser (97) → consent (98). Modals stay above (120). Language suggestion is
 * an in-flow top row (TUL-394), never a fixed bottom overlay.
 */

import { GUEST_CHAT_LAUNCHER_CLEARANCE_PX } from "@/app/t/[profileCode]/_chat/launcher-clearance";
import { STICKY_BAR_DEFAULT_RESERVE_PX } from "@/lib/talent-site/sticky-bar-visibility";

/** Consent owns the corner while open; above the chat FAB so Aceptar stays tappable (F2). */
export const FLOATING_CHROME_CONSENT_Z = 98;

/** Approximate consent card height used for body clearance on legal pages (F1). */
export const CONSENT_BANNER_RESERVE_PX = 220;

/** Lower band of the viewport where a help teaser must not cover filter chips (F4). */
export const HELP_BUBBLE_FILTER_BAND_RATIO = 0.55;

export const CONSENT_BANNER_SELECTOR = "[data-consent-banner]";
export const LOCALE_SUGGESTION_SELECTOR = "[data-locale-suggestion]";
export const CATALOG_FILTER_NAV_SELECTOR = ".site-builder-node--services-catalog-nav";

/**
 * Root CSS for every public page (mounted from the root layout). Catalog and
 * chat islands may refine bar/launcher specifics; they must not override the
 * `max()` bottom reserve with a smaller fixed padding.
 */
export const FLOATING_CHROME_STACK_CSS = `
body:has(${CONSENT_BANNER_SELECTOR}) ${LOCALE_SUGGESTION_SELECTOR}{display:none}
body:has([role="dialog"][aria-modal="true"]) ${CONSENT_BANNER_SELECTOR},body:has([role="dialog"][aria-modal="true"]) ${LOCALE_SUGGESTION_SELECTOR}{display:none}
body:has(${CONSENT_BANNER_SELECTOR}) [data-guest-chat-launcher]{opacity:0;visibility:hidden;pointer-events:none}
body:has(${CONSENT_BANNER_SELECTOR}) [data-help-bubble]{display:none!important}
:root{--cb-bar-h:0px;--floating-launcher-clearance:0px;--floating-consent-clearance:0px;--floating-chrome-bottom:max(var(--cb-bar-h),var(--floating-launcher-clearance),var(--floating-consent-clearance),env(safe-area-inset-bottom,0px))}
body:has(${CONSENT_BANNER_SELECTOR}){--floating-consent-clearance:calc(${CONSENT_BANNER_RESERVE_PX}px + env(safe-area-inset-bottom,0px))}
@media (max-width:480px){body:has([data-guest-chat-launcher]){--floating-launcher-clearance:calc(${GUEST_CHAT_LAUNCHER_CLEARANCE_PX}px + env(safe-area-inset-bottom,0px))}}
body{padding-bottom:var(--floating-chrome-bottom)}
`.replace(/\n/g, "");

/** Catalog island: default phone bar reserve + hide-at-top. Bottom padding lives in FLOATING_CHROME_STACK_CSS. */
export const CATALOG_BAR_RESERVE_CSS = `
:root{--cb-bar-h:calc(${STICKY_BAR_DEFAULT_RESERVE_PX}px + env(safe-area-inset-bottom,0px))}
@media (min-width:720px){:root{--cb-bar-h:0px}}
.cb-bar{transition:opacity .2s ease,visibility .2s}
.cb-bar[data-top="true"]{opacity:0;visibility:hidden;pointer-events:none}
@media (prefers-reduced-motion:reduce){.cb-bar{transition:none}}
`.replace(/\n/g, "");

/** Dock/bar still hide banners while booking chrome owns the bottom (kept next to booking CSS consumers). */
export const BOOKING_CHROME_BANNER_YIELD_CSS =
  `body:has(.cb-dock[data-show="true"]) ${CONSENT_BANNER_SELECTOR},body:has(.cb-bar[data-show="true"]:not([data-top="true"])) ${CONSENT_BANNER_SELECTOR},body:has(.cb-dock[data-show="true"]) ${LOCALE_SUGGESTION_SELECTOR},body:has(.cb-bar[data-show="true"]:not([data-top="true"])) ${LOCALE_SUGGESTION_SELECTOR}{display:none}`;

/** True when a consent or language banner is painted (one overlay at a time). */
export function floatingBannerUp(doc: Document): boolean {
  return Array.from(doc.querySelectorAll<HTMLElement>(`${CONSENT_BANNER_SELECTOR}, ${LOCALE_SUGGESTION_SELECTOR}`)).some(
    (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    },
  );
}

/**
 * F4: the "Can I help you choose?" teaser must not sit over category filter chips
 * while those chips occupy the lower band of the phone viewport (jorg rail/chips).
 */
export function helpBubbleFilterNavBlocking(doc: Document, viewportH: number): boolean {
  if (!(viewportH > 0)) return false;
  const bandTop = viewportH * HELP_BUBBLE_FILTER_BAND_RATIO;
  return Array.from(doc.querySelectorAll<HTMLElement>(CATALOG_FILTER_NAV_SELECTOR)).some((el) => {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    return r.bottom > bandTop && r.top < viewportH;
  });
}

/** Bottom padding CSS `max()` must mention every clearance variable (static pin). */
export function floatingChromeBottomUsesMax(css: string): boolean {
  return (
    /--floating-chrome-bottom:max\(/.test(css) &&
    css.includes("--cb-bar-h") &&
    css.includes("--floating-launcher-clearance") &&
    css.includes("--floating-consent-clearance")
  );
}
