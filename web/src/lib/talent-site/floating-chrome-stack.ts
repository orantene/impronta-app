/**
 * TUL-516 F1–F5 + TUL-528 (GRK-033/034/036/037/038/039) — shared floating-UI stacking +
 * safe-area clearance (theme/chrome core).
 *
 * Layers that share the phone bottom corner (cookie banner, language strip,
 * sticky booking bar, chat FAB, help teaser) must coordinate from ONE place so
 * every theme inherits the same rules. Per-talent patches are out of scope.
 *
 * Stack (bottom → top): sticky bar (80) / dock (81) → demo badge (90) → chat
 * FAB (95) → language toast (96) → help teaser (97) → consent (98). Modals
 * stay above (120).
 *
 * TUL-560: nothing sits above the site header. The language suggestion is a
 * bottom-left toast and the demo marker a bottom-right badge; both float above
 * `--floating-chrome-bottom`. On phones (≤700px, where the chat launcher drops
 * to the corner) the badge clears the launcher and gives way to the toast.
 * Both yield to modals, the open chat panel and booking chrome; the demo
 * footer line stays as the permanent marker. The toast also yields to the
 * consent card, while the badge rides just above it (TUL-528 PM-LIVE7) at the
 * card's measured top, `--consent-banner-top`.
 *
 * TUL-528:
 * - GRK-033: hero first-viewport CTAs clear the consent card (pad hero chrome).
 *   Residual (Still on Gridline trades): split/spec `#hero` is in-flow, so
 *   carousel `padding-bottom` alone does not lift CTAs — phone compact + defer
 *   the who-card while consent is open.
 * - GRK-034: root stack reserves --cb-bar-h from SSR `.cb-island` (phone) and
 *   painted bar/dock (desktop) so body/footer clear before catalog CSS hydrates.
 * - GRK-037: phone footer + catalog groups keep a right gutter so Hablar does
 *   not sit on prices / Reservar / footer links (FAB fill clamp lives in chat).
 * - GRK-036: phone Hablar FAB clears float/default sticky bar before JS measure.
 * - GRK-038: help teaser yields earlier when catalog filter chips enter the
 *   lower phone band (jorg rail), including individual pills.
 * - TUL-931: while the booking sheet (.jb-back) is open the chat FAB and help
 *   teaser step aside; the sheet's own footer owns the phone bottom.
 * - GRK-039: guest chat panels use aria-modal=false; consent yields to
 *   [data-guest-chat-panel] so the message box stays reachable.
 */

import { GUEST_CHAT_LAUNCHER_CLEARANCE_PX } from "@/app/t/[profileCode]/_chat/launcher-clearance";import { STICKY_BAR_DEFAULT_RESERVE_PX } from "@/lib/talent-site/sticky-bar-visibility";

/** Consent owns the corner while open; above the chat FAB so Aceptar stays tappable (F2). */
export const FLOATING_CHROME_CONSENT_Z = 98;

/** Approximate consent card height used for body clearance on legal pages (F1). */
export const CONSENT_BANNER_RESERVE_PX = 220;

/**
 * Lower band of the viewport where a help teaser must not cover filter chips
 * (F4 / GRK-038). 0.55 left jorg rail chips mid-lower viewport under the teaser.
 */
export const HELP_BUBBLE_FILTER_BAND_RATIO = 0.38;

/** Absolute bottom clearance (FAB + teaser) — chips here always block the bubble. */
export const HELP_BUBBLE_CHIP_CLEARANCE_PX = 160;

