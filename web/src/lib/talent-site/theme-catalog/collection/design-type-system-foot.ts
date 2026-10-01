/**
 * RICH FOOTER (release 2.7, FT-1..FT-3): the editorial type system's footer for
 * the Maison v2 `footer_rich` band (anchor `s-foot`).
 *
 * Light by default (the raised page surface, FT-3); `footer.tone = dark` turns it
 * into the dark band, a site-wide builder option in the theme drawer. The band
 * holds the big "Nos vemos pronto." line, a short intro, one booking button and
 * two optional columns (Where, Contact) that disappear when their data is
 * missing. The shared Tulala strip (policy links, credit) is NOT here: the
 * platform draws it under every design's footer (`TalentSiteSocket`).
 *
 * Presentation only, every value a token or a colour mix of the Look's tokens
 * (no hex). Same scope shape as the base sheet, appended after it.
 */
import { STYLE_TOKEN_BY_KEY, styleTokenCssVar } from "@/lib/site-admin/tokens/style-tokens";

function v(key: string): string {
  const def = STYLE_TOKEN_BY_KEY.get(key);
  if (!def) throw new Error(`design-type-system-foot: unknown style token ${key}`);
  return `var(${styleTokenCssVar(key)},${def.fallback})`;
}

const ED =
  '[data-theme-canvas-root]:where([data-token-type-system="editorial"],[data-token-type-system="editorial"] *)';
const DARK =
  '[data-theme-canvas-root]:where([data-token-footer-tone="dark"],[data-token-footer-tone="dark"] *) #s-foot';
const F = `${ED} #s-foot`;
const MQ_DESK = "@media (min-width:900px)";
const MQ_TINY = "@media (max-width:370px)";

const INK = "var(--token-color-ink)";
const SURFACE = "var(--token-color-surface-raised,var(--token-color-background))";
const PAGE = "var(--token-color-background)";
const MUTED = "var(--token-color-muted,color-mix(in srgb,var(--token-color-ink) 62%,transparent))";
const ACCENT_TEXT = "var(--token-color-accent-text,var(--token-color-accent,var(--token-color-primary)))";
const LINE = "var(--token-color-line)";
const RULE = v("shape.rule-width");
const mix = (pct: number, color: string) => `color-mix(in srgb,${color} ${pct}%,transparent)`;

export const EDITORIAL_RICH_FOOTER_CSS = [
  // ── Band: raised surface, hairline above, the page gutters (18px phone, 48px desktop).
  `${F}{background:${SURFACE};color:${INK};border-top:${RULE} solid ${LINE}}`,
  `${DARK}{background:${INK};color:${PAGE};border-top-color:transparent}`,

  // The top row is a grid node (line + button left, columns right on desktop, one column
  // below it): its tracks are node style, so the builder edits them. Only what a node
  // style cannot say lives here.

  // ── The big line: italic display, one line, accent word in the text-safe accent.
  `${F} h2{margin:0;font-size:${v("type.footer-title-size")};line-height:1;white-space:nowrap;font-weight:${v("type.display-weight")}}`,
  `${F} h2 em{font-style:${v("type.accent-style")};font-weight:${v("type.accent-weight")};color:${ACCENT_TEXT}}`,
  `${DARK} h2 em{color:inherit}`,
  `${MQ_DESK}{${F} h2{font-size:${v("type.footer-title-size-desktop")}}}`,
  `${MQ_TINY}{${F} h2{font-size:34px}}`,

  // ── Intro and the booking button.
  `${F} #s-foot-lead p.site-builder-node--paragraph{margin:12px 0 0;max-width:34ch;font-size:14.5px;line-height:1.5;color:${MUTED}}`,
  `${DARK} #s-foot-lead p.site-builder-node--paragraph{color:${mix(72, PAGE)}}`,
  `${MQ_DESK}{${F} #s-foot-lead p.site-builder-node--paragraph{max-width:48ch;font-size:15px}}`,
  `${F} #s-foot-lead .site-builder-node--button{margin-top:18px}`,
  `${DARK} .site-builder-node--button[data-builder-button-tone="primary"]{background:${PAGE};color:${INK};border-color:${PAGE}}`,

  // ── Columns (two tracks in node style): a hairline above them on the phone, one column at 360.
  `${F} #s-foot-cols{padding-top:20px;border-top:${RULE} solid ${LINE}}`,
  `${DARK} #s-foot-cols{border-top-color:${mix(22, PAGE)}}`,
  `${MQ_TINY}{${F} #s-foot-cols{grid-template-columns:minmax(0,1fr)!important}}`,
  `${MQ_DESK}{${F} #s-foot-cols{padding:0 0 6px;border-top:0}}`,
  `${F} #s-foot-cols h3{margin:0 0 8px;font-family:var(--site-body-font,inherit);font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;line-height:1.2;color:${MUTED}}`,
  `${DARK} #s-foot-cols h3{color:${mix(62, PAGE)}}`,
  `${F} #s-foot-cols p.site-builder-node--paragraph{margin:0;font-size:14px;line-height:1.45}`,

  // ── Column links: plain underlined text, not buttons (36px tap height).
  `${F} #s-foot-cols .site-builder-node--button{display:inline-flex;align-items:center;min-height:32px;height:auto;margin-top:8px;padding:0;border:0;border-radius:0;background:none;color:inherit;font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px}`,
].join("\n");
