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
 * resolves the {{name}} / {{href}} tokens per-record. Because the source carries
 * NO per-category image, this tile is portrait-LESS: a dark espresso ground with
 * a soft top-gold gradient, a gold hairline, the category {{name}} in the
 * Cormorant display font, and a champagne arrow row, all behind a full-tile link
 * to the real /directory?type=<slug> {{href}}.
 */
function divisionTile(): BuilderNode {
  const cardId = makeId("container");

  // Soft gold-wash gradient ground (replaces the portrait). Sits under the
  // label; gives the otherwise-flat espresso tile editorial depth + a top glow.
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
          "radial-gradient(120% 80% at 50% 0%, rgba(198,161,78,0.16) 0%, rgba(198,161,78,0.05) 34%, rgba(16,14,19,0) 64%), linear-gradient(to top, rgba(16,14,19,0.92) 0%, rgba(16,14,19,0.40) 52%, rgba(16,14,19,0.18) 100%)",
        pointerEvents: "none",
        zIndex: 1,
      },
    },
    children: [],
  };

  // Eyebrow above the name — keeps the tile from reading empty without a photo.
  const eyebrow: BuilderNode = {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: "Division",
      style: {
        fontSize: "10px",
        textColor: CHAMPAGNE,
        textTransform: "uppercase",
        letterSpacing: "0.3em",
        marginBottomFree: "10px",
      },
    },
    i18n: { es: { text: "División" } },
  };

  // Category name — the live per-record token. Cormorant display font.
  const name: BuilderNode = {
    id: makeId("heading"),
    kind: "heading",
    props: {
      text: "{{name}}",
      level: 3,
      style: {
        fontFamily: DISPLAY_FONT,
        fontSize: "1.75rem",
        textColor: INK,
        lineHeight: "1.04",
        marginBottomFree: "12px",
      },
    },
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
        gap: "6px",
        paddingTop: "18px",
        paddingRight: "18px",
        paddingBottom: "18px",
        paddingLeft: "18px",
        zIndex: 2,
      },
    },
    children: [eyebrow, name, exploreRow],
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
    `{ aspect-ratio: 3 / 4.4; border: 1px solid ${LINE}; transition: border-color .4s ease, transform .5s cubic-bezier(.2,.7,.2,1); }`,
    // Mobile: relax the tall 3/4.4 portrait ratio so full-width tiles don't
    // tower at 390px. Selectorless inner rule -> scopes to the card root.
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
        aspectRatioFree: "3 / 4.4",
        justifyContent: "flex-end",
        backgroundColor: ESPRESSO,
        revealOnView: "fade-up",
        customCss: cardCss,
      },
    },
    children: [wash, label, link],
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
        paddingTop: "8vh",
        paddingBottom: "8vh",
        paddingLeft: "6vw",
        paddingRight: "6vw",
        containerType: "inline-size",
        // Mobile: trim the 8vh top/bottom rhythm (vh padding isn't capped/
        // overridden per-breakpoint by the escapes, so customCss is its home).
        // Selectorless inner rule -> scopes to the section root.
        customCss:
          "@media (max-width: 640px) { { padding-top: 48px; padding-bottom: 48px; } }",
      },
    },
    children: [head, row],
  };
}