export const CONSENT_BANNER_SELECTOR = "[data-consent-banner]";
export const LOCALE_SUGGESTION_SELECTOR = "[data-locale-suggestion]";
/** TUL-697: mounted only while the public header's mobile drawer is open (Radix unmounts it when closed). */
export const PUBLIC_HEADER_MENU_SELECTOR = "[data-public-header-menu]";
export const DEMO_BADGE_SELECTOR = "[data-demo-badge]";
/** TUL-795: phone-only "Reservar" bar on a service page; reserves its height through --cb-bar-h. */
export const SERVICE_STICKY_CTA_SELECTOR = "[data-talent-service-sticky]";
/** Desktop windows shorter than this show the language toast as a one-row pill (hero CTAs sit lower). */
export const LOCALE_SUGGESTION_SHORT_WINDOW_MAX_H = 859;
export const CATALOG_FILTER_NAV_SELECTOR =
  ".site-builder-node--services-catalog-nav, .site-builder-node--services-catalog-pill";
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
body:has(.cb-dock[data-show="true"]) ${DEMO_BADGE_SELECTOR},body:has(.cb-bar[data-show="true"]:not([data-top="true"])) ${DEMO_BADGE_SELECTOR}{display:none}
body:has([role="dialog"][aria-modal="true"]) ${CONSENT_BANNER_SELECTOR},body:has([role="dialog"][aria-modal="true"]) ${LOCALE_SUGGESTION_SELECTOR},body:has([role="dialog"][aria-modal="true"]) ${DEMO_BADGE_SELECTOR}{display:none}
body:has(${GUEST_CHAT_PANEL_SELECTOR}) ${CONSENT_BANNER_SELECTOR},body:has(${GUEST_CHAT_PANEL_SELECTOR}) ${LOCALE_SUGGESTION_SELECTOR},body:has(${GUEST_CHAT_PANEL_SELECTOR}) ${DEMO_BADGE_SELECTOR}{display:none}
/* Visually tuck the FAB under the cookie card without visibility:hidden —
   that removed the dock from the accessibility tree (W4-5 / TUL-516 L a11y).
   Consent stays z-98 so Aceptar wins the pointer; opacity + pointer-events
   keep the FAB from painting over it for sighted users. */
