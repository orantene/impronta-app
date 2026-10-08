/**
 * `services_catalog` row style "card" (release 2.5, MN-1..MN-4, MN-9, MN-10):
 * every row of the `rows` layout becomes a raised card: a 76px thumb, name and
 * a meta line with the accent price, and a soft pill button. The whole card
 * opens the service (see `CatalogRow`), lifts on hover and takes an accent
 * border while focused.
 *
 * Emitted only when a catalog sets `rowStyle: "card"`, so every other catalog
 * (and every other design) is byte-identical. Colour comes from the Look's
 * tokens; the text-safe accent (`color.accent-text`) falls back to the accent.
 * Specificity is written to beat the editorial type system's row rules
 * (`data-layout="rows"` + `data-has-photo`) without `!important`.
 */

const CAT = ".site-builder-node--services-catalog";
const P = CAT + "-";
const CARD = `${CAT}[data-row-style="card"][data-layout="rows"] ${P}list > ${P}row`;
const CARD_PHOTO = `${CARD}[data-has-photo="true"]`;
const LIST = `${CAT}[data-row-style="card"][data-layout="rows"] ${P}groups ${P}list`;

const INK = "var(--token-color-ink)";
const SURFACE = "var(--token-color-surface-raised,var(--token-color-background))";
const TINT = "var(--token-color-blush,var(--token-color-surface-raised))";
const ACCENT = "var(--token-color-accent,var(--token-color-primary))";
const ACCENT_TEXT = "var(--token-color-accent-text,var(--token-color-accent,var(--token-color-primary)))";
const ON = "var(--token-color-primary-on,var(--token-color-background))";
const mix = (pct: number, color: string, other = "transparent") => `color-mix(in srgb,${color} ${pct}%,${other})`;

export const SERVICES_CATALOG_ROW_CARD_CSS = [
  // The card.
  `${CARD}{background:${SURFACE};border:1px solid ${mix(7, INK)};border-radius:18px;padding:10px 14px 10px 10px;margin:0 0 10px;min-height:96px;box-shadow:0 1px 2px ${mix(5, INK)},0 8px 22px -18px ${mix(28, INK)};cursor:pointer;transition:transform .18s ease,box-shadow .2s ease,border-color .2s ease}`,
  // Explicit placement: the editorial rows rules name areas ("photo copy" /
  // "photo buy") for two columns, which collide with this card's grid and
  // stacked the button over the name. Every cell gets an explicit row+column.
  `${CARD_PHOTO}{grid-template-columns:76px minmax(0,1fr) auto;grid-template-areas:none;gap:14px;align-items:center}`,
  `${CARD_PHOTO} ${P}thumb{grid-column:1;grid-row:1}`,
  `${CARD_PHOTO} ${P}copy{grid-column:2;grid-row:1}`,
  `${CARD_PHOTO} ${P}buy{grid-column:3;grid-row:1}`,
  `${CARD}:focus-within{border-color:${ACCENT}}`,
  // Honor `columns` / `--svc-columns` on desktop (Maison sets 2). Fixed tracks beat
  // auto-fit + min(100%,22rem), which collapsed to one tall column beside the rail.
  `@media (min-width:900px){${LIST}{grid-template-columns:repeat(var(--svc-columns,2),minmax(0,1fr));column-gap:14px}}`,
  // Preview / rail: never bleed past the content track.
  `${CAT}[data-row-style="card"][data-layout="rows"]{min-width:0;overflow-x:clip}`,
  `${CAT}[data-row-style="card"][data-layout="rows"] ${P}groups{min-width:0}`,
  `${CARD}{min-width:0}`,

  // Thumb (wrapped so the zoom is clipped to its corners).
  `${CARD} ${P}thumb{display:block;width:76px;height:76px;border-radius:14px;overflow:hidden;background:${TINT};flex:0 0 auto}`,
  `${CARD} ${P}thumb ${P}photo{display:block;width:100%;height:100%;border-radius:0;object-fit:cover;transition:transform .5s ease}`,

  // Copy: name 15.5px, meta line with the accent price.
  `${CARD} ${P}name{font-size:15.5px;line-height:1.3}`,
  `${CARD} ${P}duration{margin-top:6px;font-size:13.5px;gap:6px 8px}`,
  `${CARD} ${P}duration[data-price-in-meta] ${P}price{color:${ACCENT_TEXT};font-size:14.5px;font-weight:700}`,

  // Soft pill button; selected = accent fill with a check.
  `${CARD} ${P}cta{height:auto;min-height:42px;padding:0 16px;border:1px solid transparent;border-radius:99px;background:${TINT};color:${ACCENT_TEXT};font-size:13.5px;font-weight:600;transition:background .15s ease,color .15s ease,border-color .15s ease}`,
  `${CARD} ${P}cta[data-selected="true"]{background:${ACCENT};border-color:${ACCENT};color:${ON}}`,
  `${CARD} ${P}cta[data-selected="true"]::before{content:"\\2713\\00a0"}`,
  // Paused (no route left): a disabled pill that says so, no hover fill.
  `${CARD} ${P}cta[disabled]{opacity:.45;cursor:default;pointer-events:none}`,

  // Hover (pointer devices only): lift, tinted shadow, thumb zoom, button fills.
  `@media (hover:hover){${CARD}:hover{transform:translateY(-2px);border-color:${mix(35, ACCENT, "var(--token-color-line)")};box-shadow:0 14px 30px -22px ${mix(60, ACCENT, "black")}}${CARD}:hover ${P}thumb ${P}photo{transform:scale(1.08)}${CARD}:hover ${P}cta:not([data-selected="true"]):not([disabled]){background:${ACCENT};border-color:${ACCENT};color:${ON}}}`,

  // Phone: the thumb spans two lines and the button sits under the text, left aligned (MN-10).
  `@media (max-width:899px){${CARD_PHOTO}{grid-template-columns:72px minmax(0,1fr);align-items:start;row-gap:8px}${CARD} ${P}thumb{width:72px;height:72px}${CARD_PHOTO} ${P}thumb{grid-column:1;grid-row:1 / 3}${CARD_PHOTO} ${P}copy{grid-column:2;grid-row:1}${CARD_PHOTO} ${P}buy{grid-column:2;grid-row:2;justify-content:flex-start;width:auto}${CARD} ${P}cta{min-height:38px;padding:0 16px;font-size:13px}}`,

  // 360px tier: 60px thumb, the button takes the full row.
  `@media (max-width:370px){${CARD_PHOTO}{grid-template-columns:60px minmax(0,1fr);column-gap:11px}${CARD} ${P}thumb{width:60px;height:60px}${CARD_PHOTO} ${P}thumb{grid-row:1}${CARD_PHOTO} ${P}buy{grid-column:1 / -1;grid-row:2;width:100%}${CARD} ${P}cta{width:100%}}`,

  `@media (prefers-reduced-motion:reduce){${CARD},${CARD} ${P}thumb ${P}photo,${CARD} ${P}cta{transition:none}}`,
].join("\n");
