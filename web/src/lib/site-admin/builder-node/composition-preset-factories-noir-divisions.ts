/**
 * Builder-node composition preset — Noir & Or "Divisions / Find your cast." row.
 *
 * A freeform `BuilderNode` tree (never a fixed-prop block): on drop it explodes
 * into individually editable nodes on the shared Page Builder Core render path.
 * Full-bleed row of 5 tall portrait tiles (Women / Men / New Faces / Influence /
 * Events), each a real editorial portrait under a bottom-up scrim with a serif
 * name + champagne index/arrow row, linking into the public directory.
 *
 * Colors/fonts bind to token sentinels with the literal Noir & Or palette as the
 * default (espresso #100e13, ink #ece4d3, gold #c6a14e, champagne #e0c074, line
 * rgba(198,161,78,0.26)). EN/ES seeded per text node via the node-level i18n
 * overlay. Resting/hover image treatment + the 5→3→2 column reflow live in
 * `style.customCss` (8000-char cap) — the only safe home for @keyframes/hover
 * filter / single-side rules that exceed the 16-char escapes.
 *
 * BACKEND: the reference `/roster?div=women` filter is UNIMPLEMENTED (grep
 * "div=" → 0; no division/gender facet in lib/directory/search-params.ts). Tile
 * hrefs default to the public `/directory` route with the `q` free-text param
 * the page ACTUALLY supports (verified in api/directory/route.ts:101 +
 * search-params.ts parseDirectoryQuery). See backendDecision for the new-facet
 * option flagged to the owner.
 *
 * Registered + dispatched from `composition-presets.ts`.
 */
import type { BuilderNode } from "./types";
import { makeId, createImage } from "./create";

const DISPLAY_FONT =
  "var(--token-typography-heading-font-family, 'Cormorant Garamond', Georgia, serif)";
const INK = "var(--token-color-ink, #ece4d3)";
const CHAMPAGNE = "var(--token-color-secondary, #e0c074)";
const LINE = "var(--token-color-line, rgba(198,161,78,0.26))";
const ESPRESSO = "var(--token-color-background, #100e13)";

type Division = {
  en: string;
  es: string;
  index: string;
  /** Free-text directory query the page supports today (?q=). */
  query: string;
  imageIndex: number;
};

const DIVISIONS: ReadonlyArray<Division> = [
  { en: "Women", es: "Mujeres", index: "01", query: "women", imageIndex: 0 },
  { en: "Men", es: "Hombres", index: "02", query: "men", imageIndex: 1 },
  {
    en: "New Faces",
    es: "Caras Nuevas",
    index: "03",
    query: "new faces",
    imageIndex: 2,
  },
  {
    en: "Influence",
    es: "Influencia",
    index: "04",
    query: "influence",
    imageIndex: 3,
  },
  { en: "Events", es: "Eventos", index: "05", query: "events", imageIndex: 0 },
];

