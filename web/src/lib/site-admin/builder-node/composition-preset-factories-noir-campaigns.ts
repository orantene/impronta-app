/**
 * Builder-node composition preset — Noir & Or "Campaigns & lookbooks" rail.
 *
 * A freeform horizontal-scroll "recent work" rail (never a fixed-prop block):
 * on drop it explodes into individually editable nodes on the shared Page
 * Builder Core render path. Section head (60-40 split, eyebrow lockup + display
 * H2 + muted aside) over a horizontal flex track (scroll-snap, 3px gold
 * scrollbar) carrying 6 campaign cards — each a 4:5 media frame + caption row
 * (brand serif / champagne-uppercase season, gold hairline). Colors/fonts bind
 * to token sentinels with the literal Noir & Or palette as the default
 * (espresso #100e13, paper-2 #161320, ink #ece4d3, gold #c6a14e, champagne
 * #e0c074, line rgba(198,161,78,0.26)). EN/ES seeded per text node via the
 * node-level i18n overlay.
 *
 * CAP NOTE: `flex:0 0 clamp(260px,30vw,380px)` (23 chars) EXCEEDS the 16-char
 * flexBasis cap, so the per-card basis lives in each card's `style.customCss`
 * (8000-char cap). The gold scrollbar (::-webkit-scrollbar) + scroll-snap also
 * live in the rail's customCss — the only safe home for pseudo-elements.
 *
 * Registered + dispatched from `composition-presets.ts`.
 */
import type { BuilderNode } from "./types";
import { makeId, createImage } from "./create";

const DISPLAY_FONT =
  "var(--token-typography-heading-font-family, 'Cormorant Garamond', Georgia, serif)";
const GOLD = "var(--token-color-primary, #c6a14e)";
const CHAMPAGNE = "#e0c074";
// This section sits on the dark espresso ground, so ink/muted must be LIGHT.
// (The earlier values pointed at --token-color-text with a #100e13 fallback,
// rendering dark-on-dark = invisible heading + copy.)
const INK = "var(--token-color-ink, #ece4d3)";
const LINE = "rgba(198,161,78,0.26)";
const MUTED = "rgba(236,228,211,0.62)";

interface Campaign {
  brandEn: string;
  brandEs: string;
  seasonEn: string;
  seasonEs: string;
  altEn: string;
  altEs: string;
  src: string;
}

const CAMPAIGNS: readonly Campaign[] = [
  {
    brandEn: "Casa Tulum",
    brandEs: "Casa Tulum",
    seasonEn: "Resort SS26",
    seasonEs: "Resort PV26",
    altEn: "Casa Tulum resort campaign — atelier detail in warm light",
    altEs: "Campaña resort Casa Tulum — detalle de atelier en luz cálida",
    src: "/talent-templates/demo/impronta-2026/atelier-3.jpg",
  },
  {
    brandEn: "Maison Lloré",
    brandEs: "Maison Lloré",
    seasonEn: "Couture FW25",
    seasonEs: "Alta Costura OI25",
    altEn: "Maison Lloré couture editorial portrait",
    altEs: "Retrato editorial de alta costura Maison Lloré",
    src: "/talent-templates/demo/impronta-2026/portrait-5.jpg",
  },
  {
    brandEn: "Atelier Sur",
    brandEs: "Atelier Sur",
    seasonEn: "Editorial",
    seasonEs: "Editorial",
    altEn: "Atelier Sur editorial portrait",
    altEs: "Retrato editorial Atelier Sur",
    src: "/talent-templates/demo/impronta-2026/portrait-2.jpg",
  },
  {
    brandEn: "Semana CDMX",
    brandEs: "Semana CDMX",
    seasonEn: "Runway 26",
    seasonEs: "Pasarela 26",
    altEn: "Mexico City Fashion Week runway portrait",
    altEs: "Retrato de pasarela de la Semana de la Moda en CDMX",
    src: "/talent-templates/demo/impronta-2026/portrait-3.jpg",
  },
  {
    brandEn: "Riviera Living",
    brandEs: "Riviera Living",
    seasonEn: "Lifestyle",
    seasonEs: "Estilo de vida",
    altEn: "Riviera Living lifestyle portrait",
    altEs: "Retrato de estilo de vida Riviera Living",
    src: "/talent-templates/demo/impronta-2026/portrait-6.jpg",
  },
  {
    brandEn: "Mar Azul",
    brandEs: "Mar Azul",
    seasonEn: "Swim SS26",
    seasonEs: "Baño PV26",
    altEn: "Mar Azul swimwear campaign — atelier studio detail",
    altEs: "Campaña de trajes de baño Mar Azul — detalle de estudio atelier",
    src: "/talent-templates/demo/impronta-2026/atelier-1.jpg",
  },
];

