/**
 * Builder-node composition preset — Noir & Or "Divisions / Find your cast." row.
 *
 * A freeform `BuilderNode` tree (never a fixed-prop block): on drop it explodes
 * into individually editable nodes on the shared Page Builder Core render path.
 *
 * LIVE-DATA REPEATER (retrofit 2026-06-22): the row grid no longer mints 5
 * hardcoded divisions. It carries `props.dataBinding = { sourceKey:
 * "tenant_directory_search", repeat: true, maxItems: 5 }`. The render path
 * (render.tsx renderRepeatContainerChildren) resolves that source to the
 * tenant's real directory categories (roster-held talent_type terms) and CLONES
 * the container's single child — the `divisionTile()` TEMPLATE — once per
 * record. {{name}} / {{href}} tokens inside the template resolve per-record via
 * resolveBuilderFieldTokens. So the container MUST have exactly one child.
 *
 * NO PER-CATEGORY PHOTO: `tenant_directory_search` records expose only
 * { name, slug, href } — there is no portrait per category. So the tile is a
 * portrait-LESS editorial Noir card: a dark espresso ground, a soft top-gold
 * gradient + a gold hairline, the category name in the Cormorant display font,
 * and a champagne index/arrow row, with a full-tile link to the real
 * `/directory?type=<slug>` href the source emits.
 *
 * Colors/fonts bind to token sentinels with the literal Noir & Or palette as the
 * default (espresso #100e13, ink #ece4d3, gold #c6a14e, champagne #e0c074, line
 * rgba(198,161,78,0.26)). Resting/hover treatment + the 5→3→1 column reflow live
 * in `style.customCss` (8000-char cap) — the only safe home for hover
 * border/gradient / single-side rules that exceed the 16-char escapes.
 *
 * EMPTY-STATE: render.tsx's empty-collection branch renders the template ONCE
 * unbound (raw {{tokens}} would show). For impronta this is NOT a risk: the hub
 * tenant has ~40 roster-held talent_type terms, so tenant_directory_search
 * always returns >0 records. The template still reads as an intentional
 * editorial tile with no data because the name is the only token in display
 * position. See the structured result's empty-state note.
 *
 * Registered + dispatched from `composition-presets.ts`.
 */
import type { BuilderNode } from "./types";
import { makeId } from "./create";

const DISPLAY_FONT =
  "var(--token-typography-heading-font-family, 'Cormorant Garamond', Georgia, serif)";
const INK = "var(--token-color-ink, #ece4d3)";
const CHAMPAGNE = "var(--token-color-secondary, #e0c074)";
const LINE = "var(--token-color-line, rgba(198,161,78,0.26))";
const ESPRESSO = "var(--token-color-background, #100e13)";

/**
 * Single repeater TEMPLATE tile. The grid container has exactly ONE child = this
 * node; render.tsx clones it once per `tenant_directory_search` record and
 * resolves the {{name}} / {{id}} / {{imageUrl}} tokens per-record.
 *
 * GRACEFUL PHOTO UPGRADE: the `tenant_directory_search` records DO carry an
 * `imageUrl` (home-data.ts maps each taxonomy term's promo image when it is set
 * + placed in `home_browse_by_type`). A bound `image` child reads it via the
 * {{imageUrl}} token: when the category has a promo image the tile shows a real
 * editorial portrait; when it doesn't, resolveBuilderFieldTokens yields "" and
 * the image node returns null (render.tsx `if (!src) return null`), so the
 * gold-wash treatment below is the always-present base. The tile therefore reads
 * as an intentional editorial card with OR without a photo — and auto-upgrades
 * the moment someone sets a category promo image in admin, with zero new code.
 *
 * Composition anchors content at BOTH the top (a gold tick + "Division" eyebrow)
 * and the bottom (the {{name}} + an Explore row) so the portrait-less base never
 * reads as an empty black box. Colors/fonts bind to Noir & Or token sentinels.
 */
