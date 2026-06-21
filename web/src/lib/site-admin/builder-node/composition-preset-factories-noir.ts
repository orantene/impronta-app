/**
 * Builder-node composition presets — Noir & Or homepage blocks.
 *
 * Each factory returns a freeform `BuilderNode` tree (never a fixed-prop block):
 * on drop it explodes into individually editable nodes on the shared Page
 * Builder Core render path. Colors/fonts bind to token sentinels with the
 * literal Noir & Or palette as the default (espresso #100e13, paper-2 #161320,
 * ink #ece4d3, gold #c6a14e, champagne #e0c074). EN/ES seeded per text node via
 * the node-level i18n overlay. Long animations live in `style.customCss`
 * (8000-char cap) — the only safe home for @keyframes (transition/filter cap 120).
 *
 * Registered + dispatched from `composition-presets.ts`.
 */
import type { BuilderNode } from "./types";
import { makeId } from "./create";

const DISPLAY_FONT =
  "var(--token-typography-heading-font-family, 'Cormorant Garamond', Georgia, serif)";

export function createMarqueeTickerPreset(): Exclude<
  BuilderNode,
  { kind: "section" }
> {
  // Disciplines ticker — Cormorant-italic words split by gold "/" glyphs,
  // scrolling left forever (GPU transform; paused on hover; reduced-motion =
  // static). Every word + separator is a discrete editable node; the item set
  // is duplicated inside the track for a seamless loop. EN/ES seeded per node.
  const items: ReadonlyArray<readonly [string, string]> = [
    ["Runway", "Pasarela"],
    ["Editorial", "Editorial"],
    ["Campaign", "Campaña"],
    ["Lookbook", "Lookbook"],
    ["E-commerce", "E-commerce"],
    ["Fitness", "Fitness"],
    ["Hospitality", "Hospitalidad"],
    ["Events", "Eventos"],
  ];
  const size = "clamp(1.5rem,2.6vw,2.3rem)";
  const word = (en: string, es: string): BuilderNode => ({
    id: makeId("heading"),
    kind: "heading",
    props: {
      text: en,
      level: 3,
      style: {
        fontFamily: DISPLAY_FONT,
        fontStyle: "italic",
        fontSize: size,
        textColor: "var(--token-color-ink, #ece4d3)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        // Keep each discipline on one line — "E-commerce" was breaking at the
        // hyphen, splitting a word across two rows in the ticker.
        whiteSpace: "nowrap",
      },
    },
    i18n: { es: { text: es } },
  });
  const separator = (): BuilderNode => ({
    id: makeId("paragraph"),
    kind: "paragraph",
    props: {
      text: "/",
      style: {
        fontFamily: DISPLAY_FONT,
        fontSize: size,
        textColor: "var(--token-color-primary, #c6a14e)",
      },
    },
  });
  const run = (): BuilderNode[] =>
    items.flatMap(([en, es]) => [word(en, es), separator()]);
  const trackId = makeId("container");
  const kf = `bn-marquee-${trackId}`;
  const track: BuilderNode = {
    id: trackId,
    kind: "container",
    props: {
      layout: "row",
      style: {
        gap: "44px",
        flexWrap: "nowrap",
        width: "max-content",
        alignItems: "center",
      },
    },
    children: [...run(), ...run()],
  };
  const css = [
    `{ border-top: 1px solid var(--token-color-primary, #c6a14e); border-bottom: 1px solid var(--token-color-primary, #c6a14e); }`,
    `@keyframes ${kf} { from { transform: translateX(0); } to { transform: translateX(-50%); } }`,
    `[data-builder-node-id="${trackId}"] { animation: ${kf} 38s linear infinite; will-change: transform; }`,
    `[data-builder-node-id="${trackId}"]:hover { animation-play-state: paused; }`,
    `@media (prefers-reduced-motion: reduce) { [data-builder-node-id="${trackId}"] { animation: none; transform: none; } }`,
  ].join("\n");
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      htmlTag: "section",
      layout: "row",
      style: {
        backgroundColor: "var(--token-color-background, #100e13)",
        overflow: "hidden",
        paddingTop: "16px",
        paddingBottom: "16px",
        containerType: "inline-size",
        customCss: css,
      },
    },
    children: [track],
  };
}