function eyebrowLockup(): BuilderNode {
  // 30px gold hairline + uppercase gold eyebrow, in a baseline row.
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "row",
      style: {
        gap: "14px",
        alignItems: "center",
        flexWrap: "nowrap",
      },
    },
    children: [
      {
        id: makeId("divider"),
        kind: "divider",
        props: {
          tone: "default",
          style: {
            width: "30px",
            height: "1px",
            backgroundColor: GOLD,
            borderWidth: "0",
          },
        },
      },
      {
        id: makeId("paragraph"),
        kind: "paragraph",
        props: {
          text: "Recent work",
          style: {
            fontSize: "11px",
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            textColor: GOLD,
            fontWeight: 500,
          },
        },
        i18n: { es: { text: "Trabajo reciente" } },
      },
    ],
  };
}

function sectionHead(): BuilderNode {
  // 60-40 split, baseline-aligned: left = eyebrow lockup + display H2; right
  // = muted aside (38ch).
  return {
    id: makeId("split"),
    kind: "split",
    props: {
      ratio: "60-40",
      gap: "l",
      collapseOnMobile: true,
      style: {
        alignItems: "flex-end",
        marginBottomFree: "48px",
        // Mobile (390px): tighten the head→rail gap so imagery is not pushed far
        // down the fold. (marginBottomFree drives the desktop look; this only
        // overrides at the mobile tier.)
        customCss: "@media (max-width: 640px) { { margin-bottom: 28px; } }",
      },
    },
    children: [
      {
        id: makeId("container"),
        kind: "container",
        props: {
          layout: "stack",
          gap: "m",
          style: { gap: "18px" },
        },
        children: [
          eyebrowLockup(),
          {
            id: makeId("heading"),
            kind: "heading",
            props: {
              text: "Campaigns & lookbooks.",
              level: 2,
              style: {
                fontFamily: DISPLAY_FONT,
                fontSize: "clamp(2.4rem,4.4vw,3.6rem)",
                lineHeight: "1.04",
                textColor: INK,
                maxWidthFree: "16ch",
                textWrap: "balance",
              },
            },
            i18n: { es: { text: "Campañas y lookbooks." } },
          },
        ],
      },
      {
        id: makeId("paragraph"),
        kind: "paragraph",
        props: {
          text: "A season of editorials, runway, and brand work shot across the Riviera Maya, Mexico City, and the Mediterranean.",
          style: {
            fontSize: "0.98rem",
            lineHeight: "1.6",
            textColor: MUTED,
            maxWidthFree: "38ch",
          },
        },
        i18n: {
          es: {
            text: "Una temporada de editoriales, pasarela y trabajo de marca en la Riviera Maya, Ciudad de México y el Mediterráneo.",
          },
        },
      },
    ],
  };
}

