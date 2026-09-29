/**
 * Design skins: the type rhythm and component shapes a collection Design
 * needs beyond what shared widget props express (Bodoni display sizes, pill
 * 48px buttons, blurred sticky header, 34px hero image...). Scoped to
 * `[data-talent-design="<slug>"]`, which the theme preview and the live talent
 * site set on their canvas root. Colours are token vars only (the Look owns
 * colour), fonts are the typography token vars, so a palette or font change
 * still restyles everything. Designs themselves stay free of custom CSS
 * (`validate.ts` forbids it per node); this is the shared, reviewed layer.
 *
 * Widget props (node inline styles) still win over the skin, so a talent's
 * builder edits are never overridden. The one exception is the FAQ accordion,
 * whose item chrome is a renderer default (not a talent prop).
 */
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";

const S = '[data-talent-design="maison-v2"]';
const MQ_DESK = "@media (min-width:900px)";

/** Maison v2 = the Rosé proposal's type and shape layer (artifact CSS values). */
const MAISON_V2_SKIN = [
  // ── Base: Figtree body, Bodoni display headings, italic accent spans.
  `${S}{font-family:var(--site-body-font,system-ui,sans-serif);color:var(--token-color-ink);font-size:15px;line-height:1.5;letter-spacing:normal}`,
  `${S} :is(h1,h2,h3){font-family:var(--site-heading-font,Georgia,serif);font-weight:500;letter-spacing:-0.01em;text-wrap:balance}`,
  `${S} :is(h1,h2,h3) em{font-style:italic;font-weight:400;color:var(--token-color-accent,var(--token-color-primary))}`,
  `${S} h2{font-size:34px;line-height:1.02}`,
  `${S} p.site-builder-node--paragraph{color:var(--token-color-muted)}`,
  // Eyebrows (uppercase paragraphs): 11px Figtree 600, 0.18em.
  `${S} p.site-builder-node--paragraph[style*="text-transform:uppercase"]{font-size:11px;font-weight:600;letter-spacing:0.18em}`,
  `${S} :is(.sb-portfolio-eyebrow,.sb-reviews-eyebrow,.sb-visit-eyebrow,.site-builder-node--services-catalog-eyebrow){margin:0;line-height:normal;font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:var(--token-color-accent,var(--token-color-primary))}`,
  `${S} :is(.sb-portfolio-title,.sb-reviews-title,.sb-visit-title,.site-builder-node--services-catalog-title){margin:4px 0 0;font-family:var(--site-heading-font,Georgia,serif);font-weight:500;font-size:34px;line-height:1.02;letter-spacing:-0.01em;color:var(--token-color-ink)}`,
  `${S} :is(.sb-portfolio-title,.sb-reviews-title,.sb-visit-title,.site-builder-node--services-catalog-title) em{font-style:italic;font-weight:inherit;color:var(--token-color-accent,var(--token-color-primary))}`,
  `${S} :is(.sb-portfolio-header,.sb-reviews-header,.sb-visit-header,.site-builder-node--services-catalog-header){margin-bottom:16px}`,
  `${S} .site-builder-node--services-catalog-subtitle{margin:6px 0 0;font-size:13.5px;color:var(--token-color-muted);max-width:40ch}`,

  // ── Buttons: 48px pills (shape from the Design's component defaults), accent fill; secondary is the ghost.
  `${S} .site-builder-node--button{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:48px;padding:0 22px;border-radius:999px;border:0;text-transform:none;letter-spacing:0;font-size:15px;font-weight:600;font-family:var(--site-body-font,inherit);white-space:nowrap;text-decoration:none;transition:transform .15s ease}`,
  `${S} .site-builder-node--button:active{transform:scale(.98)}`,
  `${S} :is(.site-builder-node--button[data-builder-button-tone="primary"],.site-builder-node--button-primary){background:var(--token-color-accent,var(--token-color-primary));color:var(--token-color-primary-on,var(--token-color-background))}`,
  `${S} :is(.site-builder-node--button[data-builder-button-tone="secondary"],.site-builder-node--button-secondary){background:transparent;color:var(--token-color-ink);border:1.5px solid color-mix(in srgb,var(--token-color-ink) 22%,transparent)}`,

  // ── Row 1 Header: sticky frosted bar, italic Bodoni logo + small tracked trade, muted nav, ES/EN, CTA pill.
  `${S} .site-header{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--token-color-background) 88%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-bottom:1px solid color-mix(in srgb,var(--token-color-line) 60%,transparent);color:var(--token-color-ink)}`,
  `${S} .site-header__inner{padding:10px 18px;gap:12px}`,
  `${S} .site-header__brand{display:flex;align-items:baseline;gap:7px;line-height:1}`,
  `${S} .site-header__brand-label{font-family:var(--site-heading-font,Georgia,serif);font-style:italic;font-weight:500;font-size:24px;line-height:normal;letter-spacing:-0.02em;text-transform:none}`,
  `${S} .site-header__brand-tagline{font-family:var(--site-body-font,inherit);font-size:9.5px;line-height:normal;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:var(--token-color-muted)}`,
  `${S} .site-header__nav-list{gap:22px}`,
  `${S} .site-header__nav-link{font-size:13.5px;font-weight:400;color:var(--token-color-muted);text-transform:none;letter-spacing:0;text-decoration:none}`,
  `${S} .site-header__nav-link:hover{color:var(--token-color-ink)}`,
  `${S} .site-header__lang{gap:0;font-size:11.5px;font-weight:600;letter-spacing:0.06em;color:var(--token-color-muted)}`,
  `${S} .site-header__lang .site-header__lang-code{font-size:inherit;letter-spacing:inherit;opacity:1;color:inherit}`,
  `${S} .site-header__lang .site-header__lang-code[data-active]{color:var(--token-color-ink)}`,
  `${S} .site-header__lang .site-header__lang-sep{opacity:1}`,
  `${S} .site-header__cta.site-btn{height:36px;padding:0 16px;border-radius:999px;font-size:13.5px;font-weight:600;text-transform:none;letter-spacing:0;background:var(--token-color-accent,var(--token-color-primary));color:var(--token-color-primary-on,var(--token-color-background));border-color:transparent}`,
  `@media (max-width:899px){${S} .site-header__cta.site-btn{display:none}}`,
  `${MQ_DESK}{${S} .site-header__inner{padding:14px 48px}${S} .site-header__brand-label{font-size:28px}}`,
  // `.m-hdr`: one full-width bar (no centred 1120 column), nav right after the logo.
  `${MQ_DESK}{${S} .site-header.site-header{padding:0}${S} .site-header .site-header__inner.site-header__inner{width:auto;max-width:none;margin:0;padding:14px 48px;gap:12px}${S} .site-header .site-header__region:nth-child(2){justify-content:flex-start;margin-left:30px}}`,

  // ── Row 2 Hero: 47px / 96px heading with italic accent, muted lede, 26px / 34px photo, 20px inset.
  `${S} #hero{align-items:center}`,
  `${S} #hero h1{margin:6px 0 0;font-size:47px;line-height:.98;font-weight:500}`,
  `${S} #hero h1 em{font-weight:400;color:var(--token-color-accent,var(--token-color-primary))}`,
  `${S} #hero p.site-builder-node--paragraph:not([style*="text-transform:uppercase"]){margin-top:12px;font-size:15.5px;max-width:34ch;color:var(--token-color-muted)}`,
  `${S} #hero img{border-radius:26px}`,
  `${S} #hero img[style*="position:absolute"]{border-radius:20px;box-shadow:0 30px 50px -30px color-mix(in srgb,var(--token-color-ink) 60%,transparent)}`,
  `${MQ_DESK}{${S} #hero h1{font-size:96px;line-height:.93}${S} #hero p.site-builder-node--paragraph:not([style*="text-transform:uppercase"]){margin-top:22px;font-size:18px;max-width:40ch}${S} #hero img{border-radius:34px}${S} #hero img[style*="position:absolute"]{border-radius:20px}}`,

  // Proof line under the CTAs (`.proofline`): 12.5px muted, bold lead in ink.
  `${S} #hero .site-builder-node--container + p.site-builder-node--paragraph.site-builder-node--paragraph{margin-top:16px;font-size:12.5px;line-height:1.5;max-width:none;color:var(--token-color-muted)}`,
  `${S} #hero .site-builder-node--container + p.site-builder-node--paragraph b{color:var(--token-color-ink);font-weight:600}`,

  // ── Row 3 Ticker: the serif marquee variant carries the look; colour from the Look.
  `${S} .site-builder-node--marquee{color:var(--token-color-ink);letter-spacing:normal}`,
  `${S} .site-builder-node--marquee :is(.site-builder-node--marquee-item,.site-builder-node--marquee-sep){line-height:normal;letter-spacing:normal}`,
  `${S} .site-builder-node--marquee .site-builder-node--marquee-item{line-height:1.54}`,

  // ── Row 4 Recent work: 3:4 frames, 20px radius, bold caption + accent service link.
  `${S} .sb-portfolio-cap{display:flex;justify-content:space-between;gap:8px;margin-top:8px;font-size:13px;line-height:1.5;font-weight:600;color:var(--token-color-ink)}`,
  `${S} .sb-portfolio-shot{font:inherit}`,
  // Phone filmstrip bleeds to the screen edge (`.strip{margin:0 -18px;padding:0 18px 6px}`).
  `@media (max-width:899px){${S} .sb-portfolio--staggered{margin:0 -18px;padding:0 18px 6px}}`,
  `${S} .sb-portfolio-service{margin:0;font-size:13px;font-weight:600;letter-spacing:0;text-transform:none;white-space:nowrap;color:var(--token-color-accent,var(--token-color-primary))}`,

  // ── Row 5 Menu: category chips (phone) / sticky 240px rail (desktop), italic group heads, 64px thumb rows.
  `${S} .site-builder-node--services-catalog-pill{height:34px;padding:0 14px;border-radius:99px;border:1px solid var(--token-color-line);background:var(--token-color-surface-raised,var(--token-color-background));color:var(--token-color-ink);font-size:13px;font-weight:500;text-transform:none;letter-spacing:0}`,
  `${S} .site-builder-node--services-catalog-pill[data-active="true"]{background:var(--token-color-ink);color:var(--token-color-background);border-color:var(--token-color-ink)}`,
  `${S} .site-builder-node--services-catalog{letter-spacing:normal}`,
  `${S} .site-builder-node--services-catalog-group-title{margin:22px 0 4px;font-family:var(--site-heading-font,Georgia,serif);font-style:italic;font-weight:400;font-size:22px;line-height:normal;letter-spacing:normal}`,
  // Phone: the chip row sticks under the header and bleeds to the edges (`.cats`).
  `@media (max-width:899px){${S} .site-builder-node--services-catalog-nav{position:sticky;top:57px;z-index:4;gap:7px;margin:0 -18px;padding:10px 18px;background:color-mix(in srgb,var(--token-color-background) 92%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);scrollbar-width:none}}`,
  `${S} .site-builder-node--services-catalog[data-layout="rows"] .site-builder-node--services-catalog-row[data-has-photo]{display:grid;grid-template-columns:64px minmax(0,1fr) auto;grid-template-areas:none;align-items:center;gap:13px;padding:13px 0;border-bottom:1px solid var(--token-color-line)}`,
  `${S} .site-builder-node--services-catalog[data-layout="rows"] .site-builder-node--services-catalog-row[data-has-photo] :is(.site-builder-node--services-catalog-photo,.site-builder-node--services-catalog-copy,.site-builder-node--services-catalog-buy){grid-area:auto}`,
  `${S} .site-builder-node--services-catalog[data-layout="rows"] .site-builder-node--services-catalog-photo{width:64px;height:64px;border-radius:14px;background:var(--token-color-blush,var(--token-color-surface-raised))}`,
  `${S} .site-builder-node--services-catalog-copy{max-width:none;gap:3px}`,
  `${S} .site-builder-node--services-catalog-name{font-size:15px;font-weight:600;line-height:1.3}`,
  `${S} .site-builder-node--services-catalog-name-text{-webkit-line-clamp:3;text-wrap:pretty}`,
  `${S} .site-builder-node--services-catalog-duration{font-size:12.5px;color:var(--token-color-muted)}`,
  `${S} .site-builder-node--services-catalog[data-layout="rows"] .site-builder-node--services-catalog-buy{display:flex;flex-direction:row;align-items:center;justify-content:flex-end;gap:10px;width:auto;min-width:0}`,
  `${S} .site-builder-node--services-catalog-price{min-width:0;font-size:13.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--token-color-ink)}`,
  `${S} .site-builder-node--services-catalog-duration[data-price-in-meta]{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:3px}`,
  `${S} .site-builder-node--services-catalog-duration[data-price-in-meta] .site-builder-node--services-catalog-price{display:inline;font-size:12.5px;text-align:left}`,
  `${S} .site-builder-node--services-catalog-mode{font-size:10.5px;font-weight:600;letter-spacing:.04em;padding:2px 7px;border-radius:99px;background:var(--token-color-blush,var(--token-color-surface-raised));color:var(--token-color-accent,var(--token-color-primary))}`,
  `${S} .site-builder-node--services-catalog-pill-count{margin-left:4px;font-size:.85em;opacity:.55;color:inherit}`,
  `${S} .site-builder-node--services-catalog-group-title{display:flex;align-items:baseline;gap:10px}`,
  `${S} .site-builder-node--services-catalog-group-count{font-family:var(--site-body-font,inherit);font-style:normal;font-size:11.5px;font-weight:500;color:var(--token-color-muted)}`,
  `${S} .site-builder-node--services-catalog-cta{min-height:34px;height:34px;padding:0 14px;border-radius:99px;border:1.5px solid var(--token-color-ink);background:transparent;color:var(--token-color-ink);font-size:13px;font-weight:600}`,
  `${S} .site-builder-node--services-catalog-cta[data-selected="true"]{background:var(--token-color-accent);border-color:var(--token-color-accent);color:var(--token-color-primary-on,var(--token-color-background))}`,
  `${MQ_DESK}{`,
  `${S} .site-builder-node--services-catalog-body[data-category-nav="rail"]{grid-template-columns:240px minmax(0,1fr);gap:48px}`,
  `${S} .site-builder-node--services-catalog-body[data-category-nav="rail"] > .site-builder-node--services-catalog-nav{top:90px;gap:4px}`,
  `${S} .site-builder-node--services-catalog-body[data-category-nav="rail"] > .site-builder-node--services-catalog-nav .site-builder-node--services-catalog-pill{height:42px;border-radius:12px;border-color:transparent;background:none;font-size:15px;justify-content:space-between}`,
  `${S} .site-builder-node--services-catalog-body[data-category-nav="rail"] > .site-builder-node--services-catalog-nav .site-builder-node--services-catalog-pill[data-active="true"]{background:var(--token-color-ink);color:var(--token-color-background)}`,
  `${S} .site-builder-node--services-catalog[data-layout="rows"] .site-builder-node--services-catalog-list{display:grid;grid-template-columns:repeat(var(--svc-columns,1),minmax(0,1fr));column-gap:36px}`,
  `${S} .site-builder-node--services-catalog-group-title{font-size:28px;margin-top:10px}`,
  `}`,

  // ── Row 6 Reviews: white 22px cards, italic Bodoni quotes, initials + name.
  `${S} .sb-reviews-card,${S} .sb-reviews-card[data-accent]{min-height:0;gap:12px;padding:18px;border-radius:22px;background:var(--token-color-surface-raised,var(--token-color-background));border:1px solid var(--token-color-line)}`,
  `${S} .sb-reviews-mark{display:none}`,
  `${S} .sb-reviews-quote{font-family:var(--site-heading-font,Georgia,serif);font-style:italic;font-weight:400;font-size:19px;line-height:1.35}`,
  `${S} .sb-reviews-meta{margin-top:auto;padding-top:0;border-top:0}`,
  `${S} .sb-reviews-author{display:block;font-style:normal;font-size:13px;font-weight:600;color:var(--token-color-ink)}`,
  `${S} .sb-reviews .site-builder-node--carousel-track{gap:10px}`,
  `${S} .sb-reviews .site-builder-node--carousel-dots{display:none}`,
  `${S} .sb-reviews[data-reviews-layout] .sb-reviews-card{min-height:0}`,
  `${S} .sb-reviews-note{margin:0 0 14px;font-size:13px}`,
  `${S} .sb-reviews-demo{font-size:12.5px}`,
  `${MQ_DESK}{${S} .sb-reviews[data-reviews-layout="trio"] .site-builder-node--carousel-track{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));overflow:visible}}`,

  // ── Row 7 About: the proposal's 26/26/140/26 arch, large display line, 17px bio.
  `${S} #about img{border-radius:26px 26px 140px 26px}`,
  `${S} #about h2{margin:6px 0 14px;font-size:clamp(32px,4vw,56px);line-height:1.02;font-weight:450}`,
  `${S} #about h2 em{font-weight:inherit}`,
  `${S} #about p.site-builder-node--paragraph:not([style*="text-transform:uppercase"]){font-size:15px;color:var(--token-color-muted)}`,
  `${MQ_DESK}{${S} #about p.site-builder-node--paragraph:not([style*="text-transform:uppercase"]){font-size:17px}}`,

  // ── Row 8 Visit: hairline grid of white tiles, 2-up phone / 4-up desktop.
  `${S} .sb-visit-inner{max-width:none}`,
  `${S} .sb-visit-facts{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--token-color-line);border:1px solid var(--token-color-line);border-radius:20px;overflow:hidden}`,
  `${S} .sb-visit-fact{display:block;padding:14px;border:0;background:var(--token-color-surface-raised,var(--token-color-background))}`,
  `${S} .sb-visit-fact-icon{display:none}`,
  `${S} .sb-visit-fact-label{margin:0 0 4px;font-size:10.5px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:var(--token-color-muted)}`,
  `${S} .sb-visit-fact-value{margin:0;font-size:14px;font-weight:600;line-height:1.35}`,
  `${MQ_DESK}{${S} .sb-visit-facts{grid-template-columns:repeat(4,1fr)}}`,

  // ── Row 9 FAQ: hairline rows, "+" in the accent. Item chrome is a renderer default, hence !important.
  `${S} #contact .site-builder-node--accordion{gap:0!important}`,
  `${S} #contact .site-builder-node--accordion-item{border:0!important;border-bottom:1px solid var(--token-color-line)!important;border-radius:0!important;padding:14px 0!important}`,
  `${S} #contact .site-builder-node--accordion-item > summary{list-style:none;display:flex;justify-content:space-between;gap:12px;font-size:15px;font-weight:600!important;cursor:pointer}`,
  `${S} #contact .site-builder-node--accordion-item > summary::-webkit-details-marker{display:none}`,
  `${S} #contact .site-builder-node--accordion-item > summary::after{content:"+";font-size:22px;line-height:1;font-weight:400;color:var(--token-color-accent,var(--token-color-primary))}`,
  `${S} #contact .site-builder-node--accordion-item[open] > summary::after{content:"\\2013"}`,
  `${S} #contact .site-builder-node--accordion-item p{font-size:14px;color:var(--token-color-muted)}`,

  // ── Row 10 Footer: ink band, 44px / 88px italic line, page-colour pill.
  `${S} #site-footer h2{margin:0;font-style:italic;font-weight:400;font-size:44px;line-height:1;color:var(--token-color-background)}`,
  `${S} #site-footer p.site-builder-node--paragraph{color:color-mix(in srgb,var(--token-color-background) 60%,transparent);font-size:11.5px}`,
  `${S} #site-footer .site-builder-node--social-text{margin:0;font-size:11.5px;color:color-mix(in srgb,var(--token-color-background) 60%,transparent)}`,
  `${S} #site-footer .site-builder-node--button{background:var(--token-color-background);color:var(--token-color-ink);border:0}`,
  `${S} #site-footer h2 + p.site-builder-node--paragraph{margin:10px 0 0;font-size:15px;color:color-mix(in srgb,var(--token-color-background) 70%,transparent)}`,
  `${MQ_DESK}{${S} #site-footer h2{font-size:88px}}`,

  // ── Row 11 Dock: one frosted capsule.
  `${S} .cb-island .cb-bar[data-bar-style="pill"]{border-radius:999px;padding:6px;background:color-mix(in srgb,var(--token-color-surface-raised,var(--token-color-background)) 82%,transparent);border:1px solid color-mix(in srgb,var(--token-color-line) 80%,transparent);box-shadow:0 18px 40px -18px color-mix(in srgb,var(--token-color-ink) 45%,transparent)}`,
  `${S} .cb-island .cb-bar[data-bar-style="pill"] .cb-bar-chat{background:var(--token-color-blush,var(--token-color-surface-raised));color:var(--token-color-accent,var(--token-color-primary))}`,
  `${S} .cb-island .cb-bar[data-bar-style="pill"] .cb-bar-go{background:var(--token-color-accent,var(--token-color-primary));color:var(--token-color-primary-on,var(--token-color-background));font-weight:600;font-family:var(--site-body-font,inherit)}`,
  // Active: chat first, then the summary, then Continuar, in the same capsule.
  `${S} .cb-island .cb-dock{left:12px;right:12px;bottom:14px;gap:8px;padding:6px;border-radius:999px;background:color-mix(in srgb,var(--token-color-surface-raised,var(--token-color-background)) 82%,transparent);border:1px solid color-mix(in srgb,var(--token-color-line) 80%,transparent);box-shadow:0 18px 40px -18px color-mix(in srgb,var(--token-color-ink) 45%,transparent)}`,
  `${S} .cb-island .cb-dock-stack{display:none}`,
  `${S} .cb-island .cb-dock-ask{order:-1;width:48px;height:48px;border:0;background:var(--token-color-blush,var(--token-color-surface-raised));color:var(--token-color-accent,var(--token-color-primary))}`,
  `${S} .cb-island .cb-dock-info{padding:0 4px}`,
  `${S} .cb-island .cb-dock-go{height:48px;border-radius:999px;padding:0 22px;background:var(--token-color-accent,var(--token-color-primary));font-weight:600}`,
  `${S} .cb-island .cb-dock-go::after,${S} .cb-island .cb-dock-arr{display:none}`,
  `${MQ_DESK}{${S} .cb-island .cb-dock{left:50%;right:auto;transform:translateX(-50%);width:560px;bottom:22px}}`,

  // Section rhythm on desktop: 58px display titles.
  `${MQ_DESK}{${S} h2{font-size:58px}${S} :is(.sb-portfolio-title,.sb-reviews-title,.sb-visit-title,.site-builder-node--services-catalog-title){font-size:58px}${S} .site-builder-node--services-catalog-subtitle{font-size:15px}}`,
].join("\n");

