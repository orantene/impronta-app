import { STICKY_BAR_DEFAULT_RESERVE_PX } from "@/lib/talent-site/sticky-bar-visibility";

/**
 * Floating overlay stack CSS (TUL-121 overlapping floating UI theme).
 *
 * Pure string module — kept separate from the React style tag so unit tests
 * do not pull in jsx-runtime. Mount via FloatingOverlayStackStyles in layout.
 *
 * Rules (one bottom chrome lane at a time):
 * 1. Consent first: hide language suggestion while the cookie banner is up
 *    (DS-63: both covering the lower page on first visit).
 * 2. Neither banner over a modal booking / dialog window.
 * 3. Neither banner under/over the catalog sticky bar or selection dock.
 * 4. Language suggestion clears the dashboard mobile bottom nav.
 */

export const FLOATING_OVERLAY_STACK_CSS = `body:has([data-consent-banner]) [data-locale-suggestion]{display:none}
body:has([role="dialog"][aria-modal="true"]) [data-consent-banner],body:has([role="dialog"][aria-modal="true"]) [data-locale-suggestion]{display:none}
body:has(.cb-dock[data-show="true"]) [data-consent-banner],body:has(.cb-bar[data-show="true"]) [data-consent-banner],body:has(.cb-dock[data-show="true"]) [data-locale-suggestion],body:has(.cb-bar[data-show="true"]) [data-locale-suggestion]{display:none}
@media (max-width: 720px){body:has([data-tulala-mobile-bottom-nav]) [data-locale-suggestion]{bottom:calc(76px + env(safe-area-inset-bottom, 0px))}}`;

/** Catalog idle-bar spacing + sticky reserve + legacy consent-first inject (compat re-export). */
export const CATALOG_OVERLAY_CSS = `body:has([data-consent-banner]) [data-locale-suggestion],body:has([role="dialog"][aria-modal="true"]) [data-consent-banner],body:has([role="dialog"][aria-modal="true"]) [data-locale-suggestion]{display:none}
.cb-dock{gap:16px}.cb-dock-stack{margin-left:6px}
:root{--cb-bar-h:calc(${STICKY_BAR_DEFAULT_RESERVE_PX}px + env(safe-area-inset-bottom))}
@media (min-width:720px){:root{--cb-bar-h:0px}}
body{padding-bottom:var(--cb-bar-h,0px)}
.cb-bar{transition:opacity .2s ease,visibility .2s}
.cb-bar[data-top="true"]{opacity:0;visibility:hidden;pointer-events:none}
@media (prefers-reduced-motion:reduce){.cb-bar{transition:none}}`;