function divisionTile(d: Division): BuilderNode {
  const cardId = makeId("container");

  // Editorial portrait, filled cover, resting cool/dark treatment. The hover
  // colorize + zoom + reduced-motion guard go in card-scoped customCss because
  // `filter`/animation hover are not in the curated hover-style subset.
  const image: BuilderNode = {
    ...createImage(d.imageIndex, {
      objectFit: "cover",
      position: "absolute",
      top: "0",
      right: "0",
      bottom: "0",
      left: "0",
      width: "100%",
      height: "100%",
      filter: "brightness(.85) saturate(1.04)",
    }),
  };
  // Localize the alt text for the portrait.
  (image.props as { alt?: string }).alt = `${d.en} division`;
  image.i18n = { es: { alt: `División ${d.es}` } };

  // Bottom-up dark scrim so the label stays legible over any portrait.
  const scrim: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      style: {
        position: "absolute",
        left: "0",
        right: "0",
        bottom: "0",
        top: "0",
        backgroundImage:
          "linear-gradient(to top, rgba(16,14,19,0.82) 0%, rgba(16,14,19,0.18) 46%, rgba(16,14,19,0) 72%)",
        pointerEvents: "none",
        zIndex: 1,
      },
    },
    children: [],
  };

  // Name + index/arrow row label block, anchored bottom-left.
  const name: BuilderNode = {
    id: makeId("heading"),
    kind: "heading",
    props: {
      text: d.en,
      level: 3,
      style: {
        fontFamily: DISPLAY_FONT,
        fontSize: "1.6rem",
        textColor: INK,
        lineHeight: "1.05",
        marginBottomFree: "8px",
      },
    },
    i18n: { es: { text: d.es } },
  };

  const indexLabel: BuilderNode = {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: d.index,
      style: {
        fontSize: "10.5px",
        textColor: CHAMPAGNE,
        textTransform: "uppercase",
        letterSpacing: "0.24em",
      },
    },
  };

  const arrow: BuilderNode = {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: "→",
      style: {
        fontSize: "12px",
        textColor: CHAMPAGNE,
      },
    },
  };

  const indexRow: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "row",
      style: {
        gap: "10px",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
      },
    },
    children: [indexLabel, arrow],
  };

  const label: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      style: {
        position: "absolute",
        left: "0",
        right: "0",
        bottom: "0",
        gap: "6px",
        paddingTop: "16px",
        paddingRight: "16px",
        paddingBottom: "16px",
        paddingLeft: "16px",
        zIndex: 2,
      },
    },
    children: [name, indexRow],
  };

  // Invisible full-tile link carrying the href. Default to the public directory
  // with the free-text `q` param the route actually supports.
  const link: BuilderNode = {
    id: makeId("button"),
    kind: "button",
    props: {
      label: `Open ${d.en}`,
      href: `/directory?q=${encodeURIComponent(d.query)}`,
      tone: "secondary",
      style: {
        position: "absolute",
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
        opacity: 0,
        zIndex: 3,
        customCss: '{ display: block; }',
      },
    },
    i18n: { es: { label: `Abrir ${d.es}` } },
  };

  // Card-scoped customCss: tile shape, hover zoom + colorize (descendant
  // selector on the image), gated behind hover + reduced-motion preference.
  const cardCss = [
    `{ border: 1px solid transparent; transition: border-color .4s ease; }`,
    `[data-builder-node-id="${image.id}"] { transition: transform 1.1s cubic-bezier(.2,.7,.2,1), filter 1.1s ease; }`,
    `@media (hover: hover) and (prefers-reduced-motion: no-preference) {`,
    `  &:hover { border-color: ${LINE}; }`,
    `  &:hover [data-builder-node-id="${image.id}"] { transform: scale(1.06); filter: brightness(1) saturate(1.04); }`,
    `}`,
  ].join("\n");

  return {
    id: cardId,
    kind: "container",
    props: {
      layout: "stack",
      style: {
        position: "relative",
        overflow: "hidden",
        aspectRatioFree: "3 / 4.4",
        justifyContent: "flex-end",
        backgroundColor: ESPRESSO,
        revealOnView: "fade-up",
        customCss: cardCss,
      },
    },
    children: [image, scrim, label, link],
  };
}

export function createDivisionsRowPreset(): Exclude<
  BuilderNode,
  { kind: "section" }
> {
  const eyebrow: BuilderNode = {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: "Divisions",
      style: {
        fontSize: "11px",
        textColor: CHAMPAGNE,
        textTransform: "uppercase",
        letterSpacing: "0.3em",
        marginBottomFree: "14px",
      },
    },
    i18n: { es: { text: "Divisiones" } },
  };

  const title: BuilderNode = {
    id: makeId("heading"),
    kind: "heading",
    props: {
      text: "Find your cast.",
      level: 2,
      style: {
        fontFamily: DISPLAY_FONT,
        fontSize: "clamp(2.2rem,4.6vw,3.4rem)",
        textColor: INK,
        lineHeight: "1.04",
      },
    },
    i18n: { es: { text: "Encuentra tu cast." } },
  };

  const head: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      style: {
        gap: "4px",
        marginBottomFree: "28px",
        maxWidthFree: "640px",
      },
    },
    children: [eyebrow, title],
  };

  const row: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "grid",
      style: {
        gridTemplateColumns: "repeat(5,1fr)",
        gap: "12px",
        responsive: {
          tablet: { gridTemplateColumns: "repeat(3,1fr)" },
          mobile: { gridTemplateColumns: "repeat(2,1fr)" },
        },
      },
    },
    children: DIVISIONS.map((d) => divisionTile(d)),
  };

  return {
    id: makeId("container"),
    kind: "container",
    props: {
      htmlTag: "section",
      layout: "stack",
      style: {
        backgroundColor: ESPRESSO,
        paddingTop: "8vh",
        paddingBottom: "8vh",
        paddingLeft: "6vw",
        paddingRight: "6vw",
        containerType: "inline-size",
      },
    },
    children: [head, row],
  };
}