body:has(${CONSENT_BANNER_SELECTOR}) [data-guest-chat-launcher]{opacity:0;pointer-events:none}
body:has(${CONSENT_BANNER_SELECTOR}) [data-help-bubble]{display:none!important}
body:has([data-help-bubble]) ${DEMO_BADGE_SELECTOR}{display:none}
:root{--cb-bar-h:0px;--floating-launcher-clearance:0px;--floating-consent-clearance:0px;--floating-chrome-bottom:max(var(--cb-bar-h),var(--floating-launcher-clearance),var(--floating-consent-clearance),env(safe-area-inset-bottom,0px))}
:root:has(.cb-island){--cb-bar-h:${BAR_RESERVE}}
@media (min-width:720px){:root:has(.cb-island){--cb-bar-h:0px}:root:has(.cb-bar[data-show="true"]:not([data-top="true"]),.cb-dock[data-show="true"]){--cb-bar-h:${BAR_RESERVE}}}
body:has(${CONSENT_BANNER_SELECTOR}){--floating-consent-clearance:calc(${CONSENT_BANNER_RESERVE_PX}px + env(safe-area-inset-bottom,0px))}
@media (max-width:480px){body:has([data-guest-chat-launcher]){--floating-launcher-clearance:calc(${GUEST_CHAT_LAUNCHER_CLEARANCE_PX}px + env(safe-area-inset-bottom,0px))}}
body{padding-bottom:var(--floating-chrome-bottom)}
${LOCALE_SUGGESTION_SELECTOR}{bottom:calc(var(--floating-chrome-bottom) + 12px)}
${LOCALE_SUGGESTION_SELECTOR}>div{animation:floating-toast-in .3s ease-out both}
@keyframes floating-toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){${LOCALE_SUGGESTION_SELECTOR}>div{animation:none}}
@media (min-width:701px) and (max-height:${LOCALE_SUGGESTION_SHORT_WINDOW_MAX_H}px){html ${LOCALE_SUGGESTION_SELECTOR}{width:auto;bottom:calc(var(--floating-chrome-bottom) + 8px)}html ${LOCALE_SUGGESTION_SELECTOR} [data-locale-suggestion-card]{flex-wrap:nowrap;gap:2px;padding:3px;border-radius:var(--token-button-radius,999px)}html ${LOCALE_SUGGESTION_SELECTOR} [data-locale-suggestion-prompt]{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}}
${DEMO_BADGE_SELECTOR}{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(var(--floating-chrome-bottom) + 12px);z-index:90;pointer-events:none}
@media (max-width:700px){body:has([data-guest-chat-launcher]) ${DEMO_BADGE_SELECTOR}{bottom:calc(max(var(--floating-chrome-bottom),${GUEST_CHAT_LAUNCHER_CLEARANCE_PX}px + env(safe-area-inset-bottom,0px)) + 4px)}body:has(${LOCALE_SUGGESTION_SELECTOR}):not(:has(${CONSENT_BANNER_SELECTOR})) ${DEMO_BADGE_SELECTOR}{display:none}}
html body:has(${CONSENT_BANNER_SELECTOR}) ${DEMO_BADGE_SELECTOR}{bottom:calc(var(--consent-banner-top,${CONSENT_BANNER_RESERVE_PX}px) + 10px)}
html{scroll-padding-bottom:var(--floating-chrome-bottom)}
body:has(${CONSENT_BANNER_SELECTOR}) .site-bn-hero__inner{padding-bottom:max(clamp(74px,11vh,134px),calc(var(--floating-consent-clearance) + 12px))}
body:has(${CONSENT_BANNER_SELECTOR}) .site-bn-hero__meta{bottom:max(clamp(74px,11vh,134px),calc(var(--floating-consent-clearance) + 12px))}
body:has(${CONSENT_BANNER_SELECTOR}) .site-bn-hero__cue{bottom:max(30px,calc(var(--floating-consent-clearance) + 8px))}
body:has(${CONSENT_BANNER_SELECTOR}) #hero{padding-bottom:max(2rem,calc(var(--floating-consent-clearance) + 12px));box-sizing:border-box}
@media (max-width:480px){body:has([data-guest-chat-launcher]){--floating-launcher-gutter:calc(72px + env(safe-area-inset-right,0px))}body:has([data-guest-chat-launcher]) .site-builder-node--services-catalog-groups,body:has([data-guest-chat-launcher]) .sb-statement-footer-meta,body:has([data-guest-chat-launcher]) .sb-statement-footer-contact,body:has([data-guest-chat-launcher]) .sb-statement-footer-inner{padding-inline-end:max(12px,var(--floating-launcher-gutter))}}
/* GRK-036: Hablar clears float/default sticky booking chrome before JS measure.
   Pill bars already tuck the FAB via .cb-bar-chat (GUEST_CHAT_FAB_CSS). */
