/**
 * The EDITORIAL TYPE SYSTEM: block CSS for a Design whose look goes beyond
 * shared widget props (display type rhythm, pill buttons, frosted header,
 * rounded photos...). It replaces the old slug-keyed "design skin".
 *
 * Owner rule: a Design only sets DEFAULTS. So nothing here is a fixed value:
 *   - every size, weight, tracking, radius, height, padding and rule width is
 *     a site style token var (`style-tokens.ts`), whose default comes from the
 *     Design (`DesignPayload.tokenDefaults`, e.g. `MAISON_V2_TOKEN_DEFAULTS`)
 *     and whose value the talent edits in the theme drawer;
 *   - colours are the Look's colour token vars, fonts the typography vars;
 *   - the rules switch on with the `type.system` token
 *     (`data-token-type-system="editorial"`), not a Design slug, so any Design
 *     or user template can use it and a talent can turn it off.
 * The `var()` fallback is the system baseline, used only when no layer sets
 * the token. Structural declarations (display, grid areas, order) are layout,
 * not style, and stay.
 *
 * Block styles (node inline styles) still win, so a per-block edit is never
 * overridden. The one exception is the FAQ accordion, whose item chrome is a
 * renderer default (not a talent prop), hence `!important` there; its values
 * are still tokens.
 */
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";
import { styleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";
import { STYLE_TOKEN_BY_KEY, styleTokenCssVar } from "@/lib/site-admin/tokens/style-tokens";

/** `var(--token-<key>, <baseline>)` for a site style token. */
function v(key: string): string {
  const def = STYLE_TOKEN_BY_KEY.get(key);
  if (!def) throw new Error(`design-type-system: unknown style token ${key}`);
  return `var(${styleTokenCssVar(key)},${def.fallback})`;
}

/**
 * The canvas root with the editorial system on (on the root itself for the
 * live site, or on <html> while the theme drawer previews a draft). `:where`
 * keeps the old skin's specificity (one attribute), so the cascade against the
 * renderer sheet is unchanged.
 */
const S =
  '[data-theme-canvas-root]:where([data-token-type-system="editorial"],[data-token-type-system="editorial"] *)';
const OUTLINE =
  '[data-theme-canvas-root]:where([data-token-button-variant="outline"],[data-token-button-variant="outline"] *)';
const MQ_DESK = "@media (min-width:900px)";

const ACCENT = "var(--token-color-accent,var(--token-color-primary))";
const RULE = v("shape.rule-width");
const TITLE_HOOKS = ".sb-portfolio-title,.sb-reviews-title,.sb-visit-title,.site-builder-node--services-catalog-title";
const LEDE = 'p.site-builder-node--paragraph:not([style*="text-transform:uppercase"])';

/** Accent words inside display type (`{i}...{/i}` spans). */
const accentWords = `font-style:${v("type.accent-style")};font-weight:${v("type.accent-weight")};color:${ACCENT}`;
const displayType = `font-family:var(--site-heading-font,Georgia,serif);font-weight:${v("type.display-weight")};letter-spacing:${v("type.display-tracking")}`;
const labelType = `font-size:${v("type.label-size")};font-weight:${v("type.label-weight")};letter-spacing:${v("type.label-tracking")}`;
const frosted = `background:color-mix(in srgb,var(--token-color-surface-raised,var(--token-color-background)) 82%,transparent);border:${RULE} solid color-mix(in srgb,var(--token-color-line) 80%,transparent);box-shadow:0 18px 40px -18px color-mix(in srgb,var(--token-color-ink) 45%,transparent)`;

export const EDITORIAL_TYPE_SYSTEM_CSS = [
  // ── Base: body font, display headings, accent spans.
  `${S}{font-family:var(--site-body-font,system-ui,sans-serif);color:var(--token-color-ink);font-size:${v("type.body-size")};line-height:${v("type.body-line-height")}}`,
  `${S} :is(h1,h2,h3){${displayType};text-wrap:balance}`,
  `${S} :is(h1,h2,h3) em{${accentWords}}`,
  `${S} h2{font-size:${v("type.section-title-size")};line-height:${v("type.display-line-height")}}`,
  `${S} p.site-builder-node--paragraph{color:var(--token-color-muted)}`,
  // Eyebrows (uppercase paragraphs): the label role.
  `${S} p.site-builder-node--paragraph[style*="text-transform:uppercase"]{${labelType}}`,
  `${S} :is(.sb-portfolio-eyebrow,.sb-reviews-eyebrow,.sb-visit-eyebrow,.site-builder-node--services-catalog-eyebrow){margin:0 0 4px;${labelType};text-transform:uppercase;color:${ACCENT}}`,
  `${S} :is(${TITLE_HOOKS}){margin:4px 0 0;${displayType};font-size:${v("type.section-title-size")};line-height:${v("type.display-line-height")};color:var(--token-color-ink)}`,
  `${S} :is(${TITLE_HOOKS}) em{${accentWords}}`,
  `${S} :is(.sb-portfolio-header,.sb-reviews-header,.sb-visit-header,.site-builder-node--services-catalog-header){margin-bottom:16px}`,
  `${S} .site-builder-node--services-catalog-subtitle{margin:6px 0 0;font-size:13.5px;color:var(--token-color-muted);max-width:40ch}`,

  // ── Buttons: the button tokens; primary fills with the accent (or outlines), secondary is the ghost.
  `${S} .site-builder-node--button{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:${v("button.height")};padding:0 ${v("button.padding-x")};border-radius:${v("button.radius")};border:0;text-transform:none;letter-spacing:0;font-size:${v("button.font-size")};font-weight:${v("button.font-weight")};font-family:var(--site-body-font,inherit);white-space:nowrap;text-decoration:none;transition:transform .15s ease}`,
  `${S} .site-builder-node--button:active{transform:scale(.98)}`,
  `${S} :is(.site-builder-node--button[data-builder-button-tone="primary"],.site-builder-node--button-primary){background:${ACCENT};color:var(--token-color-primary-on,var(--token-color-background))}`,
  `${S} :is(.site-builder-node--button[data-builder-button-tone="secondary"],.site-builder-node--button-secondary){background:transparent;color:var(--token-color-ink);border:1.5px solid color-mix(in srgb,var(--token-color-ink) 22%,transparent)}`,
  `${OUTLINE} :is(.site-builder-node--button[data-builder-button-tone="primary"],.site-builder-node--button-primary){background:transparent;color:${ACCENT};border:1.5px solid ${ACCENT}}`,

  // ── Header: sticky frosted bar, italic display logo + small tracked trade, muted nav, CTA pill.
  // Phone: bar is the inner row only (padding:0 on outer); desk is full-bleed (no 1120 column).
  `${S} .site-header{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--token-color-background) 88%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-bottom:${RULE} solid color-mix(in srgb,var(--token-color-line) 60%,transparent);color:var(--token-color-ink)}`,
  `${S} .site-header.site-header{padding:0}`,
  `${S} .site-header .site-header__inner.site-header__inner{width:auto;max-width:none;margin:0;min-height:0;padding:${v("layout.header-pad-y-phone")} ${v("layout.gutter-phone")};gap:12px}`,
  `${S} .site-header__brand{display:flex;align-items:baseline;gap:7px;line-height:1}`,
  `${S} .site-header__brand-label{font-family:var(--site-heading-font,Georgia,serif);font-style:${v("type.accent-style")};font-weight:500;font-size:${v("type.logo-size")};line-height:normal;letter-spacing:-0.02em;text-transform:none}`,
  `${S} .site-header__brand-tagline{font-family:var(--site-body-font,inherit);font-size:9.5px;line-height:normal;font-weight:${v("type.label-weight")};letter-spacing:0.2em;text-transform:uppercase;color:var(--token-color-muted)}`,
  `${S} .site-header__nav-list{gap:22px}`,
  `${S} .site-header__nav-link{font-size:${v("type.nav-size")};font-weight:400;color:var(--token-color-muted);text-transform:none;letter-spacing:0;text-decoration:none}`,
  `${S} .site-header__nav-link:hover{color:var(--token-color-ink)}`,
  `${S} .site-header__lang{gap:0;font-size:11.5px;font-weight:${v("type.label-weight")};letter-spacing:0.06em;color:var(--token-color-muted)}`,
  `${S} .site-header__lang .site-header__lang-code{font-size:inherit;letter-spacing:inherit;opacity:1;color:inherit;font-weight:500}`,
  `${S} .site-header__lang .site-header__lang-code[data-active]{color:var(--token-color-ink);font-weight:700}`,
  `${S} .site-header__lang .site-header__lang-sep{opacity:1}`,
  `${S} .site-header__cta.site-btn{height:${v("button.compact-height")};padding:0 ${v("button.compact-padding-x")};border-radius:${v("button.radius")};font-size:${v("type.nav-size")};font-weight:${v("button.font-weight")};text-transform:none;letter-spacing:0;background:${ACCENT};color:var(--token-color-primary-on,var(--token-color-background));border-color:transparent}`,
  `@media (max-width:899px){${S} .site-header__cta.site-btn{display:none}}`,
  `${MQ_DESK}{${S} .site-header .site-header__inner.site-header__inner{padding:${v("layout.header-pad-y")} ${v("layout.gutter")};gap:12px}${S} .site-header__brand-label{font-size:${v("type.logo-size-desktop")}}${S} .site-header .site-header__region:nth-child(2){justify-content:flex-start;margin-left:30px}}`,

  // ── Hero: display heading with accent words, muted lede, rounded photo with inset.
  `${S} #hero{align-items:center}`,
  `${S} #hero h1{margin:6px 0 0;font-size:${v("type.hero-size")};line-height:${v("type.hero-line-height")};font-weight:${v("type.display-weight")}}`,
  `${S} #hero h1 em{font-weight:${v("type.accent-weight")};color:${ACCENT}}`,
  `${S} #hero ${LEDE}{margin-top:12px;font-size:${v("type.lede-size")};max-width:34ch;color:var(--token-color-muted)}`,
  `${S} #hero img{border-radius:${v("shape.image-radius")}}`,
  `${S} #hero img[style*="position:absolute"]{border-radius:${v("shape.media-radius")};box-shadow:0 30px 50px -30px color-mix(in srgb,var(--token-color-ink) 60%,transparent)}`,
  `${MQ_DESK}{${S} #hero h1{font-size:${v("type.hero-size-desktop")};line-height:${v("type.hero-line-height-desktop")}}${S} #hero ${LEDE}{margin-top:22px;font-size:${v("type.lede-size-desktop")};max-width:40ch}${S} #hero img{border-radius:${v("shape.image-radius-desktop")}}${S} #hero img[style*="position:absolute"]{border-radius:${v("shape.media-radius")}}}`,

  // Proof line under the CTAs: small muted, bold lead in ink.
  `${S} #hero .site-builder-node--container + p.site-builder-node--paragraph.site-builder-node--paragraph{margin-top:16px;font-size:12.5px;line-height:1.5;max-width:none;color:var(--token-color-muted)}`,
  `${S} #hero .site-builder-node--container + p.site-builder-node--paragraph b{color:var(--token-color-ink);font-weight:600}`,

  // ── Ticker: the serif marquee variant carries the look; colour from the Look.
  `${S} .site-builder-node--marquee{color:var(--token-color-ink)}`,

  // ── Recent work: bold caption + accent service link.
  `${S} .sb-portfolio-cap{display:flex;justify-content:space-between;gap:8px;margin-top:8px;font-size:13px;font-weight:600;color:var(--token-color-ink)}`,
  `${S} .sb-portfolio-service{margin:0;font-size:13px;font-weight:600;letter-spacing:0;text-transform:none;white-space:nowrap;color:${ACCENT}}`,

  // ── Menu: category chips (phone) / sticky rail (desktop), accent group heads, thumb rows.
  `${S} .site-builder-node--services-catalog-pill{height:${v("button.chip-height")};padding:0 14px;border-radius:${v("shape.chip-radius")};border:${RULE} solid var(--token-color-line);background:var(--token-color-surface-raised,var(--token-color-background));color:var(--token-color-ink);font-size:13px;font-weight:500;text-transform:none;letter-spacing:0}`,
  `${S} .site-builder-node--services-catalog-pill[data-active="true"]{background:var(--token-color-ink);color:var(--token-color-background);border-color:var(--token-color-ink)}`,
  `${S} .site-builder-node--services-catalog-group-title{margin:22px 0 4px;font-family:var(--site-heading-font,Georgia,serif);font-style:${v("type.accent-style")};font-weight:${v("type.accent-weight")};font-size:${v("type.group-title-size")};line-height:1.2}`,
  `${S} .site-builder-node--services-catalog[data-layout="rows"] .site-builder-node--services-catalog-row[data-has-photo]{display:grid;grid-template-columns:64px minmax(0,1fr) auto;grid-template-areas:none;align-items:center;gap:13px;padding:13px 0;border-bottom:${RULE} solid var(--token-color-line)}`,
  `${S} .site-builder-node--services-catalog[data-layout="rows"] .site-builder-node--services-catalog-row[data-has-photo] > *{grid-area:auto}`,
  `${S} .site-builder-node--services-catalog[data-layout="rows"] .site-builder-node--services-catalog-photo{width:64px;height:64px;border-radius:${v("shape.thumb-radius")};background:var(--token-color-blush,var(--token-color-surface-raised))}`,
  `${S} .site-builder-node--services-catalog-copy{max-width:none;gap:3px}`,
  `${S} .site-builder-node--services-catalog-name{font-size:${v("type.body-size")};font-weight:600;line-height:1.3}`,
  `${S} .site-builder-node--services-catalog-duration{font-size:12.5px;color:var(--token-color-muted)}`,
  `${S} .site-builder-node--services-catalog[data-layout="rows"] .site-builder-node--services-catalog-buy{display:flex;flex-direction:row;align-items:center;justify-content:flex-end;gap:10px;width:auto;min-width:0}`,
  `${S} .site-builder-node--services-catalog-price{min-width:0;font-size:13.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--token-color-ink)}`,
  `${S} .site-builder-node--services-catalog-duration[data-price-in-meta]{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:3px}`,
  `${S} .site-builder-node--services-catalog-duration[data-price-in-meta] .site-builder-node--services-catalog-price{display:inline;font-size:12.5px;text-align:left}`,
  `${S} .site-builder-node--services-catalog-mode{font-size:10.5px;font-weight:600;letter-spacing:.04em;padding:2px 7px;border-radius:${v("shape.chip-radius")};background:var(--token-color-blush,var(--token-color-surface-raised));color:${ACCENT}}`,
  `${S} .site-builder-node--services-catalog-pill-count{margin-left:4px;font-size:.85em;opacity:.55;color:inherit}`,
  `${S} .site-builder-node--services-catalog-group-title{display:flex;align-items:baseline;gap:10px}`,
  `${S} .site-builder-node--services-catalog-group-count{font-family:var(--site-body-font,inherit);font-style:normal;font-size:11.5px;font-weight:500;color:var(--token-color-muted)}`,
  `${S} .site-builder-node--services-catalog-demo{font-size:12px;margin:0 0 8px;color:var(--token-color-muted);background:none;padding:0}`,
  `${S} .site-builder-node--services-catalog-cta{min-height:${v("button.chip-height")};height:${v("button.chip-height")};padding:0 14px;border-radius:${v("shape.chip-radius")};border:1.5px solid var(--token-color-ink);background:transparent;color:var(--token-color-ink);font-size:13px;font-weight:600}`,
  `${S} .site-builder-node--services-catalog-cta[data-selected="true"]{background:var(--token-color-accent);border-color:var(--token-color-accent);color:var(--token-color-primary-on,var(--token-color-background))}`,
  `${MQ_DESK}{`,
  `${S} .site-builder-node--services-catalog-body[data-category-nav="rail"]{grid-template-columns:${v("layout.menu-rail-width")} minmax(0,1fr);gap:48px}`,
  `${S} .site-builder-node--services-catalog-body[data-category-nav="rail"] > .site-builder-node--services-catalog-nav{top:90px;gap:4px}`,
  `${S} .site-builder-node--services-catalog-body[data-category-nav="rail"] > .site-builder-node--services-catalog-nav .site-builder-node--services-catalog-pill{height:42px;border-radius:${v("shape.rail-radius")};border-color:transparent;background:none;font-size:${v("type.body-size")};justify-content:space-between}`,
  `${S} .site-builder-node--services-catalog-body[data-category-nav="rail"] > .site-builder-node--services-catalog-nav .site-builder-node--services-catalog-pill[data-active="true"]{background:var(--token-color-ink);color:var(--token-color-background)}`,
  `${S} .site-builder-node--services-catalog[data-layout="rows"] .site-builder-node--services-catalog-list{display:grid;grid-template-columns:repeat(var(--svc-columns,1),minmax(0,1fr));column-gap:36px}`,
  `${S} .site-builder-node--services-catalog-group-title{font-size:${v("type.group-title-size-desktop")};margin-top:10px}`,
  `}`,

  // ── Reviews: raised cards, accent-style display quotes, name.
  `${S} .sb-reviews-card,${S} .sb-reviews-card[data-accent]{min-height:0;gap:12px;padding:18px;border-radius:${v("shape.card-radius")};background:var(--token-color-surface-raised,var(--token-color-background));border:${RULE} solid var(--token-color-line)}`,
  `${S} .sb-reviews-mark{display:none}`,
  `${S} .sb-reviews-quote{font-family:var(--site-heading-font,Georgia,serif);font-style:${v("type.accent-style")};font-weight:${v("type.accent-weight")};font-size:${v("type.quote-size")};line-height:1.35}`,
  `${S} .sb-reviews-meta{margin-top:auto;padding-top:0;border-top:0}`,
  `${S} .sb-reviews-author{display:block;font-style:normal;font-size:13px;font-weight:600;color:var(--token-color-ink)}`,
  `${S} .sb-reviews .site-builder-node--carousel-track{gap:10px}`,
  `${S} .sb-reviews .site-builder-node--carousel-dots{display:none}`,
  `${S} .sb-reviews[data-reviews-layout] .sb-reviews-card{min-height:0}`,
  `${S} .sb-reviews-note{margin:0 0 14px;font-size:13px}`,
  `${S} .sb-reviews-demo{font-size:12.5px}`,
  `${MQ_DESK}{${S} .sb-reviews[data-reviews-layout="trio"] .site-builder-node--carousel-track{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));overflow:visible}}`,

  // ── About: arched portrait, large display line, bigger bio on desktop.
  `${S} #about img{border-radius:${v("shape.image-radius")} ${v("shape.image-radius")} ${v("shape.feature-radius")} ${v("shape.image-radius")}}`,
  `${S} #about h2{margin:6px 0 14px;font-size:${v("type.about-title-size")};line-height:${v("type.display-line-height")};font-weight:${v("type.display-weight")}}`,
  `${S} #about ${LEDE}{font-size:${v("type.body-size")};color:var(--token-color-muted)}`,
  `${MQ_DESK}{${S} #about ${LEDE}{font-size:${v("type.about-body-size-desktop")}}}`,

  // ── Visit: hairline grid of raised tiles, 2-up phone / 4-up desktop.
  `${S} .sb-visit-inner{max-width:${v("layout.content-max-width")}}`,
  `${S} .sb-visit-facts{display:grid;grid-template-columns:1fr 1fr;gap:${RULE};background:var(--token-color-line);border:${RULE} solid var(--token-color-line);border-radius:${v("shape.media-radius")};overflow:hidden}`,
  `${S} .sb-visit-fact{display:block;padding:14px;border:0;background:var(--token-color-surface-raised,var(--token-color-background))}`,
  `${S} .sb-visit-fact-icon{display:none}`,
  `${S} .sb-visit-fact-label{margin:0 0 4px;font-size:10.5px;font-weight:${v("type.label-weight")};letter-spacing:0.14em;text-transform:uppercase;color:var(--token-color-muted)}`,
  `${S} .sb-visit-fact-value{margin:0;font-size:14px;font-weight:600;line-height:1.35}`,
  `${MQ_DESK}{${S} .sb-visit-facts{grid-template-columns:repeat(4,1fr)}}`,

  // ── FAQ: hairline rows, "+" in the accent. Item chrome is a renderer default, hence !important.
  `${S} #contact .site-builder-node--accordion{gap:0!important}`,
  `${S} #contact .site-builder-node--accordion-item{border:0!important;border-bottom:${RULE} solid var(--token-color-line)!important;border-radius:0!important;padding:14px 0!important}`,
  `${S} #contact .site-builder-node--accordion-item > summary{list-style:none;display:flex;justify-content:space-between;gap:12px;font-size:${v("type.body-size")};font-weight:600!important;cursor:pointer}`,
  `${S} #contact .site-builder-node--accordion-item > summary::-webkit-details-marker{display:none}`,
  `${S} #contact .site-builder-node--accordion-item > summary::after{content:"+";font-size:22px;line-height:1;font-weight:400;color:${ACCENT}}`,
  `${S} #contact .site-builder-node--accordion-item[open] > summary::after{content:"\\2013"}`,
  `${S} #contact .site-builder-node--accordion-item p{font-size:14px;color:var(--token-color-muted)}`,

  // ── Footer: ink band, big accent-style line, page-colour pill.
  `${S} #site-footer h2{margin:0;font-style:${v("type.accent-style")};font-weight:${v("type.accent-weight")};font-size:${v("type.footer-title-size")};line-height:1;color:var(--token-color-background)}`,
  `${S} #site-footer p.site-builder-node--paragraph{color:color-mix(in srgb,var(--token-color-background) 60%,transparent);font-size:11.5px}`,
  `${S} #site-footer .site-builder-node--button{background:var(--token-color-background);color:var(--token-color-ink);border:0}`,
  `${S} #site-footer h2 + p.site-builder-node--paragraph{margin:10px 0 18px;font-size:${v("type.body-size")};color:color-mix(in srgb,var(--token-color-background) 70%,transparent)}`,
  `${MQ_DESK}{${S} #site-footer h2{font-size:${v("type.footer-title-size-desktop")}}}`,

  // ── Dock: one frosted capsule.
  `${S} .cb-island .cb-bar[data-bar-style="pill"]{border-radius:${v("button.radius")};padding:6px;${frosted}}`,
  `${S} .cb-island .cb-bar[data-bar-style="pill"] .cb-bar-chat{background:var(--token-color-blush,var(--token-color-surface-raised));color:${ACCENT}}`,
  `${S} .cb-island .cb-bar[data-bar-style="pill"] .cb-bar-go{background:${ACCENT};color:var(--token-color-primary-on,var(--token-color-background));font-weight:${v("button.font-weight")};font-family:var(--site-body-font,inherit)}`,
  // Active: chat first, then the summary, then Continue, in the same capsule.
  `${S} .cb-island .cb-dock{left:12px;right:12px;bottom:14px;gap:8px;padding:6px;border-radius:${v("button.radius")};${frosted}}`,
  `${S} .cb-island .cb-dock-stack{display:none}`,
  `${S} .cb-island .cb-dock-ask{order:-1;width:${v("button.height")};height:${v("button.height")};border:0;background:var(--token-color-blush,var(--token-color-surface-raised));color:${ACCENT}}`,
  `${S} .cb-island .cb-dock-info{padding:0 4px}`,
  `${S} .cb-island .cb-dock-go{height:${v("button.height")};border-radius:${v("button.radius")};padding:0 ${v("button.padding-x")};background:${ACCENT};font-weight:${v("button.font-weight")}}`,
  `${S} .cb-island .cb-dock-go::after,${S} .cb-island .cb-dock-arr{display:none}`,
  `${MQ_DESK}{${S} .cb-island .cb-dock{left:50%;right:auto;transform:translateX(-50%);width:560px;bottom:22px}}`,

  // Section rhythm on desktop: display titles and subtitles.
  `${MQ_DESK}{${S} h2{font-size:${v("type.section-title-size-desktop")}}${S} :is(${TITLE_HOOKS}){font-size:${v("type.section-title-size-desktop")}}${S} .site-builder-node--services-catalog-subtitle{font-size:${v("type.body-size")}}}`,
].join("\n");

/**
 * Magazine type system (Folio): masthead bar + rate-card rows. Values are
 * style tokens — Folio ships square buttons / 1px rules / label tracking as
 * defaults; any Design can opt in with `type.system = "magazine"`.
 */
const M =
  '[data-theme-canvas-root]:where([data-token-type-system="magazine"],[data-token-type-system="magazine"] *)';
const LABEL_FACE =
  "var(--token-typography-label-font-family,var(--token-shell-header-nav-font,var(--site-body-font,system-ui,sans-serif)))";

export const MAGAZINE_TYPE_SYSTEM_CSS = [
  `${M}{font-family:var(--site-body-font,system-ui,sans-serif);color:var(--token-color-ink);background:var(--token-color-background)}`,
  `${M} .site-header{position:sticky;top:0;z-index:40;background:var(--token-shell-header-bg,var(--token-color-background));border-bottom:${RULE} solid var(--token-shell-header-border,var(--token-color-ink));box-shadow:none}`,
  `${M} .site-header__inner{min-height:52px;padding:0 16px}`,
  `${M} .site-header__brand-label{font-family:var(--site-heading-font,var(--token-typography-heading-font-family,Georgia,serif));font-weight:${v("type.display-weight")};font-size:22px;letter-spacing:${v("type.display-tracking")};text-transform:none}`,
  `${M} .site-header__nav-link{font-family:${LABEL_FACE};font-size:${v("type.label-size")};font-weight:${v("type.label-weight")};letter-spacing:${v("type.label-tracking")};text-transform:var(--site-label-case,uppercase);color:var(--token-shell-header-text,var(--token-color-ink))}`,
  `${M} .site-header__nav-link:hover{color:var(--token-color-muted)}`,
  `${M} .site-header__cta.site-btn,${M} .site-header__ritem.site-header__cta{height:${v("button.height")};min-height:${v("button.height")};padding:0 ${v("button.padding-x")};border-radius:${v("button.radius")};border:${RULE} solid var(--token-color-ink);background:var(--token-color-ink);color:var(--token-color-background);font-family:${LABEL_FACE};font-size:${v("button.font-size")};font-weight:${v("button.font-weight")};letter-spacing:${v("type.label-tracking")};text-transform:var(--site-label-case,uppercase);box-shadow:none}`,
  `${M}[data-talent-theme-preview] .site-header__actions::before,${M}[data-talent-theme-preview] .site-header__region[data-region="right"]::before{content:"DEMO";display:inline-flex;align-items:center;height:28px;margin-right:10px;padding:0 8px;border:${RULE} solid var(--token-color-line);font-family:${LABEL_FACE};font-size:10px;font-weight:600;letter-spacing:0.2em;color:var(--token-color-muted)}`,
  `@media (max-width:767px){${M} .site-header__nav{display:none}${M} .site-header__cta.site-btn{display:inline-flex;min-height:44px;height:44px}}`,
  `${M} .site-builder-node--services-catalog[data-layout="rate_card"]{padding:52px 16px 0}`,
  `${M} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--services-catalog-eyebrow,${M} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--services-catalog-group-title{font-family:${LABEL_FACE};font-size:${v("type.label-size")};font-weight:${v("type.label-weight")};letter-spacing:0.2em;text-transform:var(--site-label-case,uppercase);color:var(--token-color-muted)}`,
  `${M} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--services-catalog-title{font-family:var(--site-heading-font,var(--token-typography-heading-font-family,Georgia,serif));font-weight:${v("type.display-weight")};font-size:clamp(${v("type.section-title-size")},6vw,${v("type.section-title-size-desktop")});letter-spacing:${v("type.display-tracking")};line-height:0.95}`,
  `${M} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--services-catalog-row{border-bottom:${RULE} solid var(--token-color-ink);background:transparent;border-radius:${v("button.radius")};box-shadow:none;padding:14px 0}`,
  `${M} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--services-catalog-name{font-family:var(--site-body-font,system-ui,sans-serif);font-size:16px;font-weight:500;letter-spacing:0}`,
  `${M} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--services-catalog-duration{font-family:${LABEL_FACE};font-size:${v("type.label-size")};letter-spacing:0.14em;text-transform:var(--site-label-case,uppercase);color:var(--token-color-muted)}`,
  `${M} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--services-catalog-price{font-family:var(--site-heading-font,var(--token-typography-heading-font-family,Georgia,serif));font-size:22px;font-weight:${v("type.display-weight")};font-style:italic}`,
  `${M} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--services-catalog-buy .site-btn,${M} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--button{border-radius:${v("button.radius")};min-height:${v("button.height")};height:${v("button.height")};font-family:${LABEL_FACE};font-size:${v("button.font-size")};letter-spacing:0.16em;text-transform:var(--site-label-case,uppercase);box-shadow:none}`,
  `@media (min-width:900px){${M} .site-builder-node--services-catalog[data-layout="rate_card"]{padding:90px 40px 0}${M} .site-header__inner{padding:0 40px}}`,
].join("\n");

/** True when the effective tokens switch the editorial type system on. */
export function isEditorialTypeSystem(tokens: Readonly<Record<string, string>>): boolean {
  return tokens["type.system"] === "editorial";
}

export function isMagazineTypeSystem(tokens: Readonly<Record<string, string>>): boolean {
  return tokens["type.system"] === "magazine";
}

/**
 * Component defaults under editorial / magazine systems. The platform default
 * paints every button as a 10px accent block (secondary included) and pins
 * heading / paragraph colours inline, which beat the stylesheet. Both systems
 * drop those and keep only an inline radius bound to the button token.
 */
export function typeSystemComponentStyleDefaults(
  tokens: Readonly<Record<string, string>>,
  base: ComponentStyleDefaults,
): ComponentStyleDefaults {
  if (!isEditorialTypeSystem(tokens) && !isMagazineTypeSystem(tokens)) return base;
  const out: ComponentStyleDefaults = { ...base };
  delete out.heading;
  delete out.paragraph;
  out.button = { borderRadius: styleTokenRef("button.radius") };
  return out;
}