function campaignCard(c: Campaign, index: number): BuilderNode {
  // Card ROOT is a `container` (not a `card`): the §7A card child-policy is
  // typography/media/actions ONLY — no nested layout shells — but this card
  // needs a media-frame container + a caption row container, so a generic
  // container is the right freeform shell.
  const cardId = makeId("container");
  const imageId = makeId("image");
  const captionBrandId = makeId("paragraph");
  // flexBasis clamp (23 chars) exceeds the 16-cap → live in customCss. Hover
  // zoom + brightness on the media image is also routed here (filter hover is
  // not in the curated hover subset), gated behind hover-capable pointers.
  const css = [
    `{ flex: 0 0 clamp(260px,30vw,380px); scroll-snap-align: start; }`,
    `@media (hover: hover) { [data-builder-node-id="${imageId}"] { transition: transform 1s ease, filter 1s ease; } }`,
    `@media (hover: hover) { :hover [data-builder-node-id="${imageId}"] { transform: scale(1.05); filter: brightness(1); } }`,
    // Mobile (390px): widen cards to ~304px so the next card peeks and the
    // horizontal-scroll affordance survives instead of flooring at 260px.
    `@media (max-width: 640px) { { flex: 0 0 78vw; } }`,
    `@media (max-width: 640px) { [data-builder-node-id="${captionBrandId}"] { font-size: 1.2rem; } }`,
  ].join("\n");

  const mediaId = makeId("container");
  const media: BuilderNode = {
    id: mediaId,
    kind: "container",
    props: {
      layout: "stack",
      style: {
        // aspect-ratio drives the 4:5 frame via customCss — the aspectRatioFree
        // prop's inline path only applies to image nodes, so on this container it
        // is dropped and the frame falls back to the image's natural aspect.
        aspectRatioFree: "4 / 5",
        overflow: "hidden",
        backgroundColor: "var(--token-color-surface, #161320)",
        customCss: "{ aspect-ratio: 4 / 5; }",
      },
    },
    children: [
      {
        ...(createImage(index) as Extract<BuilderNode, { kind: "image" }>),
        id: imageId,
        props: {
          ...(createImage(index) as Extract<BuilderNode, { kind: "image" }>)
            .props,
          src: c.src,
          alt: c.altEn,
          priority: false,
          style: {
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.9)",
          },
        },
        i18n: { es: { alt: c.altEs } },
      },
    ],
  };

  const caption: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "row",
      style: {
        justifyContent: "space-between",
        alignItems: "baseline",
        marginTopFree: "16px",
        paddingBottom: "14px",
        gap: "14px",
        customCss: `{ border-bottom: 1px solid ${LINE}; }`,
      },
    },
    children: [
      {
        id: captionBrandId,
        kind: "paragraph",
        props: {
          text: c.brandEn,
          style: {
            fontFamily: DISPLAY_FONT,
            fontSize: "1.35rem",
            textColor: INK,
            lineHeight: "1.1",
          },
        },
        i18n: { es: { text: c.brandEs } },
      },
      {
        id: makeId("paragraph"),
        kind: "paragraph",
        props: {
          text: c.seasonEn,
          style: {
            fontSize: "10px",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            textColor: CHAMPAGNE,
            whiteSpace: "nowrap",
          },
        },
        i18n: { es: { text: c.seasonEs } },
      },
    ],
  };

  return {
    id: cardId,
    kind: "container",
    props: {
      layout: "stack",
      layerLabel: `Campaign — ${c.brandEn}`,
      style: {
        backgroundColor: "transparent",
        scrollSnapAlign: "start",
        revealOnView: "fade-up",
        revealDelay: `${index * 0.08}s`,
        customCss: css,
      },
    },
    children: [media, caption],
  };
}

export function createCampaignsLookbookRailPreset(): Exclude<
  BuilderNode,
  { kind: "section" }
> {
  const railId = makeId("container");
  // Gold scrollbar + scroll-snap on the track (pseudo-element → customCss).
  // NOTE: scrollbar pseudo-elements target the RAIL NODE ITSELF, so they must be
  // bare selectors ({} / ::-webkit-scrollbar). Prefixing them with the rail's own
  // id double-prefixes ([rail] [rail]::...) and matches NOTHING — that was a dead
  // rule (the gold scrollbar never rendered). Bare selectors scope to [rail]::...
  const railCss = [
    `{ scroll-snap-type: x mandatory; scrollbar-width: thin; scrollbar-color: ${GOLD} transparent; overscroll-behavior-x: contain; }`,
    `::-webkit-scrollbar { height: 3px; }`,
    `::-webkit-scrollbar-thumb { background: ${GOLD}; }`,
    `::-webkit-scrollbar-track { background: transparent; }`,
  ].join("\n");

  const rail: BuilderNode = {
    id: railId,
    kind: "container",
    props: {
      layout: "row",
      style: {
        gap: "18px",
        flexWrap: "nowrap",
        overflow: "scroll",
        paddingBottom: "18px",
        alignItems: "flex-start",
        customCss: railCss,
      },
    },
    children: CAMPAIGNS.map((c, i) => campaignCard(c, i)),
  };

  return {
    id: makeId("container"),
    kind: "container",
    props: {
      htmlTag: "section",
      layout: "stack",
      style: {
        backgroundColor: "var(--token-color-background, #f7f4ef)",
        paddingTop: "9vh",
        paddingBottom: "9vh",
        paddingLeft: "6vw",
        paddingRight: "6vw",
        containerType: "inline-size",
        // Mobile (390px): trim vertical padding so the section is not over-tall on
        // a short viewport. Desktop keeps 9vh. (Self-block scopes to this node.)
        customCss: "@media (max-width: 640px) { { padding-top: 6vh; padding-bottom: 6vh; } }",
      },
    },
    children: [sectionHead(), rail],
  };
}
