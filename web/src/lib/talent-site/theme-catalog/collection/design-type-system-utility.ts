/**
 * Utility type system (Gridline): a spec-sheet voice. Wide Archivo headings
 * (the `wdth` axis through `font-stretch`), a monospace LABEL role, ink-ruled
 * square-ish buttons, and the highlighter accent. Every value is a style token
 * var or a colour token var; no hex, no Design slug. Any Design can opt in with
 * `type.system = "utility"`; the talent can change every key in the theme drawer.
 *
 * The highlighter accent (`type.accent-style = "highlight"`) is a separate rule
 * set keyed on its own data attribute, so it also works under the editorial
 * system. The band is the accent; the words print `accent-on` (derived, AA).
 */
import { STYLE_TOKEN_BY_KEY, styleTokenCssVar } from "@/lib/site-admin/tokens/style-tokens";

function v(key: string): string {
  const def = STYLE_TOKEN_BY_KEY.get(key);
  if (!def) throw new Error(`design-type-system-utility: unknown style token ${key}`);
  return `var(${styleTokenCssVar(key)},${def.fallback})`;
}

const U =
  '[data-theme-canvas-root]:where([data-token-type-system="utility"],[data-token-type-system="utility"] *)';
const ACCENT = "var(--token-color-accent,var(--token-color-primary))";
const ACCENT_ON = "var(--token-color-accent-on,var(--token-color-primary-on,var(--token-color-background)))";
const ACCENT_TEXT = "var(--token-color-accent-text,var(--token-color-accent,var(--token-color-primary)))";
/** The label role: the mono face. `shell.header-nav-font` carries it until a label-role token exists (as Folio does). */
export const UTILITY_LABEL_FACE =
  "var(--token-typography-label-font-family,var(--token-shell-header-nav-font,ui-monospace,monospace))";
const RULE = v("shape.rule-width");
const MQ_DESK = "@media (min-width:900px)";
const TITLE_HOOKS = ".sb-portfolio-title,.sb-reviews-title,.sb-visit-title,.site-builder-node--services-catalog-title";
const EYEBROW_HOOKS = ".sb-portfolio-eyebrow,.sb-reviews-eyebrow,.sb-visit-eyebrow,.site-builder-node--services-catalog-eyebrow";
const labelType = `font-family:${UTILITY_LABEL_FACE};font-size:${v("type.label-size")};font-weight:${v("type.label-weight")};letter-spacing:${v("type.label-tracking")}`;
const displayType = `font-family:var(--site-heading-font,system-ui,sans-serif);font-weight:${v("type.display-weight")};font-stretch:${v("type.stretch")};letter-spacing:${v("type.display-tracking")};line-height:${v("type.display-line-height")}`;

export const UTILITY_TYPE_SYSTEM_CSS = [
  `${U}{font-family:var(--site-body-font,system-ui,sans-serif);color:var(--token-color-ink);background:var(--token-color-background);font-size:${v("type.body-size")};line-height:${v("type.body-line-height")}}`,
  `${U} :is(h1,h2,h3){${displayType};text-wrap:balance}`,
  `${U} h2{font-size:${v("type.section-title-size")}}`,
  `${U} :is(${TITLE_HOOKS}){margin:4px 0 0;${displayType};font-size:${v("type.section-title-size")};color:var(--token-color-ink)}`,
  `${U} #hero h1{margin:10px 0 0;font-size:${v("type.hero-size")};line-height:${v("type.hero-line-height")}}`,
  `${U} p.site-builder-node--paragraph{color:var(--token-color-muted)}`,
  // Label role: eyebrows and uppercase paragraphs read as mono spec labels.
  `${U} p.site-builder-node--paragraph[style*="text-transform:uppercase"]{${labelType}}`,
  `${U} :is(${EYEBROW_HOOKS}){margin:0 0 4px;${labelType};text-transform:uppercase;color:${ACCENT_TEXT}}`,
  // Hero spec block (G7): the kicker and badges carry a letter-spacing signature, read as the mono label role.
  `${U} p.site-builder-node--paragraph[style*="letter-spacing:.02em"]{font-family:${UTILITY_LABEL_FACE}}`,
  // Buttons: ink-ruled, the accent fill carries accent-on.
  `${U} .site-builder-node--button{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:${v("button.height")};padding:0 ${v("button.padding-x")};border-radius:${v("button.radius")};border:${RULE} solid var(--token-color-ink);font-size:${v("button.font-size")};font-weight:${v("button.font-weight")};font-family:var(--site-body-font,inherit);white-space:nowrap;text-decoration:none;text-transform:none;letter-spacing:0}`,
  `${U} :is(.site-builder-node--button[data-builder-button-tone="primary"],.site-builder-node--button-primary){background:${ACCENT};color:${ACCENT_ON}}`,
  `${U} :is(.site-builder-node--button[data-builder-button-tone="secondary"],.site-builder-node--button-secondary){background:transparent;color:var(--token-color-ink)}`,
  `${MQ_DESK}{${U} #hero h1{font-size:${v("type.hero-size-desktop")};line-height:${v("type.hero-line-height-desktop")}}${U} h2,${U} :is(${TITLE_HOOKS}){font-size:${v("type.section-title-size-desktop")}}}`,
].join("\n");

/**
 * Highlighter accent words: a marker band behind the words, upright. Keyed on
 * the accent-style attribute so it works under any type system.
 */
const H = '[data-theme-canvas-root][data-token-type-accent-style="highlight"]';
export const HIGHLIGHT_ACCENT_CSS = [
  `${H} :is(h1,h2,h3,${TITLE_HOOKS}) em{font-style:normal;font-weight:inherit;color:${ACCENT_ON};background:linear-gradient(transparent 18%,${ACCENT} 18%,${ACCENT} 90%,transparent 90%);padding:0 .06em;margin:0 -.06em;-webkit-box-decoration-break:clone;box-decoration-break:clone}`,
].join("\n");

export function isUtilityTypeSystem(tokens: Readonly<Record<string, string>>): boolean {
  return tokens["type.system"] === "utility";
}
