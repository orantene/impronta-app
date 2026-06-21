/**
 * Builder-node composition preset — Noir & Or "Featured faces" board.
 *
 * Editorial roster showcase ("The board, edited."). A split header over an
 * asymmetric 12-col mosaic of 8 face cards: card #1 is the 5×2 hero, cards #2–8
 * are smaller tiles placed by explicit gridColumn/gridRow. Each card is a
 * relative container (overflow hidden, hover→gold border) holding an absolute
 * portrait, a bottom-up dark veil, a champagne Playfair index 01..08, and a
 * caption (name + city). A centered "See all faces →" link closes it.
 *
 * Freeform: on drop it explodes into individually editable nodes on the shared
 * Page Builder Core render path. Colors/fonts bind to token sentinels with the
 * literal Noir & Or palette as the default (espresso #100e13, paper-2 #161320,
 * ink #ece4d3, gold #c6a14e, champagne #e0c074, line rgba(198,161,78,0.26)).
 * EN/ES seeded per text node via the node-level i18n overlay.
 *
 * Caps-bound (the #1 hazard): gridAutoRows is NOT a first-class style prop, and
 * its clamp() exceeds the 16-char free-field cap — so the mosaic row sizing,
 * every hover transition/zoom/colorize/caption-rise/city-reveal, and the
 * single-side-free image/veil layering all live in `style.customCss` (8000-char
 * cap), scoped per-node via [data-builder-node-id]. The mosaic
 * gridTemplateColumns ("repeat(12,1fr)", 14 chars) and the per-card gridColumn/
 * gridRow ("span 5", "6 / span 3", all ≤24) stay within their caps.
 *
 * Backend (handoff §1): "hybrid per-slot binding" is REFUTED — it does NOT
 * exist (no index/offset field on BuilderDataBinding; {{field}} only resolves
 * inside a repeater's items.map). DEFAULT = Option A: 8 explicit MANUAL cards,
 * which preserves the hand-placed asymmetry with zero backend. Owner options A/
 * B/C are flagged in the orchestrator return. Card links route to the REAL
 * tenant directory surface (/directory) — never the mockup's dead model.html /
 * roster.html. LCP: only card #1 is eager + priority; cards 2–8 lazy.
 *
 * Registered + dispatched from `composition-presets.ts`.
 */
import type { BuilderNode } from "./types";
import { makeId } from "./create";

const DISPLAY_FONT =
  "var(--token-typography-heading-font-family, 'Cormorant Garamond', Georgia, serif)";
const PAPER2 = "var(--token-color-surface, #161320)";
const INK = "var(--token-color-ink, #ece4d3)";
const GOLD = "var(--token-color-primary, #c6a14e)";
const CHAMPAGNE = "var(--token-color-accent, #e0c074)";
const LINE = "var(--token-color-border, rgba(198,161,78,0.26))";
const ESPRESSO = "var(--token-color-background, #100e13)";
const MUTED = "rgba(236,228,211,0.62)";
const VEIL =
  "linear-gradient(180deg,rgba(8,7,10,0) 42%,rgba(8,7,10,0.82) 100%)";

// Real impronta-2026 editorial photos, in card order 1..8. Card #1 (the hero)
// gets portrait-1; the rest follow the curated sequence so adjacent tiles never
// repeat the same crop. Served from /talent-templates/demo/impronta-2026/.
const PORTRAITS = [
  "/talent-templates/demo/impronta-2026/portrait-1.jpg",
  "/talent-templates/demo/impronta-2026/portrait-4.jpg",
  "/talent-templates/demo/impronta-2026/portrait-5.jpg",
  "/talent-templates/demo/impronta-2026/portrait-6.jpg",
  "/talent-templates/demo/impronta-2026/portrait-2.jpg",
  "/talent-templates/demo/impronta-2026/portrait-3.jpg",
  "/talent-templates/demo/impronta-2026/atelier-1.jpg",
  "/talent-templates/demo/impronta-2026/hero-a.jpg",
] as const;

interface FaceSpec {
  index: string;
  name: string;
  nameEs: string;
  city: string;
  cityEs: string;
  altEs: string;
  gridColumn: string;
  gridRow: string;
}