const SKINS: Readonly<Record<string, string>> = {
  "maison-v2": MAISON_V2_SKIN,
};

/** The skin stylesheet for a design slug, or null when it has none. */
export function designSkinCss(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return SKINS[slug.trim().toLowerCase()] ?? null;
}

/**
 * Per-kind component defaults a Design swaps in for the platform's. The
 * platform default paints every button as a 10px accent block (secondary
 * included) and pins heading / paragraph colours inline, which beat the skin
 * (inline > stylesheet) and put ink text on the dark footer. Maison v2 keeps
 * only the pill shape; colours come from the skin by tone. A node's own
 * builder style still wins over these defaults.
 */
const DESIGN_COMPONENT_STYLES: Readonly<
  Record<string, { set: ComponentStyleDefaults; drop: ReadonlyArray<keyof ComponentStyleDefaults> }>
> = {
  "maison-v2": {
    set: { button: { borderRadius: "999px" } },
    drop: ["heading", "paragraph"],
  },
};

export function designComponentStyleDefaults(
  slug: string | null | undefined,
  base: ComponentStyleDefaults,
): ComponentStyleDefaults {
  const entry = slug ? DESIGN_COMPONENT_STYLES[slug.trim().toLowerCase()] : undefined;
  if (!entry) return base;
  const out: ComponentStyleDefaults = { ...base };
  for (const key of entry.drop) delete out[key];
  return { ...out, ...entry.set };
}