function divisionTile(): BuilderNode {
  const cardId = makeId("container");

  // Per-category portrait — resolved per-record from the taxonomy promo image
  // via {{imageUrl}}. Wrapped in an absolutely-positioned container so the
  // image just fills it (cover, faces up). NULL when the category has no promo
  // image → the wash below is the card's whole treatment.
  const photo: BuilderNode = {
    id: makeId("image"),
    kind: "image",
    props: {
      src: "{{imageUrl}}",
      alt: "{{name}}",
      style: {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: "center top",
      },
    },
  };
  const photoLayer: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      style: {
        position: "absolute",
        left: "0",
        right: "0",
        top: "0",
        bottom: "0",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      },
    },
    children: [photo],
  };

  // Material — a PRESENT gold halo at the top + a strong dark scrim at the
  // bottom. Doubles as the legibility scrim over a photo AND as the card's
  // entire treatment when there is none (stronger gold than the old 0.16 wash).
  const wash: BuilderNode = {
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
          "radial-gradient(130% 100% at 50% 6%, rgba(198,161,78,0.24) 0%, rgba(198,161,78,0.07) 38%, rgba(16,14,19,0) 68%), linear-gradient(180deg, rgba(16,14,19,0) 28%, rgba(16,14,19,0.46) 66%, rgba(16,14,19,0.88) 100%)",
        pointerEvents: "none",
        zIndex: 1,
      },
    },
    children: [],
  };

  // Top marker — a short gold hairline tick + the "Division" eyebrow. Anchoring
  // content at the TOP as well as the bottom keeps the tile from reading empty.
  const topTick: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      style: {
        width: "30px",
        height: "1px",
        backgroundColor: CHAMPAGNE,
        marginBottomFree: "12px",
      },
    },
    children: [],
  };
  const eyebrow: BuilderNode = {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: "Division",
      style: {
        fontSize: "10px",
        textColor: CHAMPAGNE,
        textTransform: "uppercase",
        letterSpacing: "0.32em",
      },
    },
    i18n: { es: { text: "División" } },
  };
  const topMark: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      style: {
        position: "absolute",
        top: "0",
        left: "0",
        paddingTop: "18px",
        paddingLeft: "18px",
        paddingRight: "18px",
        zIndex: 2,
      },
    },
    children: [topTick, eyebrow],
  };

  // Category name — the live per-record token. Cormorant display font, larger.
  const name: BuilderNode = {
    id: makeId("heading"),
    kind: "heading",
    props: {
      text: "{{name}}",
      level: 3,
      style: {
        fontFamily: DISPLAY_FONT,
        fontSize: "2rem",
        textColor: INK,
        lineHeight: "1.02",
        marginBottomFree: "14px",
      },
    },
  };

  // Hairline divider above the Explore row — a thin champagne rule that gives the
  // label block editorial structure.
  const divider: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      style: {
        width: "100%",
        height: "1px",
        backgroundColor: LINE,
        marginBottomFree: "12px",
      },
    },
    children: [],
  };

  const exploreLabel: BuilderNode = {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: "Explore",
      style: {
        fontSize: "10.5px",
        textColor: CHAMPAGNE,
        textTransform: "uppercase",
        letterSpacing: "0.24em",
      },
    },
    i18n: { es: { text: "Explorar" } },
  };

  const arrow: BuilderNode = {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: "→",
      style: {
        fontSize: "13px",
        textColor: CHAMPAGNE,
      },
    },
  };

  const exploreRow: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "row",
      // Keep "Explore" + arrow on one line (space-between) on mobile too —
      // otherwise the renderer's <=640px column rule stacks them.
      responsive: {
        tablet: { layout: "row" },
        mobile: { layout: "row" },
      },
      style: {
        gap: "10px",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
      },
    },
    children: [exploreLabel, arrow],
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
        gap: "0px",
        paddingTop: "18px",
        paddingRight: "18px",
        paddingBottom: "18px",
        paddingLeft: "18px",
        zIndex: 2,
      },
    },
    children: [name, divider, exploreRow],
  };

  // Full-tile link carrying the per-record directory filter. NOTE: the
  // tenant_directory_search source's own {{href}} resolves to
  // /directory?type=<slug>, but the public directory route ONLY parses
  // ?tax=<term-uuid> (parseDirectoryQuery has no `type` handler), so {{href}}
  // would land on the UNFILTERED directory. The record also carries {{id}} (the
  // taxonomy term UUID), so we build the real working filter href directly.
  const link: BuilderNode = {
    id: makeId("button"),
    kind: "button",
    props: {
      label: "Open {{name}}",
      href: "/directory?tax={{id}}",
      tone: "secondary",
      style: {
        position: "absolute",
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
        opacity: 0,
        zIndex: 3,
        customCss: "{ display: block; }",
      },
    },
  };

  // Card-scoped customCss: tile shape + resting gold hairline + hover reveal.
  const cardCss = [
    // aspect-ratio drives the tile's height. It lives in customCss (not the
    // aspectRatioFree prop) because the prop's inline path only applies to image
    // nodes — on a container it is dropped and the tile collapses to 0 height.
    // 4/5 (was 3/4.4) is less towering, so the portrait-less base feels composed
    // rather than empty.
    `{ aspect-ratio: 4 / 5; border: 1px solid ${LINE}; transition: border-color .4s ease, transform .5s cubic-bezier(.2,.7,.2,1); }`,
    // Mobile: relax the portrait ratio so full-width tiles don't tower at 390px.
    // Selectorless inner rule -> scopes to the card root.
    `@media (max-width: 640px) { { aspect-ratio: 16 / 9; } }`,
    // Hover: brighten the hairline to gold + lift slightly. Leading-pseudo
    // selector (`:hover`) so the scoper prefixes to [id]:hover (valid flat CSS).
    `@media (hover: hover) and (prefers-reduced-motion: no-preference) {`,
    `  :hover { border-color: ${CHAMPAGNE}; transform: translateY(-3px); }`,
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
        aspectRatioFree: "4 / 5",
        justifyContent: "flex-end",
        backgroundColor: ESPRESSO,
        revealOnView: "fade-up",
        customCss: cardCss,
      },
    },
    children: [photoLayer, wash, topMark, label, link],
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
      // LIVE-DATA REPEATER: resolve the tenant's real directory categories and
      // clone the single child template once per record (maxItems caps at 5 to
      // hold the 5-up desktop grid). The container MUST have exactly one child.
      dataBinding: {
        sourceKey: "tenant_directory_search",
        mode: "bound",
        repeat: true,
        maxItems: 5,
      },
      layout: "grid",
      // Container-layout responsive map: emits data-builder-{tablet,mobile}-layout
      // so the grid SURVIVES at <=900/<=640px. Setting only style.responsive
      // .gridTemplateColumns is inert (the renderer forces flex-column on a
      // container with no data-builder-mobile-layout attr). The base desktop 5-up
      // is driven by the inline gridTemplateColumns below (the `columns` prop
      // enum caps at 4, so the 5-col base stays in style; tablet=3/mobile=1 fit).
      responsive: {
        tablet: { layout: "grid", columns: 3 },
        // One column on phones: the publish layout-health gate requires a
        // multi-column grid to collapse to a single column (or stack) on mobile,
        // and full-width division cards read cleaner than a cramped 2-up.
        mobile: { layout: "grid", columns: 1 },
      },
      style: {
        gridTemplateColumns: "repeat(5,1fr)",
        gap: "12px",
        responsive: {
          tablet: { gridTemplateColumns: "repeat(3,1fr)" },
          mobile: { gridTemplateColumns: "repeat(1,1fr)" },
        },
      },
    },
    // Exactly ONE child = the repeater template. render.tsx clones it per record.
    children: [divisionTile()],
  };

  return {
    id: makeId("container"),
    kind: "container",
    props: {
      htmlTag: "section",
      layout: "stack",
      style: {
        backgroundColor: ESPRESSO,
        paddingLeft: "6vw",
        paddingRight: "6vw",
        containerType: "inline-size",
        // Vertical rhythm: a width-relative clamp (was 8vh, which ballooned on
        // tall screens and stacked into ~200px inter-section voids). The clamp
        // exceeds the 16-char paddingTop/Bottom escape cap, so it lives in
        // customCss (selectorless inner rule -> scopes to the section root).
        // Mobile trims it further.
        customCss:
          "{ padding-top: clamp(48px,6vw,88px); padding-bottom: clamp(48px,6vw,88px); }\n@media (max-width: 640px) { { padding-top: 44px; padding-bottom: 44px; } }",
      },
    },
    children: [head, row],
  };
}