// Mosaic placement mirrors impronta.css L156-164 (nth-child rules). Card #1 is
// the 5×2 hero; the rest are the asymmetric smaller tiles. City names carry an
// ES overlay where Mexican-Spanish differs (Mexico City → Ciudad de México).
const FACES: ReadonlyArray<FaceSpec> = [
  { index: "01", name: "Chiara Moretti", nameEs: "Chiara Moretti", city: "Milan", cityEs: "Milán", altEs: "Chiara Moretti, retrato", gridColumn: "span 5", gridRow: "span 2" },
  { index: "02", name: "Mateo Silva", nameEs: "Mateo Silva", city: "Playa del Carmen", cityEs: "Playa del Carmen", altEs: "Mateo Silva, retrato", gridColumn: "span 4", gridRow: "span 1" },
  { index: "03", name: "Valentina Ruiz", nameEs: "Valentina Ruiz", city: "Mexico City", cityEs: "Ciudad de México", altEs: "Valentina Ruiz, retrato", gridColumn: "span 3", gridRow: "span 1" },
  { index: "04", name: "Diego Ríos", nameEs: "Diego Ríos", city: "Cancún", cityEs: "Cancún", altEs: "Diego Ríos, retrato", gridColumn: "6 / span 3", gridRow: "span 1" },
  { index: "05", name: "Isabella Flores", nameEs: "Isabella Flores", city: "Tulum", cityEs: "Tulum", altEs: "Isabella Flores, retrato", gridColumn: "9 / span 4", gridRow: "span 1" },
  { index: "06", name: "Adriana Vega", nameEs: "Adriana Vega", city: "Playa del Carmen", cityEs: "Playa del Carmen", altEs: "Adriana Vega, retrato", gridColumn: "span 4", gridRow: "span 1" },
  { index: "07", name: "Luca Ferrari", nameEs: "Luca Ferrari", city: "Ibiza", cityEs: "Ibiza", altEs: "Luca Ferrari, retrato", gridColumn: "span 4", gridRow: "span 1" },
  { index: "08", name: "Nina Hart", nameEs: "Nina Hart", city: "Ibiza", cityEs: "Ibiza", altEs: "Nina Hart, retrato", gridColumn: "span 4", gridRow: "span 1" },
];

export function createFeaturedFacesBoardPreset(): Exclude<
  BuilderNode,
  { kind: "section" }
