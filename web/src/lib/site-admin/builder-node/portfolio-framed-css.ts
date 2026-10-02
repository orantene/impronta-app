/**
 * `portfolio` card style "framed" (release 2.5, WK-1..WK-4): each shot is a
 * raised frame (8px inner margin) holding a 4:5 photo, an italic name and a
 * round arrow button. The card lifts on hover and the arrow fills with the
 * accent. No stagger; six tiles on the phone strip (a sixth is hidden on the
 * five-column desktop row); the phone strip fades at its right edge and a
 * swipe hint sits under it.
 *
 * Emitted only when a portfolio sets `cardStyle: "framed"`, so every other
 * portfolio and design is byte-identical. Colours are the Look's tokens.
 */

const ROOT = '.sb-portfolio[data-card-style="framed"]';
const INK = "var(--token-color-ink)";
const SURFACE = "var(--token-color-surface-raised,var(--token-color-background))";
const TINT = "var(--token-color-blush,var(--token-color-surface-raised))";
const ACCENT = "var(--token-color-accent,var(--token-color-primary))";
const ACCENT_TEXT = "var(--token-color-accent-text,var(--token-color-accent,var(--token-color-primary)))";
const ON = "var(--token-color-primary-on,var(--token-color-background))";
const MUTED = "var(--token-color-muted)";
const ink = (pct: number) => `color-mix(in srgb,${INK} ${pct}%,transparent)`;

export const PORTFOLIO_FRAMED_CSS = [
  `${ROOT} .sb-portfolio-item{background:${SURFACE};border-radius:20px;padding:8px 8px 10px;box-shadow:0 1px 2px ${ink(5)},0 16px 32px -24px ${ink(35)};transition:transform .25s ease,box-shadow .25s ease}`,
  `${ROOT} .sb-portfolio-item:hover{transform:translateY(-3px);box-shadow:0 1px 2px ${ink(5)},0 24px 40px -24px ${ink(42)}}`,
  `${ROOT} .sb-portfolio-frame{border-radius:14px;aspect-ratio:4/5}`,
  `${ROOT} .sb-portfolio-cap{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;margin:10px 4px 0;font-size:14px;color:${INK}}`,
  `${ROOT} .sb-portfolio-name{font-family:var(--site-heading-font,Georgia,serif);font-style:italic;font-weight:500;font-size:16px;line-height:1.25;color:${INK}}`,
  `${ROOT} .sb-portfolio-arrow{display:inline-grid;place-items:center;width:38px;height:38px;border-radius:50%;background:${TINT};color:${ACCENT_TEXT};font-size:16px;font-weight:600;transition:background .2s ease,color .2s ease}`,
  `${ROOT} .sb-portfolio-item:hover .sb-portfolio-arrow{background:${ACCENT};color:${ON}}`,
  // "I want this" is the arrow's accessible name, not visible copy.
  `${ROOT} .sb-portfolio-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}`,
  // Swipe hint: phone only.
  `${ROOT} .sb-portfolio-hint{display:flex;align-items:center;gap:6px;margin:8px 0 0;font-size:12.5px;color:${MUTED}}`,
  `@media (max-width:899px){${ROOT} .sb-portfolio--staggered{-webkit-mask-image:linear-gradient(90deg,black 88%,transparent);mask-image:linear-gradient(90deg,black 88%,transparent)}}`,
  // Desktop: no stagger, a sixth tile stays on the phone strip only, no hint.
  `@media (min-width:900px){${ROOT} .sb-portfolio--staggered{align-items:start}${ROOT} .sb-portfolio--staggered .sb-portfolio-item:nth-child(2),${ROOT} .sb-portfolio--staggered .sb-portfolio-item:nth-child(4){margin-top:0}${ROOT} .sb-portfolio--staggered .sb-portfolio-item:nth-child(n+6){display:none}${ROOT} .sb-portfolio-hint{display:none}}`,
  `@media (prefers-reduced-motion:reduce){${ROOT} .sb-portfolio-item,${ROOT} .sb-portfolio-arrow,${ROOT} .sb-portfolio-shot img{transition:none}}`,
].join("\n");
