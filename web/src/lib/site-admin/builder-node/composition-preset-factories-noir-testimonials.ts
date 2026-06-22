/**
 * Builder-node composition preset — Noir & Or "Trusted on set." testimonials.
 *
 * A freeform `BuilderNode` tree (never a fixed-prop block): on drop it explodes
 * into individually editable nodes on the shared Page Builder Core render path.
 * Full-width dark espresso band, champagne eyebrow with a 30px gold hairline,
 * Cormorant H2, and a 3-col grid of outline quote cards (1col on mobile). Each
 * card lifts on hover (bg #17141c, translateY(-5px), gold border) with a big
 * gold quote mark, italic body, and an attribution block pinned to the bottom.
 *
 * Colors/fonts bind to token sentinels with the literal Noir & Or palette as
 * the default (espresso #100e13, paper-2 #161320, ink #ece4d3, gold #c6a14e,
 * champagne #e0c074, line rgba(198,161,78,0.26)). EN/ES seeded per text node via
 * the node-level i18n overlay. Single-side hairlines, hover lift, and section
 * padding clamps that exceed the 16-char escape caps live in `style.customCss`
 * (8000-char cap) — the only safe home for them.
 *
 * Manual editorial quotes (VERIFIED — there is no testimonials backend and none
 * is required). Registered + dispatched from `composition-presets.ts`.
 */
import type { BuilderNode } from "./types";
import { makeId } from "./create";

const DISPLAY_FONT =
  "var(--token-typography-heading-font-family, 'Cormorant Garamond', Georgia, serif)";
const ESPRESSO = "var(--token-color-background, #100e13)";
const INK = "var(--token-color-ink, #ece4d3)";
const GOLD = "var(--token-color-primary, #c6a14e)";
const CHAMPAGNE = "var(--token-color-accent, #e0c074)";
const LINE = "var(--token-color-border, rgba(198,161,78,0.26))";
const MUTE = "rgba(236,228,211,0.58)";

interface QuoteSeed {
  readonly bodyEn: string;
  readonly bodyEs: string;
  readonly nameEn: string;
  readonly nameEs: string;
  readonly roleEn: string;
  readonly roleEs: string;
}

const QUOTES: ReadonlyArray<QuoteSeed> = [
  {
    bodyEn:
      "We sent a brief and got back a board that already understood the campaign. The shortlist was the final cast.",
    bodyEs:
      "Enviamos un brief y recibimos un board que ya entendía la campaña. La preselección fue el casting final.",
    nameEn: "María Sandoval",
    nameEs: "María Sandoval",
    roleEn: "Casting Director, Marea Studio",
    roleEs: "Directora de Casting, Marea Studio",
  },
  {
    bodyEn:
      "Every face felt chosen, not pulled from a database. That is the difference between a board and an agency.",
    bodyEs:
      "Cada rostro se sintió elegido, no sacado de una base de datos. Esa es la diferencia entre un board y una agencia.",
    nameEn: "Tomás Iglesias",
    nameEs: "Tomás Iglesias",
    roleEn: "Photographer, Editorial Norte",
    roleEs: "Fotógrafo, Editorial Norte",
  },
  {
    bodyEn:
      "Bookings, contracts and call sheets in one thread. We shot two campaigns in the time one used to take.",
    bodyEs:
      "Reservas, contratos y call sheets en un solo hilo. Rodamos dos campañas en el tiempo que antes tomaba una.",
    nameEn: "Daniela Cruz",
    nameEs: "Daniela Cruz",
    roleEn: "Producer, Casa Lumera",
    roleEs: "Productora, Casa Lumera",
  },
];