@media (max-width:719px){body:has(.cb-bar[data-show="true"]:not([data-top="true"])) [data-guest-chat-launcher],body:has(.mn-bar[data-show="true"]) [data-guest-chat-launcher]{bottom:max(calc(24px + env(safe-area-inset-bottom,0px)),calc(var(--cb-bar-h) + 24px))!important;right:max(72px,calc(16px + 56px + env(safe-area-inset-right,0px)))!important}}
/* GRK-033 residual: Gridline/split heroes — compact phone + defer who-card. */
@media (max-width:640px){body:has(${CONSENT_BANNER_SELECTOR}) #hero.site-builder-node--split{padding-top:1.25rem!important;padding-bottom:calc(var(--floating-consent-clearance) + 16px)!important;box-sizing:border-box}body:has(${CONSENT_BANNER_SELECTOR}) #hero.site-builder-node--split > .site-builder-node--container[data-builder-layout="stack"]{padding-top:0!important;padding-bottom:0!important;--bn-gap:0.5rem}body:has(${CONSENT_BANNER_SELECTOR}) #hero.site-builder-node--split > .site-builder-node--container[data-builder-layout="stack"] > .site-builder-node--container:has(> .site-builder-node--button){scroll-margin-bottom:calc(var(--floating-consent-clearance) + 16px)}body:has(${CONSENT_BANNER_SELECTOR}) #hero.site-builder-node--split > :last-child{display:none}}
/* TUL-795: service page sticky Reservar bar (phone only); body + chat bubble clear it. */
@media (max-width:639px){:root:has(${SERVICE_STICKY_CTA_SELECTOR}){--cb-bar-h:calc(64px + env(safe-area-inset-bottom,0px))}body:has(${SERVICE_STICKY_CTA_SELECTOR}) [data-guest-chat-launcher]{bottom:calc(var(--cb-bar-h) + 12px)!important}}
@media (min-width:640px){${SERVICE_STICKY_CTA_SELECTOR}{display:none!important}}
body:has(.jb-back) [data-guest-chat-launcher],body:has(.jb-back) [data-help-bubble]{display:none!important}
/* TUL-697: the open mobile nav drawer owns the screen; floating chat/help/demo/locale chrome (z 90+) must not paint over it. */
body:has(${PUBLIC_HEADER_MENU_SELECTOR}) [data-guest-chat-launcher],body:has(${PUBLIC_HEADER_MENU_SELECTOR}) [data-help-bubble],body:has(${PUBLIC_HEADER_MENU_SELECTOR}) ${DEMO_BADGE_SELECTOR},body:has(${PUBLIC_HEADER_MENU_SELECTOR}) ${LOCALE_SUGGESTION_SELECTOR}{display:none!important}
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
 * F4 / GRK-038: the "Can I help you choose?" teaser must not sit over category
 * filter chips while those chips occupy the lower phone band (jorg rail).
 * Protects both the nav row and individual pills; band is the larger of the
 * ratio cut and the FAB+teaser clearance.
 */
export function helpBubbleFilterNavBlocking(doc: Document, viewportH: number): boolean {
  if (!(viewportH > 0)) return false;
  const bandTop = Math.min(
    viewportH * HELP_BUBBLE_FILTER_BAND_RATIO,
    viewportH - HELP_BUBBLE_CHIP_CLEARANCE_PX,
  );
  return Array.from(doc.querySelectorAll<HTMLElement>(CATALOG_FILTER_NAV_SELECTOR)).some((el) => {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    return r.bottom > bandTop && r.top < viewportH;
  });
}

/** GRK-038: F4 band covers chips before they reach the Hablar teaser. */
export function helpBubbleFilterBandProtectsChips(ratio: number, clearancePx: number): boolean {
  return ratio <= 0.4 && clearancePx >= 140;
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
    css.includes("--floating-consent-clearance") &&
    // Residual Still on Gridline trades (split/spec #hero).
    css.includes(`#hero.site-builder-node--split`) &&
    css.includes(`#hero.site-builder-node--split > :last-child`)
  );
}

/** GRK-034: root stack reserves bar height from SSR island / painted bar+dock. */
export function floatingChromeReservesBarForIsland(css: string): boolean {
  return (
    css.includes(":root:has(.cb-island){--cb-bar-h:") &&
    css.includes(
      ':root:has(.cb-bar[data-show="true"]:not([data-top="true"]),.cb-dock[data-show="true"]){--cb-bar-h:',
    )
  );
}

/** GRK-039: consent yields to the open guest chat panel (not only aria-modal dialogs). */
export function floatingChromeYieldsToGuestChat(css: string): boolean {
  return css.includes(`body:has(${GUEST_CHAT_PANEL_SELECTOR}) ${CONSENT_BANNER_SELECTOR}`);
}

/** GRK-036: phone FAB clears painted sticky booking chrome before JS yield runs. */
export function floatingChromeClearsStickyBarFab(css: string): boolean {
  return (
    css.includes('body:has(.cb-bar[data-show="true"]:not([data-top="true"])) [data-guest-chat-launcher]') &&
    css.includes("var(--cb-bar-h)") &&
    css.includes("!important")
  );
}
