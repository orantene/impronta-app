/**
 * Design skins: the type rhythm and component shapes a collection Design
 * needs beyond what shared widget props express (Bodoni display sizes, pill
 * 48px buttons, blurred sticky header, 34px hero image...). Scoped to
 * `[data-talent-design="<slug>"]`, which the theme preview and the live talent
 * site set on their canvas root. Colours are token vars only (the Look owns
 * colour), fonts are the typography token vars, so a palette or font change
 * still restyles everything. Designs themselves stay free of custom CSS
 * (`validate.ts` forbids it per node); this is the shared, reviewed layer.
 */

const S = '[data-talent-design="maison-v2"]';

/** Maison v2: the Rosé proposal's type and shape layer. */
const MAISON_V2_SKIN = [
  // Base: Figtree body, Bodoni display headings with italic accents.
  `${S}{font-family:var(--site-body-font,system-ui,sans-serif);color:var(--token-color-ink)}`,
  `${S} :is(h1,h2,h3){font-family:var(--site-heading-font,Georgia,serif);font-weight:450;letter-spacing:-0.01em;text-wrap:balance}`,
  `${S} :is(h1,h2) em{font-style:italic;font-weight:400;color:var(--token-color-accent,var(--token-color-primary))}`,
  `${S} h2{font-size:clamp(34px,4.6vw,58px);line-height:1.02}`,
  `${S} #hero h1{font-size:clamp(47px,7.4vw,96px);line-height:0.98;font-weight:450;margin:6px 0 0}`,
  `${S} #hero p{color:var(--token-color-muted)}`,
  // Buttons: 48px pills, accent fill; secondary is the ghost.
  `${S} .site-builder-node--button{height:48px;padding:0 22px;border-radius:999px;text-transform:none;letter-spacing:0;font-size:15px;font-weight:600;font-family:var(--site-body-font,inherit);white-space:nowrap}`,
  `${S} .site-builder-node--button[data-builder-button-tone="primary"],${S} .site-builder-node--button-primary{background:var(--token-color-accent,var(--token-color-primary));border-color:var(--token-color-accent,var(--token-color-primary));color:var(--token-color-primary-on,var(--token-color-background))}`,
  `${S} .site-builder-node--button[data-builder-button-tone="secondary"],${S} .site-builder-node--button-secondary{background:transparent;color:var(--token-color-ink);border:1.5px solid color-mix(in srgb,var(--token-color-ink) 22%,transparent)}`,
  // Header: sticky, blurred, italic Bodoni logo, muted nav, small pill CTA.
  `${S} .site-header{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--token-color-background) 88%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-bottom:1px solid color-mix(in srgb,var(--token-color-line) 60%,transparent)}`,
  `${S} .site-header__brand-label{font-family:var(--site-heading-font,Georgia,serif);font-style:italic;font-weight:500;font-size:24px;letter-spacing:-0.02em}`,
  `${S} .site-header__nav-link{font-size:13.5px;color:var(--token-color-muted);text-transform:none;letter-spacing:0}`,
  `${S} .site-header__nav-link:hover{color:var(--token-color-ink)}`,
  `${S} .site-header__cta.site-btn{height:36px;padding:0 16px;border-radius:999px;font-size:13.5px;font-weight:600;text-transform:none;letter-spacing:0;background:var(--token-color-accent,var(--token-color-primary));color:var(--token-color-primary-on,var(--token-color-background));border-color:transparent}`,
  `@media (max-width:767px){${S} .site-header__cta.site-btn{display:none}}`,
  // Hero media: 34px rounded photo, 22px inset, glass next-free chip.
  `${S} #hero img{border-radius:34px}`,
  `${S} #hero img[style*="position:absolute"],${S} #hero [style*="position:absolute"] img{border-radius:22px}`,
  `${S} #hero .sb-next-free{border:0;border-radius:16px;padding:9px 13px 9px 10px;font-size:12.5px;background:color-mix(in srgb,var(--token-color-surface-raised,var(--token-color-background)) 92%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 10px 30px -16px color-mix(in srgb,var(--token-color-ink) 70%,transparent)}`,
  // Section titles of the shared widgets use the display face.
  `${S} :is(.sb-portfolio-title,.sb-reviews-title,.sb-visit-title,.site-builder-node--services-catalog-title){font-family:var(--site-heading-font,Georgia,serif);font-weight:450;font-size:clamp(34px,4.6vw,58px);line-height:1.02;letter-spacing:-0.01em}`,
  `${S} :is(.sb-portfolio-eyebrow,.sb-reviews-eyebrow,.sb-visit-eyebrow,.site-builder-node--services-catalog-eyebrow){font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:var(--token-color-accent,var(--token-color-primary))}`,
  // Recent work: rounded 3:4 frames.
  `${S} .sb-portfolio--filmstrip .sb-portfolio-frame{border-radius:20px;overflow:hidden}`,
  // Reviews: white cards, italic Bodoni quotes.
  `${S} .sb-reviews-card{border-radius:22px;background:var(--token-color-surface-raised,var(--token-color-background));border-color:var(--token-color-line)}`,
  `${S} .sb-reviews-quote{font-style:italic;font-size:19px;line-height:1.35}`,
  // About portrait: the proposal's 26/26/140/26 corner.
  `${S} #about img{border-radius:26px 26px 140px 26px}`,
  // Visit facts: hairline grid of white cells.
  `${S} .sb-visit-fact{background:var(--token-color-surface-raised,var(--token-color-background));border-radius:20px}`,
  // Dark footer: 88px italic display line on the ink ground.
  `${S} #site-footer h2{font-style:italic;font-weight:400;font-size:clamp(44px,7.4vw,88px);line-height:1;color:var(--token-color-background)}`,
  `${S} #site-footer p{color:color-mix(in srgb,var(--token-color-background) 60%,transparent)}`,
].join("\n");

const SKINS: Readonly<Record<string, string>> = {
  "maison-v2": MAISON_V2_SKIN,
};

/** The skin stylesheet for a design slug, or null when it has none. */
export function designSkinCss(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return SKINS[slug.trim().toLowerCase()] ?? null;
}
