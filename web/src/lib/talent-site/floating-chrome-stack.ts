/**
 * TUL-516 F1–F5 + TUL-528 (GRK-033/034/039) — shared floating-UI stacking +
 * safe-area clearance (theme/chrome core).
 *
 * Layers that share the phone bottom corner (cookie banner, language strip,
 * sticky booking bar, chat FAB, help teaser) must coordinate from ONE place so
 * every theme inherits the same rules. Per-talent patches are out of scope.
 *
 * Stack (bottom → top): sticky bar (80) / dock (81) → chat FAB (95) → help
 * teaser (97) → consent (98). Modals stay above (120). Language suggestion is
 * an in-flow top row (TUL-394), never a fixed bottom overlay.
 *
 * TUL-528:
 * - GRK-033: hero first-viewport CTAs clear the consent card (pad hero chrome).
 * - GRK-034: catalog/footer bottom reserve follows --cb-bar-h on phone + desktop
 *   while the bar/dock is painted (not a hardcoded 72px undershoot).
 * - GRK-039: guest chat panels use aria-modal=false; consent yields to
 *   [data-guest-chat-panel] so the message box stays reachable.
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
/** Open guest chat shell (MiniChat / CardDock / Expanded). aria-modal is false by design. */
export const GUEST_CHAT_PANEL_SELECTOR = "[data-guest-chat-panel]";

const BAR_RESERVE = `calc(${STICKY_BAR_DEFAULT_RESERVE_PX}px + env(safe-area-inset-bottom,0px))`;

/**
 * Root CSS for every public page (mounted from the root layout). Catalog and
 * chat islands may refine bar/launcher specifics; they must not override the
 * `max()` bottom reserve with a smaller fixed padding.
 */
export const FLOATING_CHROME_STACK_CSS = `
body:has(${CONSENT_BANNER_SELECTOR}) ${LOCALE_SUGGESTION_SELECTOR}{display:none}
body:has([role="dialog"][aria-modal="true"]) ${CONSENT_BANNER_SELECTOR},body:has([role="dialog"][aria-modal="true"]) ${LOCALE_SUGGESTION_SELECTOR}{display:none}
body:has(${GUEST_CHAT_PANEL_SELECTOR}) ${CONSENT_BANNER_SELECTOR},body:has(${GUEST_CHAT_PANEL_SELECTOR}) ${LOCALE_SUGGESTION_SELECTOR}{display:none}
/* Visually tuck the FAB under the cookie card without visibility:hidden —
   that removed the dock from the accessibility tree (W4-5 / TUL-516 L a11y).
   Consent stays z-98 so Aceptar wins the pointer; opacity + pointer-events
   keep the FAB from painting over it for sighted users. */
body:has(${CONSENT_BANNER_SELECTOR}) [data-guest-chat-launcher]{opacity:0;pointer-events:none}
body:has(${CONSENT_BANNER_SELECTOR}) [data-help-bubble]{display:none!important}
:root{--cb-bar-h:0px;--floating-launcher-clearance:0px;--floating-consent-clearance:0px;--floating-chrome-bottom:max(var(--cb-bar-h),var(--floating-launcher-clearance),var(--floating-consent-clearance),env(safe-area-inset-bottom,0px))}
body:has(${CONSENT_BANNER_SELECTOR}){--floating-consent-clearance:calc(${CONSENT_BANNER_RESERVE_PX}px + env(safe-area-inset-bottom,0px))}
@media (max-width:480px){body:has([data-guest-chat-launcher]){--floating-launcher-clearance:calc(${GUEST_CHAT_LAUNCHER_CLEARANCE_PX}px + env(safe-area-inset-bottom,0px))}}
body{padding-bottom:var(--floating-chrome-bottom)}
html{scroll-padding-bottom:var(--floating-chrome-bottom)}
body:has(${CONSENT_BANNER_SELECTOR}) .site-bn-hero__inner{padding-bottom:max(clamp(74px,11vh,134px),calc(var(--floating-consent-clearance) + 12px))}
body:has(${CONSENT_BANNER_SELECTOR}) .site-bn-hero__meta{bottom:max(clamp(74px,11vh,134px),calc(var(--floating-consent-clearance) + 12px))}
body:has(${CONSENT_BANNER_SELECTOR}) .site-bn-hero__cue{bottom:max(30px,calc(var(--floating-consent-clearance) + 8px))}
body:has(${CONSENT_BANNER_SELECTOR}) #hero{padding-bottom:max(2rem,calc(var(--floating-consent-clearance) + 12px));box-sizing:border-box}
`.replace(/\n/g, "");

/**
 * Catalog island: default bar reserve + hide-at-top. Bottom padding lives in
 * FLOATING_CHROME_STACK_CSS (body) and `.cb-island` (catalog rows). Desktop
 * keeps --cb-bar-h at 0 unless the bar/dock is actually painted (GRK-034).
 */
export const CATALOG_BAR_RESERVE_CSS = `
:root{--cb-bar-h:${BAR_RESERVE}}
@media (min-width:720px){:root{--cb-bar-h:0px}:root:has(.cb-bar[data-show="true"]:not([data-top="true"]),.cb-dock[data-show="true"]){--cb-bar-h:${BAR_RESERVE}}}
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

/** GRK-033: consent-open heroes pad CTAs above the cookie card. */
export function floatingChromeClearsHeroCtas(css: string): boolean {
  return (
    css.includes(`body:has(${CONSENT_BANNER_SELECTOR}) .site-bn-hero__inner`) &&
    css.includes(`body:has(${CONSENT_BANNER_SELECTOR}) #hero`) &&
    css.includes("--floating-consent-clearance")
  );
}

/** GRK-039: consent yields to the open guest chat panel (not only aria-modal dialogs). */
export function floatingChromeYieldsToGuestChat(css: string): boolean {
  return css.includes(`body:has(${GUEST_CHAT_PANEL_SELECTOR}) ${CONSENT_BANNER_SELECTOR}`);
}