function createQuoteCard(seed: QuoteSeed, index: number): BuilderNode {
  const cardId = makeId("card");
  // Hover lift + the per-card .5s ease live in customCss (the curated hover
  // subset has no transition timing for borderColor; this keeps all three
  // properties on one shared curve, matching the mockup's .quote:hover).
  const cardCss = [
    `{ transition: background-color .5s ease, transform .5s ease, border-color .5s ease; will-change: transform; }`,
    `@media (prefers-reduced-motion: reduce) { { transition: none; } }`,
    `@media (max-width:640px){ { padding-left: 22px; padding-right: 22px; } }`,
  ].join("\n");
  return {
    id: cardId,
    kind: "container",
    props: {
      layout: "stack",
      layerLabel: `Quote ${index + 1}`,
      style: {
        backgroundColor: "transparent",
        borderColor: LINE,
        borderWidth: "1px",
        borderStyle: "solid",
        borderRadius: "2px",
        paddingTop: "38px",
        paddingRight: "32px",
        paddingBottom: "38px",
        paddingLeft: "32px",
        gap: "26px",
        revealOnView: "fade-up",
        revealDelay: `${index * 0.08}s`,
        hover: {
          backgroundColor: "var(--token-color-surface, #17141c)",
          translate: "0 -5px",
          borderColor: GOLD,
        },
        customCss: cardCss,
      },
    },
    children: [
      // Big gold quote mark — Cormorant, clipped to a 28px box like the mockup
      // (`height:28px; line-height:.5; overflow:hidden`). aria-hidden decorative.
      {
        id: makeId("heading"),
        kind: "heading",
        props: {
          text: "“",
          level: 3,
          layerLabel: "Quote mark",
          style: {
            fontFamily: DISPLAY_FONT,
            fontSize: "4rem",
            lineHeight: "0.5",
            textColor: GOLD,
            height: "28px",
            overflow: "hidden",
          },
        },
      },
      // Italic Cormorant body quote.
      {
        id: makeId("paragraph"),
        kind: "paragraph",
        props: {
          text: seed.bodyEn,
          layerLabel: "Quote body",
          style: {
            fontFamily: DISPLAY_FONT,
            fontStyle: "italic",
            fontSize: "1.4rem",
            lineHeight: "1.42",
            textColor: INK,
            textWrap: "pretty",
            responsive: { mobile: { fontSize: "1.2rem" } },
          },
        },
        i18n: { es: { text: seed.bodyEs } },
      },
      // Attribution — pinned to the bottom of the flex card (margin-top:auto).
      {
        id: makeId("container"),
        kind: "container",
        props: {
          layout: "stack",
          layerLabel: "Attribution",
          style: { gap: "5px", marginTopFree: "auto" },
        },
        children: [
          {
            id: makeId("paragraph"),
            kind: "paragraph",
            props: {
              text: seed.nameEn,
              layerLabel: "Name",
              style: {
                fontSize: "12px",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                fontWeight: 500,
                textColor: CHAMPAGNE,
              },
            },
            i18n: { es: { text: seed.nameEs } },
          },
          {
            id: makeId("paragraph"),
            kind: "paragraph",
            props: {
              text: seed.roleEn,
              layerLabel: "Role",
              style: {
                fontSize: "10.5px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                textColor: MUTE,
              },
            },
            i18n: { es: { text: seed.roleEs } },
          },
        ],
      },
    ],
  };
}

export function createTestimonialsTrioPreset(): Exclude<
  BuilderNode,
  { kind: "section" }
> {
  // Eyebrow: 30px gold hairline before champagne tracked caps (mockup
  // `.eyebrow::before`). The hairline is a pseudo-element → customCss.
  const eyebrowId = makeId("paragraph");
  const eyebrowCss = [
    `{ display: inline-flex; align-items: center; gap: 12px; }`,
    `::before { content: ""; width: 30px; height: 1px; background: ${GOLD}; display: inline-block; }`,
    `@media (max-width:640px){ { letter-spacing: 0.28em; } }`,
  ].join("\n");

  const sectionHead: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      layerLabel: "Section head",
      style: { gap: "20px", marginBottomFree: "48px" },
    },
    children: [
      {
        id: eyebrowId,
        kind: "paragraph",
        props: {
          text: "Kind words",
          layerLabel: "Eyebrow",
          style: {
            fontSize: "11px",
            letterSpacing: "0.36em",
            textTransform: "uppercase",
            fontWeight: 500,
            textColor: CHAMPAGNE,
            customCss: eyebrowCss,
          },
        },
        i18n: { es: { text: "Palabras amables" } },
      },
      {
        id: makeId("heading"),
        kind: "heading",
        props: {
          text: "Trusted on set.",
          level: 2,
          layerLabel: "Headline",
          style: {
            fontFamily: DISPLAY_FONT,
            fontSize: "clamp(2.2rem,4vw,3.4rem)",
            fontWeight: 600,
            lineHeight: "1.02",
            textColor: INK,
            textWrap: "balance",
            maxWidthFree: "16ch",
          },
        },
        i18n: { es: { text: "Confianza en el set." } },
      },
    ],
  };

  const trio: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "grid",
      columns: 3,
      layerLabel: "Quote grid",
      style: {
        gap: "18px",
        responsive: { mobile: { gridTemplateColumns: "1fr" } },
      },
      responsive: { mobile: { columns: 1 } },
    },
    children: QUOTES.map((seed, i) => createQuoteCard(seed, i)),
  };

  // Section vertical padding clamp (clamp(74px,10vw,158px)) exceeds the 16-char
  // paddingTop/Bottom caps → route through customCss. Inner wrap centers a max
  // measure on the warm dark band.
  const sectionCss = `{ padding-top: clamp(74px,10vw,158px); padding-bottom: clamp(74px,10vw,158px); }\n@media (max-width:640px){ { padding-top: 52px; padding-bottom: 52px; } }`;

  return {
    id: makeId("container"),
    kind: "container",
    props: {
      htmlTag: "section",
      layout: "stack",
      layerLabel: "Testimonials band",
      style: {
        backgroundColor: ESPRESSO,
        textColor: INK,
        paddingLeft: "6vw",
        paddingRight: "6vw",
        containerType: "inline-size",
        customCss: sectionCss,
      },
    },
    children: [
      {
        id: makeId("container"),
        kind: "container",
        props: {
          layout: "stack",
          layerLabel: "Content wrap",
          style: { gap: "0px", maxWidthFree: "1440px", width: "100%" },
        },
        children: [sectionHead, trio],
      },
    ],
  };
}
