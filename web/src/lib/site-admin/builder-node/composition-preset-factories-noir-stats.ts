/**
 * Builder-node composition preset — Noir & Or "By the numbers" stat band.
 *
 * A single editorial proof row of 4 stats divided by gold hairlines on the warm
 * ground (NOT a filled card): a 1px gold hairline on TOP of the band + a 1px
 * gold hairline on the RIGHT of every item except the last. Each item is a big
 * Playfair/Cormorant number (`clamp(2.8rem,4.8vw,4rem)`, 24 chars — within the
 * 32-char fontSize cap) with an inner italic-champagne accent em ("+", "/", or
 * the italic year), over a tiny uppercase Inter label.
 *
 * Freeform: every number, accent glyph, and label is a discrete, inspector-
 * editable node on the shared Page Builder Core render path. Colors/fonts bind
 * to token sentinels with the literal Noir & Or palette as defaults. EN/ES
 * seeded on every text node via the node-level i18n overlay. Single-side
 * hairlines (top of band, right of cell) live in `style.customCss` (the only
 * safe home for single-side borders — structured `borderWidth` is all-sides).
 *
 * NEW id `stat-band-editorial` — does NOT touch the existing `stat-band`
 * preset (3-up, centered, filled; pages depend on it). Registered + dispatched
 * from `composition-presets.ts`.
 */
import type { BuilderNode } from "./types";
import { makeId } from "./create";

const DISPLAY_FONT =
  "var(--token-typography-heading-font-family, 'Cormorant Garamond', Georgia, serif)";
const SANS_FONT =
  "var(--token-typography-body-font-family, 'Inter', system-ui, sans-serif)";
// Standard Noir token mapping (matches every other block): ink=light text,
// gold=primary #c6a14e (hairlines), champagne=accent #e0c074 (italic accents).
const INK = "var(--token-color-ink, #ece4d3)";
const GOLD = "var(--token-color-primary, #c6a14e)";
const CHAMPAGNE = "var(--token-color-accent, #e0c074)";
const STAT_NUMBER_SIZE = "clamp(2.8rem,4.8vw,4rem)"; // 24 chars — within fontSize cap (32)

interface EditorialStat {
  /** Leading plain number text, e.g. "120", "6", "" (when the value is the accent). */
  readonly lead: string;
  /** Italic-champagne accent glyph/value, e.g. "+", "/", "2019", "EN / ES". null = none. */
  readonly accent: string | null;
  readonly accentEs?: string;
  /** Trailing plain number text after the accent (e.g. "ES" in "EN / ES"). */
  readonly trail?: string;
  readonly label: string;
  readonly labelEs: string;
}

/**
 * One stat cell: a number row (lead + italic-champagne accent + optional trail)
 * over a tiny uppercase label. `isLast` drops the right hairline. Returns a
 * freeform container holding individually editable heading/paragraph nodes.
 */