> {
  // ── Split header — eyebrow + H2 (left) | muted aside (right) ──────────────
  const eyebrow: BuilderNode = {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: "Selected talent",
      style: {
        textColor: GOLD,
        textTransform: "uppercase",
        letterSpacing: "0.24em",
        fontSize: "0.72rem",
        revealOnView: "fade-up",
      },
    },
    i18n: { es: { text: "Talento selecto" } },
  };
  const headline: BuilderNode = {
    id: makeId("heading"),
    kind: "heading",
    props: {
      text: "The board, edited.",
      level: 2,
      style: {
        fontFamily: DISPLAY_FONT,
        fontSize: "clamp(2.4rem,4.6vw,3.8rem)",
        textColor: INK,
        lineHeight: "1.04",
        marginTopFree: "18px",
        textWrap: "balance",
        revealOnView: "fade-up",
        revealDelay: "0.08s",
      },
    },
    i18n: { es: { text: "El board, editado." } },
  };
  const headLeft: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: { layout: "stack", style: { gap: "0px" } },
    children: [eyebrow, headline],
  };
  const aside: BuilderNode = {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: "A curated cut of the women and men we represent this season. Hover a face, then open the full portfolio.",
      style: {
        textColor: MUTED,
        maxWidthFree: "42ch",
        fontSize: "0.98rem",
        lineHeight: "1.7",
        alignSelf: "end",
        revealOnView: "fade-up",
        revealDelay: "0.16s",
      },
    },
    i18n: {
      es: {
        text: "Una selección curada de las mujeres y hombres que representamos esta temporada. Pasa el cursor sobre un rostro y abre el portafolio.",
      },
    },
  };
  const header: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "row",
      style: {
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: "40px",
        flexWrap: "wrap",
        marginBottomFree: "40px",
        responsive: { mobile: { gap: "20px" } },
      },
    },
    children: [headLeft, aside],
  };

  // ── One face card — relative tile (overflow hidden, hover gold border) over
  //    an absolute portrait + veil + champagne index + caption. All hover
  //    motion (zoom/colorize/border/caption-rise/city-reveal), the absolute
  //    layering, and the gold border live in customCss (caps + single-side). ──
  const faceCard = (spec: FaceSpec, i: number): BuilderNode => {
    const cardId = makeId("card");
    const img: BuilderNode = {
      id: makeId("image"),
      kind: "image",
      props: {
        src: PORTRAITS[i % PORTRAITS.length]!,
        alt: `${spec.name}, portrait`,
        priority: i === 0,
        style: {
          width: "100%",
          height: "100%",
          objectFit: "cover",
          position: "absolute",
          top: "0px",
          left: "0px",
        },
      },
      i18n: { es: { alt: spec.altEs } },
    };
    const veil: BuilderNode = {
      id: makeId("container"),
      kind: "container",
      props: {
        layout: "stack",
        style: {
          position: "absolute",
          top: "0px",
          right: "0px",
          bottom: "0px",
          left: "0px",
          backgroundImage: VEIL,
          opacity: 0.9,
          pointerEvents: "none",
          zIndex: 1,
        },
      },
      children: [],
    };
    const idxId = makeId("paragraph");
    const idx: BuilderNode = {
      id: idxId,
      kind: "paragraph",
      props: {
        text: spec.index,
        style: {
          position: "absolute",
          top: "16px",
          left: "18px",
          zIndex: 2,
          fontFamily: DISPLAY_FONT,
          // Bumped up a notch (14px → 17px) for clearer read over the photos.
          fontSize: "17px",
          letterSpacing: "0.1em",
          // Full-strength champagne; the faint look came from the index sitting
          // dark-on-dark, so we lift opacity to ~0.92 and add a legibility
          // shadow (caps-bound → customCss, both routed per-node by id).
          textColor: CHAMPAGNE,
          customCss: [
            `[data-builder-node-id="${idxId}"] { color: rgba(224,192,116,0.92); text-shadow: 0 1px 4px rgba(8,7,10,0.6); }`,
          ].join("\n"),
          pointerEvents: "none",
        },
      },
    };
    const name: BuilderNode = {
      id: makeId("heading"),
      kind: "heading",
      props: {
        text: spec.name,
        level: 3,
        style: {
          fontFamily: DISPLAY_FONT,
          fontSize: "clamp(1.2rem,1.7vw,1.6rem)",
          lineHeight: "1.05",
          textColor: "#ffffff",
        },
      },
      i18n: { es: { text: spec.nameEs } },
    };
    const cityId = makeId("paragraph");
    const city: BuilderNode = {
      id: cityId,
      kind: "paragraph",
      props: {
        text: spec.city,
        style: {
          fontSize: "10px",
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          textColor: CHAMPAGNE,
          marginTopFree: "6px",
        },
      },
      i18n: { es: { text: spec.cityEs } },
    };
    const captionId = makeId("container");
    const caption: BuilderNode = {
      id: captionId,
      kind: "container",
      props: {
        layout: "stack",
        style: {
          position: "absolute",
          left: "18px",
          right: "18px",
          bottom: "16px",
          zIndex: 2,
          gap: "0px",
          pointerEvents: "none",
        },
      },
      children: [name, city],
    };
    const css = [
      // The tile itself: overflow hidden, paper ground, transparent→gold border.
      `{ position: relative; overflow: hidden; background: ${PAPER2}; border: 1px solid transparent; transition: border-color .5s ease; aspect-ratio: 4 / 5; }`,
      // Card #1 (the hero) is taller — let it fill its 2-row span instead of 4/5.
      i === 0 ? `{ aspect-ratio: auto; min-height: 100%; }` : "",
      // Hover: gold border in (gated to fine pointers + reduced-motion safe).
      `@media (hover: hover) { [data-builder-node-id="${cardId}"]:hover { border-color: ${LINE}; } }`,
      // Image resting treatment + hover zoom/colorize.
      `[data-builder-node-id="${img.id}"] { filter: brightness(0.92) saturate(1.05); transition: transform 1.1s ease, filter 1.1s ease; }`,
      `@media (hover: hover) { [data-builder-node-id="${cardId}"]:hover [data-builder-node-id="${img.id}"] { transform: scale(1.05); filter: brightness(1) saturate(1.08); } }`,
      // Veil deepens on hover.
      `[data-builder-node-id="${veil.id}"] { transition: opacity .5s ease; }`,
      `@media (hover: hover) { [data-builder-node-id="${cardId}"]:hover [data-builder-node-id="${veil.id}"] { opacity: 1; } }`,
      // Caption rises 6px → 0 on hover; city label fades 0 → 1.
      `[data-builder-node-id="${captionId}"] { transform: translateY(6px); transition: transform .5s ease; }`,
      `[data-builder-node-id="${cityId}"] { opacity: 0; transition: opacity .5s ease; }`,
      `@media (hover: hover) { [data-builder-node-id="${cardId}"]:hover [data-builder-node-id="${captionId}"] { transform: none; } [data-builder-node-id="${cardId}"]:hover [data-builder-node-id="${cityId}"] { opacity: 1; } }`,
      `@media (prefers-reduced-motion: reduce) { [data-builder-node-id="${captionId}"] { transform: none; } [data-builder-node-id="${cityId}"] { opacity: 1; } }`,
    ]
      .filter(Boolean)
      .join("\n");
    // Stagger delays as clean fixed strings (revealDelay cap = 16 chars; float
    // arithmetic would overflow, e.g. "0.36000000000004s").
    const delays = ["0.16s", "0.22s", "0.28s", "0.34s", "0.4s", "0.46s", "0.52s", "0.58s"];
    return {
      // A face card is a `container` (not `card`) so it can hold container
      // children (veil + caption); `card` only permits leaf editorial nodes.
      id: cardId,
      kind: "container",
      props: {
        layout: "stack",
        style: {
          gridColumn: spec.gridColumn,
          gridRow: spec.gridRow,
          revealOnView: "fade-up",
          revealDelay: delays[i] ?? "0.6s",
          customCss: css,
        },
      },
      children: [img, veil, idx, caption],
    };
  };

  // ── Mosaic — 12-col grid. gridAutoRows clamp exceeds the 16-cap AND is not a
  //    first-class prop → routed via customCss. ≤760px collapses to 2 cols with
  //    card #1 spanning the full row. ────────────────────────────────────────
  const mosaicId = makeId("container");
  const mosaic: BuilderNode = {
    id: mosaicId,
    kind: "container",
    props: {
      layout: "grid",
      style: {
        gridTemplateColumns: "repeat(12,1fr)",
        gap: "14px",
        containerType: "inline-size",
        responsive: {
          mobile: { gridTemplateColumns: "repeat(2,1fr)" },
        },
        customCss: [
          `{ grid-auto-rows: clamp(150px, 19vw, 200px); }`,
          // ≤760px: 2 cols, the hero spans both + 2 rows; the rest auto-place.
          `@media (max-width: 760px) { [data-builder-node-id="${mosaicId}"] { grid-template-columns: repeat(2, 1fr) !important; grid-auto-rows: clamp(170px, 42vw, 240px); } }`,
        ].join("\n"),
      },
    },
    children: FACES.map((spec, i) => faceCard(spec, i)),
  };
  // On mobile the hero card needs to span both columns + 2 rows; the per-card
  // gridColumn/gridRow are desktop placements, so override card #1 in mobile CSS.
  const heroCardId = (mosaic.children[0] as BuilderNode).id;
  mosaic.props.style!.customCss +=
    `\n@media (max-width: 760px) { [data-builder-node-id="${heroCardId}"] { grid-column: span 2 !important; grid-row: span 2 !important; } }`;

  // ── See-all link ──────────────────────────────────────────────────────────
  const seeAllId = makeId("button");
  const seeAll: BuilderNode = {
    id: seeAllId,
    kind: "button",
    props: {
      // Backend §1: card + see-all links route to the REAL tenant directory
      // surface, never the mockup's dead roster.html.
      label: "See all faces →",
      href: "/directory",
      tone: "secondary",
      style: {
        backgroundColor: "transparent",
        textColor: INK,
        textTransform: "uppercase",
        letterSpacing: "0.18em",
        fontSize: "0.74rem",
        borderWidth: "0px",
        paddingLeft: "0px",
        paddingRight: "0px",
        customCss: [
          `[data-builder-node-id="${seeAllId}"]:hover { color: ${CHAMPAGNE}; }`,
        ].join("\n"),
      },
    },
    i18n: { es: { label: "Ver todos los rostros →" } },
  };
  const seeAllRow: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "row",
      style: {
        justifyContent: "center",
        marginTopFree: "40px",
        revealOnView: "fade-up",
      },
    },
    children: [seeAll],
  };

  // ── Inner wrap (max-width, centered) ─────────────────────────────────────
  const innerWrap: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      style: {
        maxWidthFree: "1440px",
        marginLeftFree: "auto",
        marginRightFree: "auto",
        width: "100%",
        gap: "0px",
        paddingLeft: "24px",
        paddingRight: "24px",
      },
    },
    children: [header, mosaic, seeAllRow],
  };

  // ── Root — full-bleed dark section; oversized fluid section padding (clamp
  //    exceeds the 16-cap) lives in customCss. ──────────────────────────────
  const rootId = makeId("container");
  return {
    id: rootId,
    kind: "container",
    props: {
      htmlTag: "section",
      layout: "stack",
      style: {
        backgroundColor: ESPRESSO,
        containerType: "inline-size",
        customCss: [
          `{ padding-top: clamp(64px, 9vw, 128px); padding-bottom: clamp(64px, 9vw, 128px); }`,
        ].join("\n"),
      },
    },
    children: [innerWrap],
  };
}
