/**
 * Design skins: type rhythm and component shapes a collection Design needs
 * beyond shared widget props. Scoped to `[data-talent-design="<slug>"]` on the
 * theme preview and live Max-site canvas. Colours are token vars only (the Look
 * owns colour); fonts follow typography token vars. No hex here.
 */

const F = '[data-talent-design="folio"]';

/**
 * Folio masthead bar + rate-card rows (Builder map rows 1 and 6).
 * Sticky stone bar, ink rule, tracked caps nav, square CTA; phone = name + CTA.
 * Rate card: ruled rows, Instrument Serif prices, no cards.
 */
const FOLIO_SKIN = [
  `${F}{font-family:var(--site-body-font,system-ui,sans-serif);color:var(--token-color-ink);background:var(--token-color-background)}`,
  // Masthead bar (HEADER)
  `${F} .site-header{position:sticky;top:0;z-index:40;background:var(--token-color-background);border-bottom:1px solid var(--token-color-ink);box-shadow:none}`,
  `${F} .site-header__inner{min-height:52px;padding:0 16px}`,
  `${F} .site-header__brand-label{font-family:var(--site-heading-font,Georgia,serif);font-weight:400;font-size:22px;letter-spacing:-0.02em;text-transform:none}`,
  `${F} .site-header__nav-link{font-family:"Archivo Narrow",var(--site-body-font,system-ui,sans-serif);font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:var(--token-color-ink)}`,
  `${F} .site-header__nav-link:hover{color:var(--token-color-muted)}`,
  `${F} .site-header__cta.site-btn,${F} .site-header__ritem.site-header__cta{height:40px;min-height:40px;padding:0 16px;border-radius:0;border:1px solid var(--token-color-ink);background:var(--token-color-ink);color:var(--token-color-background);font-family:"Archivo Narrow",var(--site-body-font,system-ui,sans-serif);font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;box-shadow:none}`,
  // DEMO chip on theme preview only (artifact masthead bar)
  `${F}[data-talent-theme-preview] .site-header__actions::before,${F}[data-talent-theme-preview] .site-header__region[data-region="right"]::before{content:"DEMO";display:inline-flex;align-items:center;height:28px;margin-right:10px;padding:0 8px;border:1px solid var(--token-color-line);font-family:"Archivo Narrow",var(--site-body-font,system-ui,sans-serif);font-size:10px;font-weight:600;letter-spacing:0.2em;color:var(--token-color-muted)}`,
  `@media (max-width:767px){${F} .site-header__nav{display:none}${F} .site-header__cta.site-btn{display:inline-flex;min-height:44px;height:44px}}`,
  // Rate card rows (RATE CARD)
  `${F} .site-builder-node--services-catalog[data-layout="rate_card"]{padding:52px 16px 0}`,
  `${F} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--services-catalog-eyebrow,${F} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--services-catalog-group-title{font-family:"Archivo Narrow",var(--site-body-font,system-ui,sans-serif);font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:var(--token-color-muted)}`,
  `${F} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--services-catalog-title{font-family:var(--site-heading-font,Georgia,serif);font-weight:400;font-size:clamp(40px,6vw,72px);letter-spacing:-0.02em;line-height:0.95}`,
  `${F} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--services-catalog-row{border-bottom:1px solid var(--token-color-ink);background:transparent;border-radius:0;box-shadow:none;padding:14px 0}`,
  `${F} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--services-catalog-name{font-family:var(--site-body-font,system-ui,sans-serif);font-size:16px;font-weight:500;letter-spacing:0}`,
  `${F} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--services-catalog-duration{font-family:"Archivo Narrow",var(--site-body-font,system-ui,sans-serif);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:var(--token-color-muted)}`,
  `${F} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--services-catalog-price{font-family:var(--site-heading-font,Georgia,serif);font-size:22px;font-weight:400;font-style:italic}`,
  `${F} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--services-catalog-buy .site-btn,${F} .site-builder-node--services-catalog[data-layout="rate_card"] .site-builder-node--button{border-radius:0;min-height:44px;height:44px;font-family:"Archivo Narrow",var(--site-body-font,system-ui,sans-serif);font-size:11px;letter-spacing:0.16em;text-transform:uppercase;box-shadow:none}`,
  `@media (min-width:900px){${F} .site-builder-node--services-catalog[data-layout="rate_card"]{padding:90px 40px 0}${F} .site-header__inner{padding:0 40px}}`,
].join("\n");

const SKINS: Readonly<Record<string, string>> = {
  folio: FOLIO_SKIN,
};

/** The skin stylesheet for a design slug, or null when it has none. */
export function designSkinCss(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return SKINS[slug.trim().toLowerCase()] ?? null;
}
