/**
 * SOFT CHROME (release 2.5 "look only"): the editorial type system's second
 * skin, switched on by the `shape.chrome` token (`data-token-shape-chrome="soft"`)
 * on top of `type.system = editorial`. A Design opts in through its token
 * defaults; a talent turns it off in the theme drawer, and a site pinned to an
 * older Design version keeps the flat hairline look because its token defaults
 * never carried the key.
 *
 * What lives here (presentation only, every value a token or a colour mix of
 * the Look's tokens, no hex):
 *   header lockup + surface, ghost button fill, ticker speed, sticky menu chips,
 *   group heading rule, desktop rail, FAQ cards, reviews chrome, About text
 *   link, text-safe accent for text, the 360px tier, smooth anchor scroll.
 * Node-level looks (framed work cards, menu row cards) are node OPTIONS and
 * carry their own stylesheet next to the renderer, not here. The reduced-motion
 * rule and the shared keyframes are not soft-only: see `motion-css.ts`.
 *
 * Cascade: every rule here uses the same scope shape as the base editorial
 * sheet, so ties are won by source order. This array is appended LAST.
 */
import { STYLE_TOKEN_BY_KEY, styleTokenCssVar } from "@/lib/site-admin/tokens/style-tokens";

import { MOTION_SOFT_CSS } from "./motion-css";

/** `var(--token-<key>, <baseline>)` for a site style token. */
function v(key: string): string {
  const def = STYLE_TOKEN_BY_KEY.get(key);
  if (!def) throw new Error(`design-type-system-soft: unknown style token ${key}`);
  return `var(${styleTokenCssVar(key)},${def.fallback})`;
}

/** Canvas root with the editorial system AND the soft chrome on. */
const SOFT =
  '[data-theme-canvas-root]:where([data-token-type-system="editorial"][data-token-shape-chrome="soft"],[data-token-type-system="editorial"][data-token-shape-chrome="soft"] *)';
const MQ_DESK = "@media (min-width:900px)";
const MQ_PHONE = "@media (max-width:767px)";
const MQ_TINY = "@media (max-width:370px)";

const INK = "var(--token-color-ink)";
const SURFACE = "var(--token-color-surface-raised,var(--token-color-background))";
const TINT = "var(--token-color-blush,var(--token-color-surface-raised))";
const ACCENT = "var(--token-color-accent,var(--token-color-primary))";
/** Text-safe accent (derived, see `color.accent-text`); the raw accent when it is not derived. */
const ACCENT_TEXT = "var(--token-color-accent-text,var(--token-color-accent,var(--token-color-primary)))";
const RULE = v("shape.rule-width");
const GUTTER_PHONE = v("layout.gutter-phone");
const soft = (pct: number, color = INK) => `color-mix(in srgb,${color} ${pct}%,transparent)`;

