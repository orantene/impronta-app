/**
 * Builder-node composition preset — Noir & Or "Featured faces" board.
 *
 * Editorial roster showcase ("The board, edited."). A split header over a clean
 * 4-up grid of face cards bound to the agency's REAL roster. The grid is a
 * builder REPEATER: its container carries props.dataBinding (sourceKey
 * "featured_talent_profiles", repeat, maxItems 8) and holds exactly ONE child —
 * the faceCard TEMPLATE — which render.tsx clones once per roster record,
 * resolving the {{imageUrl}} / {{displayName}} / {{locationLabel}} / {{href}}
 * tokens per talent. Each card is a relative container (overflow hidden, hover→
 * gold border) holding an absolute portrait, a bottom-up dark veil, a caption
 * (name + city), and an invisible full-tile link to the real /t/{profileCode}
 * profile. A centered "See all faces →" link closes it.
 *
 * Freeform: on drop it explodes into individually editable nodes on the shared
 * Page Builder Core render path. Colors/fonts bind to token sentinels with the
 * literal Noir & Or palette as the default (espresso #100e13, paper-2 #161320,
 * ink #ece4d3, gold #c6a14e, champagne #e0c074, line rgba(198,161,78,0.26)).
 * EN/ES seeded per text node via the node-level i18n overlay.
 *
 * Caps-bound (the #1 hazard): every hover transition/zoom/colorize/caption-rise/
 * city-reveal, the single-side-free absolute image/veil layering, and the tile
 * aspect-ratio live in `style.customCss` (8000-char cap), scoped per-node via
 * [data-builder-node-id]. The grid gridTemplateColumns ("repeat(4,1fr)") stays
 * within its cap.
 *
 * Backend (handoff): the board renders the LIVE roster via the builder repeater
 * contract — NOT hardcoded faces. The renderer resolves
 * featured_talent_profiles (auto_featured_flag with recent-talent fallback), so
 * for impronta (45 public roster rows) the collection is always non-empty (~12
 * items, clamped to maxItems 8); the unsafe empty-template branch in
 * render.tsx renderRepeatContainerChildren is never reached. Card + see-all
 * links route to the REAL tenant surfaces (per-card → {{href}} = /t/{code};
 * see-all → /directory) — never the mockup's dead model.html / roster.html.
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
        // When the header stacks on mobile, end-align shoves left-aligned copy
        // to the right gutter — realign to start so it sits under the headline.
        responsive: { mobile: { alignSelf: "start" } },
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

  // ── One face card TEMPLATE — the repeater's single child. render.tsx clones
  //    it once per roster record and resolves the {{tokens}} per talent. It is a
  //    relative tile (overflow hidden, hover gold border) over an absolute
  //    portrait + veil + caption + an invisible full-tile profile link. All
  //    hover motion (zoom/colorize/border/caption-rise/city-reveal), the
  //    absolute layering, the gold border, and the 4:5 aspect ratio live in
  //    customCss (caps + single-side). Bindings use {{imageUrl}} / {{displayName}}
  //    / {{locationLabel}} / {{href}} from FEATURED_TALENT_FIELDS. ────────────
  const faceCardTemplate = (): BuilderNode => {
    const cardId = makeId("card");
    const img: BuilderNode = {
      id: makeId("image"),
      kind: "image",
      props: {
        // Per-record portrait — resolved by resolveBuilderFieldTokens from the
        // roster row's imageUrl (alias of thumbnailUrl). The first card is the
        // LCP candidate but in a repeater every clone shares this template, so we
        // leave priority off and let the renderer lazy-load tiles.
        src: "{{imageUrl}}",
        alt: "{{displayName}}",
        // Explicit field bindings (parity with inline tokens; both resolve).
        fieldBindings: { src: "imageUrl", alt: "displayName" },
        style: {
          width: "100%",
          height: "100%",
          objectFit: "cover",
          position: "absolute",
          top: "0px",
          left: "0px",
        },
      },
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
    const name: BuilderNode = {
      id: makeId("heading"),
      kind: "heading",
      props: {
        text: "{{displayName}}",
        level: 3,
        fieldBindings: { text: "displayName" },
        style: {
          fontFamily: DISPLAY_FONT,
          fontSize: "clamp(1.2rem,1.7vw,1.6rem)",
          lineHeight: "1.05",
          textColor: "#ffffff",
        },
      },
    };
    const cityId = makeId("paragraph");
    const city: BuilderNode = {
      id: cityId,
      kind: "paragraph",
      props: {
        text: "{{locationLabel}}",
        fieldBindings: { text: "locationLabel" },
        style: {
          fontSize: "10px",
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          textColor: CHAMPAGNE,
          marginTopFree: "6px",
        },
      },
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
    // Invisible full-tile link carrying the per-record profile href — the proven
    // divisions tile pattern. {{href}} resolves to the real /t/{profileCode}
    // profile URL (already locale + tenant prefixed by the renderer).
    const link: BuilderNode = {
      id: makeId("button"),
      kind: "button",
      props: {
        label: "View {{displayName}}",
        href: "{{href}}",
        tone: "secondary",
        fieldBindings: { href: "href", label: "displayName" },
        style: {
          position: "absolute",
          top: "0px",
          right: "0px",
          bottom: "0px",
          left: "0px",
          opacity: 0,
          zIndex: 3,
          customCss: "{ display: block; }",
        },
      },
      i18n: { es: { label: "Ver {{displayName}}" } },
    };
    const css = [
      // The tile itself: overflow hidden, paper ground, transparent→gold border,
      // editorial 4:5 portrait ratio (drives the tile height; on a CONTAINER the
      // aspectRatioFree prop is dropped, so it must live in customCss).
      `{ position: relative; overflow: hidden; background: ${PAPER2}; border: 1px solid transparent; transition: border-color .5s ease; aspect-ratio: 4 / 5; }`,
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
    ].join("\n");
    return {
      // A face card is a `container` (not `card`) so it can hold container
      // children (veil + caption); `card` only permits leaf editorial nodes.
      id: cardId,
      kind: "container",
      props: {
        layout: "stack",
        style: {
          revealOnView: "fade-up",
          customCss: css,
        },
      },
      children: [img, veil, caption, link],
    };
  };

  // ── Grid — clean 4-up uniform tiling. This container is the REPEATER: it
  //    carries props.dataBinding (featured_talent_profiles, repeat, maxItems 8)
  //    and holds EXACTLY ONE child (the faceCard template) which render.tsx
  //    clones per roster record. tablet=2 / mobile=2 cols. ───────────────────
  const mosaicId = makeId("container");
  const mosaic: BuilderNode = {
    id: mosaicId,
    kind: "container",
    props: {
      layout: "grid",
      // The builder repeater contract: bind the GRID to the live roster source.
      // featured_talent_profiles resolves via auto_featured_flag with a
      // recent-talent fallback, so for impronta the collection is always
      // non-empty (~12 items) → maxItems clamps it to 8 uniform tiles. The
      // single child below is the template render.tsx clones per record.
      dataBinding: {
        sourceKey: "featured_talent_profiles",
        mode: "bound",
        repeat: true,
        maxItems: 8,
      },
      // CONTAINER-level responsive: tablet stays a 2-up grid; MOBILE flips to a
      // swipeable 2-up SLIDER (display:"slider" + itemsPerView:2) so the 8
      // featured faces become a horizontal scroll-snap rail instead of a tall
      // stack. layout:"grid" guards the legacy column path; `display` wins for
      // presentation. Owners can re-tune mode/per-view in the Layout inspector.
      responsive: {
        tablet: { layout: "grid", columns: 2 },
        mobile: { layout: "grid", columns: 2, display: "slider", itemsPerView: 2 },
      },
      style: {
        gridTemplateColumns: "repeat(4,1fr)",
        gap: "14px",
        containerType: "inline-size",
      },
    },
    // EXACTLY ONE child — the repeater template. The renderer clones it once per
    // roster record; do NOT add hardcoded sibling cards here.
    children: [faceCardTemplate()],
  };

  // ── See-all link ──────────────────────────────────────────────────────────
  const seeAllId = makeId("button");
  const seeAll: BuilderNode = {
    id: seeAllId,
    kind: "button",
    props: {
      // Card + see-all links route to the REAL tenant directory surface, never
      // the mockup's dead roster.html.
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
        // Grow the touch target to ~44px without changing the visual look.
        paddingTop: "12px",
        paddingBottom: "12px",
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
          `{ padding-top: clamp(48px, 6vw, 88px); padding-bottom: clamp(48px, 6vw, 88px); }`,
        ].join("\n"),
      },
    },
    children: [innerWrap],
  };
}
