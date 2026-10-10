/**
 * TUL-516 F1–F5 + P1 + TUL-528 (GRK-033/034/039) — shared floating-UI stacking +
 * safe-area clearance (theme/chrome core).
 *
 * Layers that share the phone bottom corner (cookie banner, language toast,
 * sticky booking bar, chat FAB, help teaser, Demo badge) must coordinate from
 * ONE place so every theme inherits the same rules. Per-talent patches are out
 * of scope.
 *
 * Stack (bottom → top): sticky bar (80) / dock (81) → Demo badge (85) →
 * language toast (90) → chat FAB (95) → help teaser (97) → consent (98).
 * Modals stay above (120). Language suggestion and Demo are fixed overlays
 * (TUL-516 P1), never in-flow rows that push theme headers down.
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

/** Language suggestion toast sits under consent so cookie CTAs stay free (P1). */
export const FLOATING_CHROME_LOCALE_Z = 90;

/** Demo corner badge under language toast; above sticky bar (P1). */
export const FLOATING_CHROME_DEMO_Z = 85;

/** Approximate consent card height used for body clearance on legal pages (F1). */
export const CONSENT_BANNER_RESERVE_PX = 220;

/** Lower band of the viewport where a help teaser must not cover filter chips (F4). */
export const HELP_BUBBLE_FILTER_BAND_RATIO = 0.55;

export const CONSENT_BANNER_SELECTOR = "[data-consent-banner]";
export const LOCALE_SUGGESTION_SELECTOR = "[data-locale-suggestion]";
export const SITE_DEMO_BADGE_SELECTOR = "[data-site-demo-badge]";
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
body:has(${CONSENT_BANNER_SELECTOR}) [data-guest-chat-launcher]{opacity:0;visibility:hidden;pointer-events:none}
body:has(${CONSENT_BANNER_SELECTOR}) [data-help-bubble]{display:none!important}
body:has(${LOCALE_SUGGESTION_SELECTOR}) ${SITE_DEMO_BADGE_SELECTOR}{display:none}
:root{--cb-bar-h:0px;--floating-launcher-clearance:0px;--floating-consent-clearance:0px;--floating-chrome-bottom:max(var(--cb-bar-h),var(--floating-launcher-clearance),var(--floating-consent-clearance),env(safe-area-inset-bottom,0px))}
body:has(${CONSENT_BANNER_SELECTOR}){--floating-consent-clearance:calc(${CONSENT_BANNER_RESERVE_PX}px + env(safe-area-inset-bottom,0px))}
@media (max-width:480px){body:has([data-guest-chat-launcher]){--floating-launcher-clearance:calc(${GUEST_CHAT_LAUNCHER_CLEARANCE_PX}px + env(safe-area-inset-bottom,0px))}}
body{padding-bottom:var(--floating-chrome-bottom)}
html{scroll-padding-bottom:var(--floating-chrome-bottom)}
body:has(${CONSENT_BANNER_SELECTOR}) .site-bn-hero__inner{padding-bottom:max(clamp(74px,11vh,134px),calc(var(--floating-consent-clearance) + 12px))}
body:has(${CONSENT_BANNER_SELECTOR}) .site-bn-hero__meta{bottom:max(clamp(74px,11vh,134px),calc(var(--floating-consent-clearance) + 12px))}
body:has(${CONSENT_BANNER_SELECTOR}) .site-bn-hero__cue{bottom:max(30px,calc(var(--floating-consent-clearance) + 8px))}
body:has(${CONSENT_BANNER_SELECTOR}) #hero{padding-bottom:max(2rem,calc(var(--floating-consent-clearance) + 12px));box-sizing:border-box}
${SITE_DEMO_BADGE_SELECTOR}{position:fixed;left:max(12px,env(safe-area-inset-left,0px));bottom:calc(var(--floating-chrome-bottom) + 12px);z-index:${FLOATING_CHROME_DEMO_Z};display:inline-flex;align-items:center;gap:6px;padding:4px 8px 4px 10px;border-radius:999px;border:1px solid color-mix(in srgb,currentColor 28%,transparent);background:color-mix(in srgb,var(--token-color-surface-raised,#fff) 92%,transparent);color:var(--token-color-ink-muted,rgba(11,11,13,0.62));font:600 10px/1 var(--token-font-body,system-ui,sans-serif);letter-spacing:0.08em;text-transform:uppercase;box-shadow:0 6px 18px -12px rgba(11,11,13,0.35);pointer-events:auto}
.site-demo-badge__info{display:inline-grid;place-items:center;width:14px;height:14px;border-radius:999px;border:1px solid color-mix(in srgb,currentColor 35%,transparent);font-size:9px;font-weight:700;letter-spacing:0;text-transform:none;line-height:1;cursor:help}
.site-demo-badge__tip{position:absolute;left:0;bottom:calc(100% + 8px);min-width:max-content;max-width:min(220px,70vw);padding:6px 8px;border-radius:8px;background:var(--token-color-ink,#0b0b0d);color:var(--token-color-surface,#fff);font:500 11px/1.35 var(--token-font-body,system-ui,sans-serif);letter-spacing:0;text-transform:none;opacity:0;pointer-events:none;transform:translateY(4px);transition:opacity .15s ease,transform .15s ease;box-shadow:0 8px 20px -14px rgba(11,11,13,0.5)}
${SITE_DEMO_BADGE_SELECTOR}{isolation:isolate}
${SITE_DEMO_BADGE_SELECTOR}:hover .site-demo-badge__tip,${SITE_DEMO_BADGE_SELECTOR}:focus-within .site-demo-badge__tip{opacity:1;transform:translateY(0)}
${LOCALE_SUGGESTION_SELECTOR}{position:fixed;z-index:${FLOATING_CHROME_LOCALE_Z};left:12px;right:12px;bottom:calc(var(--floating-chrome-bottom) + 12px);display:flex;justify-content:center;pointer-events:none}
${LOCALE_SUGGESTION_SELECTOR}>*{pointer-events:auto;max-width:28rem;width:100%}
@media (min-width:640px){${LOCALE_SUGGESTION_SELECTOR}{left:auto;right:max(20px,env(safe-area-inset-right,0px));width:min(24rem,calc(100vw - 2.5rem));justify-content:flex-end}}
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
