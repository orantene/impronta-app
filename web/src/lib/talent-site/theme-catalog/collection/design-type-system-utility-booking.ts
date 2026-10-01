/**
 * Gridline booking chrome (G12): the dock label follows the live status, the
 * sheet shows step dots, fills the screen on a phone and wears the wide type.
 *
 * Scoped by `U` (the utility type system's own root selector), so a design that
 * does not set `type.system = "utility"` matches none of these rules. The base
 * sheet stylesheet (catalog-booking-styles) is untouched. Every value is a
 * token var; no hex.
 *
 * Step dots need no markup: the footer action carries the step
 * (`data-catalog-continue`), so `:has()` picks the active dot.
 */
import { U, displayType, labelType } from "./design-type-system-utility";

const INK = "var(--token-color-ink)";
const LINE = "color-mix(in srgb,var(--token-color-ink) 22%,transparent)";
const ACTIVE = "var(--token-color-accent,var(--token-color-primary))";
const DOT = (c: string, x: string) => `radial-gradient(circle at 4px 4px,${c} 3.5px,transparent 4px) ${x} 0/8px 8px no-repeat`;
const dots = (at: string) => `${DOT(ACTIVE, at)},${DOT(LINE, "0")},${DOT(LINE, "16px")},${DOT(LINE, "32px")}`;

export const UTILITY_BOOKING_CSS = [
  // Dock: while the status is on, the second label replaces the first.
  `${U} .cb-dock-go .cb-dock-lbl-off{display:none}`,
  `${U} .cb-dock-go .cb-dock-lbl-on{display:inline}`,
  `${U} .cb-dock-go{border-radius:var(--token-button-radius,6px);font-family:var(--site-body-font,inherit)}`,
  // Sheet type: wide display face for the title and totals, mono labels.
  `${U} .jb-head h2{${displayType};font-size:1.5rem}`,
  `${U} :is(.jb-kicker,.jb-total span,.jb-req,.jb-opt-tag){${labelType};text-transform:uppercase}`,
  `${U} .jb-total b{${displayType};font-size:1.1875rem}`,
  `${U} .jb-cta{border-radius:var(--token-button-radius,6px);font-weight:var(--token-button-font-weight,800)}`,
  // Step dots: three, the current one filled. Hidden on the done step (no footer action).
  `${U} .jb-head{position:relative;padding-bottom:28px}`,
  `${U} .jb-head::after{content:"";position:absolute;left:20px;bottom:10px;width:40px;height:8px;background:${DOT(LINE, "0")},${DOT(LINE, "16px")},${DOT(LINE, "32px")}}`,
  `${U} .jb-sheet:has([data-catalog-continue="choose"]) .jb-head::after{background:${dots("0")}}`,
  `${U} .jb-sheet:has([data-catalog-continue="when"]) .jb-head::after{background:${dots("16px")}}`,
  `${U} .jb-sheet:has([data-catalog-continue="who"]) .jb-head::after{background:${dots("32px")}}`,
  `${U} .jb-sheet:not(:has([data-catalog-continue])) .jb-head::after{display:none}`,
  `${U} .jb-sheet:not(:has([data-catalog-continue])) .jb-head{padding-bottom:16px}`,
  // Phone: the sheet fills the screen.
  `@media (max-width:719px){${U} .jb-back{align-items:stretch}${U} .jb-sheet{max-width:none;width:100%;height:100%;max-height:none;border-radius:0}${U} .jb-foot{border-radius:0}}`,
  // Desktop: the modal stays centred; the ink rule frames it.
  `@media (min-width:720px){${U} .jb-sheet{border:var(--token-shape-rule-width,1.5px) solid ${INK};border-radius:var(--token-shape-card-radius,10px)}}`,
].join("\n");
