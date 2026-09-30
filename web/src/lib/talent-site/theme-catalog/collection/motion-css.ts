/**
 * The motion layer of release 2.5 (gap report section 3), as plain CSS arrays
 * so the talent site stylesheet and the tests read the same source.
 *
 *   MOTION_KEYFRAMES_CSS   the shared keyframes (panel rise, spinner) and their
 *                          easings; the chat panel and the booking states read them
 *   MOTION_REDUCED_CSS     ONE reduced-motion rule for every talent surface:
 *                          the canvas root, the booking sheet and its scrim, the
 *                          dock, the chat. Animation and transition off, smooth
 *                          scroll off; state changes stay instant and focus
 *                          rings are untouched (G-7)
 *   MOTION_SOFT_CSS        smooth anchor scroll and the header-aware scroll
 *                          offset (A-18, G-4), the booking sheet and scrim
 *                          timings (A-7, A-8) and the busy ring (A-14), only
 *                          with the soft chrome and only when motion is welcome
 *
 * No colours here, so nothing to theme; all timings are the mockup's.
 */

/** The mockup's house easing for panels and sheets. */
export const MOTION_EASE_PANEL = "cubic-bezier(.2,.8,.2,1)";

/** Surfaces the reduced-motion rule covers besides the canvas root. */
export const MOTION_SURFACES = [
  "[data-theme-canvas-root]",
  ".jb-back",
  ".jb-sheet",
  ".cb-island",
  ".cb-dock",
  ".cb-dock-toast",
  "[data-tl-motion]",
] as const;

export const MOTION_KEYFRAMES_CSS: readonly string[] = [
  // Chat panel and side sheets rise in (A-8 / A-10): 40px up from 40% opacity.
  `@keyframes tl-rise{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}`,
  // Busy state ring (A-14): 1s linear.
  `@keyframes tl-spin{to{transform:rotate(360deg)}}`,
  `.tl-spinner{display:inline-block;width:28px;height:28px;border-radius:50%;border:3px solid color-mix(in srgb,currentColor 18%,transparent);border-top-color:currentColor;animation:tl-spin 1s linear infinite}`,
];

const reducedSelectors = MOTION_SURFACES.flatMap((s) => [s, `${s} *`, `${s} *::before`, `${s} *::after`]).join(",");

export const MOTION_REDUCED_CSS: readonly string[] = [
  `@media (prefers-reduced-motion:reduce){${reducedSelectors}{animation:none!important;transition:none!important;scroll-behavior:auto!important}html{scroll-behavior:auto!important}}`,
];

const SOFT_ROOT = '[data-theme-canvas-root][data-token-shape-chrome="soft"]';
const SOFT_HTML = 'html[data-token-shape-chrome="soft"]';
/** Any element on a page whose talent site has the soft chrome on (the sheet may render outside the canvas root). */
const soft = (selector: string) => `html:has(${SOFT_ROOT}) ${selector},${SOFT_HTML} ${selector}`;

export const MOTION_SOFT_CSS: readonly string[] = [
  // Smooth hash scrolling, only when the visitor has not asked for less motion.
  `@media (prefers-reduced-motion:no-preference){html:has(${SOFT_ROOT}),${SOFT_HTML}{scroll-behavior:smooth}}`,
  // The booking sheet and its scrim take the mockup's timings (A-7 .2s ease, A-8 .28s house easing,
  // rising 40px from 40% opacity); the busy ring shows. Other designs keep the platform's own motion.
  `@media (prefers-reduced-motion:no-preference){${soft(".jb-back")}{animation-duration:.2s;animation-timing-function:ease}${soft(".jb-sheet")}{animation-name:tl-rise;animation-duration:.28s;animation-timing-function:${MOTION_EASE_PANEL}}}`,
  // The chat panel rises in (A-10): `data-tl-motion` marks it; its entrance is the soft chrome's.
  `@media (prefers-reduced-motion:no-preference){${soft("[data-tl-motion]")}{animation:tl-rise .25s ${MOTION_EASE_PANEL}}}`,
  `${soft(".cb-spinner")}{display:inline-block}`,
  // Section anchors clear the sticky header (`--site-header-h` is published by the header).
  `${SOFT_ROOT} :is(#hero,#gallery,#services,#reviews,#about,#contact,#visit),${SOFT_HTML} [data-theme-canvas-root] :is(#hero,#gallery,#services,#reviews,#about,#contact,#visit){scroll-margin-top:calc(var(--site-header-h,0px) + 8px)}`,
];

/** Every motion sheet for the always-on surfaces (keyframes + the reduced-motion rule). */
export const MOTION_CSS: readonly string[] = [...MOTION_KEYFRAMES_CSS, ...MOTION_REDUCED_CSS];