function createEditorialStat(stat: EditorialStat, isLast: boolean): BuilderNode {
  const cellId = makeId("container");
  const numberPart = (text: string, accent: boolean): BuilderNode => ({
    id: makeId("heading"),
    kind: "heading",
    props: {
      text,
      level: 2,
      style: {
        fontFamily: DISPLAY_FONT,
        fontSize: STAT_NUMBER_SIZE,
        lineHeight: "1",
        fontStyle: accent ? "italic" : "normal",
        textColor: accent ? CHAMPAGNE : INK,
      },
    },
  });

  const numberRow: BuilderNode[] = [];
  if (stat.lead) numberRow.push(numberPart(stat.lead, false));
  if (stat.accent !== null) {
    const accentNode = numberPart(stat.accent, true);
    if (stat.accentEs) accentNode.i18n = { es: { text: stat.accentEs } };
    numberRow.push(accentNode);
  }
  if (stat.trail) numberRow.push(numberPart(stat.trail, false));

  // Right hairline on every cell except the last — single-side border lives in
  // customCss (structured borderWidth is all-sides). Scoped to this cell node.
  // Mobile (<=768px, the 2-up tier): drop ALL right hairlines (at 2x2 the
  // right-column cell would otherwise paint a stray gold hairline flush against
  // the band edge), tighten the lopsided cell padding to the new band gutter,
  // and trim the desktop-scaled vertical padding.
  const cellMobileCss =
    "@media (max-width:768px){ { border-right:0 !important; padding-left:0; padding-right:16px; padding-top:18px; padding-bottom:18px; } }";
  const cellCss = isLast
    ? cellMobileCss
    : `{ border-right: 1px solid ${GOLD}; } ${cellMobileCss}`;

  return {
    id: cellId,
    kind: "container",
    props: {
      layout: "stack",
      style: {
        alignItems: "flex-start",
        paddingTop: "30px",
        paddingBottom: "30px",
        paddingLeft: "8px",
        paddingRight: "32px",
        ...(cellCss ? { customCss: cellCss } : {}),
      },
    },
    children: [
      {
        id: makeId("container"),
        kind: "container",
        props: {
          layout: "row",
          // Keep the number + italic accent ("120" + "+", "EN" + "/" + "ES")
          // on ONE line at every breakpoint. Without an explicit per-tier
          // layout the renderer forces flex-column at <=640px, dropping the
          // accent glyph onto its own row beneath the number.
          responsive: {
            tablet: { layout: "row" },
            mobile: { layout: "row" },
          },
          style: { alignItems: "baseline", gap: "2px", flexWrap: "nowrap" },
        },
        children: numberRow,
      },
      {
        id: makeId("paragraph"),
        kind: "paragraph",
        props: {
          text: stat.label,
          style: {
            fontFamily: SANS_FONT,
            fontSize: "10.5px",
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            textColor: INK,
            marginTopFree: "14px",
          },
        },
        i18n: { es: { text: stat.labelEs } },
      },
    ],
  };
}

export function createStatBandEditorialPreset(): Exclude<
  BuilderNode,
  { kind: "section" }
> {
  const stats: ReadonlyArray<EditorialStat> = [
    {
      lead: "120",
      accent: "+",
      label: "Faces represented",
      labelEs: "Rostros representados",
    },
    {
      lead: "6",
      accent: null,
      label: "Cities on call",
      labelEs: "Ciudades disponibles",
    },
    {
      lead: "",
      accent: "2019",
      label: "Established",
      labelEs: "Fundada",
    },
    {
      lead: "EN",
      accent: "/",
      trail: "ES",
      label: "Bilingual booking",
      labelEs: "Reservas bilingües",
    },
  ];

  const rootId = makeId("container");
  // Top hairline of the whole band — single-side border via customCss.
  // Mobile (<=768px): (1) downscale the display numbers — at 390px the
  // clamp floor 2.8rem (44.8px) freezes and overflows the ~145px 2-up cell in
  // the nowrap row; clamp(2rem,9vw,2.6rem) fits 'EN / ES' / '2019'. (2) inset
  // the whole band from the screen edges so the full-bleed left number no
  // longer hugs the viewport. Heading nodes are descendants of the root.
  const rootCss =
    `{ border-top: 1px solid ${GOLD}; }` +
    " @media (max-width:768px){" +
    " { padding-left:16px; padding-right:16px; }" +
    " .site-builder-node--heading { font-size: clamp(2rem, 9vw, 2.6rem) !important; }" +
    " }";

  return {
    id: rootId,
    kind: "container",
    props: {
      htmlTag: "section",
      layout: "grid",
      columns: 4,
      // 4-up desktop → 2-up tablet → 2-up mobile (2x2). The explicit
      // layout:"grid" per tier emits data-builder-mobile-layout so the grid
      // survives (columns alone would let the renderer force a flex tower).
      // At 2-up the per-cell right hairlines are dropped on mobile (see
      // createEditorialStat) so no stray gold edge appears on the right column.
      responsive: {
        tablet: { layout: "grid", columns: 2 },
        // One column on phones: the publish gate requires multi-column grids to
        // collapse to a single column on mobile, and a full-width stat per row
        // reads more impactfully than a cramped 2x2 at 390px.
        mobile: { layout: "grid", columns: 1 },
      },
      style: {
        containerType: "inline-size",
        maxWidthFree: "1440px",
        paddingTop: "16px",
        backgroundColor: "var(--token-color-background, #100e13)",
        customCss: rootCss,
      },
    },
    children: stats.map((stat, i) =>
      createEditorialStat(stat, i === stats.length - 1),
    ),
  };
}