export const EDITORIAL_SOFT_CHROME_CSS = [
  // ── Header: name over trade with no gap, frosted on the raised surface (H-1, H-2).
  // The bar padding (6px phone / 18px desktop) is the `layout.header-pad-y*` token default.
  `${SOFT} .site-header{background:color-mix(in srgb,${SURFACE} 92%,transparent)}`,
  `${SOFT} .site-header__brand{flex-direction:column;align-items:flex-start;gap:0}`,
  `${SOFT} .site-header__brand-label{line-height:.95}`,
  `${SOFT} .site-header__brand-tagline{margin-top:-1px;font-size:9px;letter-spacing:.24em}`,

  // ── Hero: the ghost button carries the raised surface (HE-7); eyebrow in the
  // text-safe accent (HE-2); proof line 13px (HE-3).
  `${SOFT} :is(.site-builder-node--button[data-builder-button-tone="secondary"],.site-builder-node--button-secondary){background:${SURFACE}}`,
  `${SOFT} #hero p.site-builder-node--paragraph[style*="text-transform:uppercase"]{color:${ACCENT_TEXT}}`,
  `${SOFT} #hero .site-builder-node--container + p.site-builder-node--paragraph.site-builder-node--paragraph{font-size:13px}`,

  // ── Ticker: 38s loop (TK-1). Slow and fast stay the talent's own choice.
  `${SOFT} .site-builder-node--marquee[data-bn-marquee-speed="medium"]{--bn-marquee-duration:38s}`,

  // ── Menu: group heading rule (MN-8), desktop rail (MN-7), sticky phone chips (MN-6).
  // Phone chips use the same 72px header fallback as desktop so they never slide under
  // the lockup before `--site-header-h` publishes. Dock/pill up → keep last rows clear.
  `${SOFT} .site-builder-node--services-catalog-group-title{margin:26px 0 14px;padding-bottom:10px;border-bottom:${RULE} solid var(--token-color-line)}`,
  `${MQ_PHONE}{${SOFT} .site-builder-node--services-catalog-body[data-category-nav="rail"] > .site-builder-node--services-catalog-nav{position:sticky;top:calc(var(--site-header-h,72px) - 1px);z-index:4;margin:12px calc(${GUTTER_PHONE} * -1) 0;padding:8px ${GUTTER_PHONE};background:color-mix(in srgb,${SURFACE} 94%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 10px 16px -14px ${soft(25)}}}`,
  `${MQ_DESK}{${SOFT} .site-builder-node--services-catalog-body[data-category-nav="rail"]{min-width:0;gap:28px}${SOFT} .site-builder-node--services-catalog-body[data-category-nav="rail"] > .site-builder-node--services-catalog-groups{min-width:0;overflow-x:clip}${SOFT} .site-builder-node--services-catalog-body[data-category-nav="rail"] > .site-builder-node--services-catalog-nav{top:calc(var(--site-header-h,72px) + 24px)}${SOFT} .site-builder-node--services-catalog-body[data-category-nav="rail"] > .site-builder-node--services-catalog-nav .site-builder-node--services-catalog-pill[data-active="true"]{background:${ACCENT};color:var(--token-color-accent-on,var(--token-color-primary-on,var(--token-color-background)));border-color:${ACCENT}}${SOFT} .site-builder-node--services-catalog-group-title{margin-top:10px}}`,
  // Keep the last menu rows above the sticky See-services / Continuar chrome.
  `html:has([data-theme-canvas-root][data-token-shape-chrome="soft"]):has(.cb-dock[data-show="true"],.cb-bar[data-show="true"]){scroll-padding-bottom:calc(92px + env(safe-area-inset-bottom,0px))}`,
  `body:has(.cb-dock[data-show="true"],.cb-bar[data-show="true"]) ${SOFT} .site-builder-node--services-catalog-groups{padding-bottom:calc(72px + env(safe-area-inset-bottom,0px))}`,

  // ── Reviews: tint-mixed cards (not hard white-on-white when page≈section) (RV-2),
  // 84% slides and an edge fade on the phone, three cards and no dead arrows on desktop (RV-3).
  `${SOFT} .sb-reviews-card,${SOFT} .sb-reviews-card[data-accent]{border-color:transparent;background:color-mix(in srgb,${SURFACE} 70%,${TINT})}`,
  `${SOFT} .sb-reviews-initials{background:${TINT};color:${ACCENT_TEXT}}`,
  `@media (max-width:899px){${SOFT} .sb-reviews .site-builder-node--carousel-slide{flex-basis:84%}${SOFT} .sb-reviews .site-builder-node--carousel-track{margin:0 calc(${GUTTER_PHONE} * -1);padding:0 ${GUTTER_PHONE} 4px;-webkit-mask-image:linear-gradient(90deg,black 88%,transparent);mask-image:linear-gradient(90deg,black 88%,transparent)}}`,
  `${MQ_DESK}{${SOFT} .sb-reviews .site-builder-node--carousel-controls{display:none}${SOFT} .sb-reviews[data-reviews-layout="trio"] .site-builder-node--carousel-slide:nth-child(n+4){display:none}}`,

  // ── About: the secondary action is a text link (AB-1).
  `${SOFT} #about .site-builder-node--button[data-builder-button-tone="secondary"]{height:auto;min-height:36px;padding:0 2px;border:0;border-radius:0;background:none;color:${INK};font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px}`,

  // ── FAQ: tint-mixed card per question, "+" in a tint circle that turns into an x (FQ-1).
  // Item chrome is a renderer default (inline), hence !important, as in the base sheet.
  `${SOFT} #contact .site-builder-node--accordion{display:grid!important;gap:10px!important}`,
  `${SOFT} #contact .site-builder-node--accordion-item{background:color-mix(in srgb,${SURFACE} 70%,${TINT});border:0!important;border-radius:18px!important;padding:0 20px!important;box-shadow:0 1px 2px ${soft(6)};transition:box-shadow .2s ease}`,
  `${SOFT} #contact .site-builder-node--accordion-item[open]{box-shadow:0 14px 30px -22px ${soft(35)}}`,
  `${SOFT} #contact .site-builder-node--accordion-item > summary{align-items:center;min-height:64px;font-size:16px;color:${INK}}`,
  `${SOFT} #contact .site-builder-node--accordion-item > summary::after{flex:0 0 auto;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:${TINT};color:${ACCENT_TEXT};font:500 20px/1 var(--site-body-font,inherit);transition:transform .2s ease}`,
  `${SOFT} #contact .site-builder-node--accordion-item[open] > summary::after{content:"+";transform:rotate(45deg)}`,
  `${SOFT} #contact .site-builder-node--accordion-item p{margin:0 0 18px;font-size:15px;line-height:1.6;color:color-mix(in srgb,${INK} 78%,transparent)}`,
  `${MQ_DESK}{${SOFT} #contact .site-builder-node--accordion{grid-template-columns:1fr 1fr!important;align-items:start;gap:14px!important}}`,

  // ── Accent words and eyebrows read the text-safe accent (PL-2).
  `${SOFT} :is(h1,h2,h3) em{color:${ACCENT_TEXT}}`,
  `${SOFT} :is(.sb-portfolio-eyebrow,.sb-reviews-eyebrow,.sb-visit-eyebrow,.site-builder-node--services-catalog-eyebrow){color:${ACCENT_TEXT}}`,

  // ── The 360px tier (G-1): tighter display type. Rows and thumbs have their own tier in the row-card sheet.
  `${MQ_TINY}{${SOFT} #hero h1{font-size:41px}${SOFT} h2{font-size:30px}${SOFT} :is(.sb-portfolio-title,.sb-reviews-title,.sb-visit-title,.site-builder-node--services-catalog-title){font-size:30px}}`,

  // ── Smooth anchor scroll and the header-aware offset (A-18, G-4).
  ...MOTION_SOFT_CSS,
].join("\n");
