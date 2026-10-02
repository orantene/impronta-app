/**
 * Demo placement of library apps (demo CONTENT, not a design default). Pure:
 * takes a demo's home tree and returns a new one. A Maison v2 demo whose trade
 * has an app gets it as its own band right after the Menu section, built from
 * the design's own section kit (eyebrow + heading + intro, token styles only).
 * Deterministic ids, so an identical rerun yields an identical tree.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { styleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";
import { appsForDemo } from "@/lib/site-admin/add-gallery/apps-registry";

export const NAIL_BAND_ID = "demo-app-nail-band";

const COPY = {
  eyebrow: { en: "Try it", es: "Pruébalo" },
  heading: { en: "Design your nails before your visit", es: "Diseña tus uñas antes de tu cita" },
  intro: {
    en: "Pick shape, colour and art, and send your design with your booking.",
    es: "Elige forma, color y arte, y envía tu diseño con tu reserva.",
  },
} as const;

const label = (n: BuilderNode) => (n.props as { layerLabel?: string } | undefined)?.layerLabel;

/** The Nail Designer band: a Maison-style section holding the app node. */
export function nailBand(): BuilderNode {
  const es = (k: keyof typeof COPY) => ({ es: { text: COPY[k].es } });
  // The renderer reads `node.i18n` (the validate-time mirror of `props.i18n`). A tree
  // that reaches the live renderer without a validate pass carries only props.i18n, so
  // the Spanish copy never resolved and the band showed English. Write BOTH.
  return {
    id: NAIL_BAND_ID,
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      align: "start",
      layerLabel: "Nail designer",
      anchorId: "nail-designer",
      style: { maxWidth: "wide", paddingY: "l", paddingX: "m", backgroundColor: styleTokenRef("color.surface-raised") },
      responsive: { mobile: { layout: "stack" } },
    },
    children: [
      {
        id: `${NAIL_BAND_ID}-eyebrow`,
        kind: "paragraph",
        i18n: es("eyebrow"),
        props: {
          text: COPY.eyebrow.en,
          i18n: es("eyebrow"),
          style: { textTransform: "uppercase", letterSpacing: "0.18em", size: "sm", tone: "muted" },
        },
      },
      {
        id: `${NAIL_BAND_ID}-heading`,
        kind: "heading",
        i18n: es("heading"),
        props: {
          text: COPY.heading.en,
          i18n: es("heading"),
          level: 2,
          style: { size: "xl", fontFamily: "token:typography.heading-font-family" },
          layerLabel: "Nail designer heading",
        },
      },
      {
        id: `${NAIL_BAND_ID}-intro`,
        kind: "paragraph",
        i18n: es("intro"),
        props: { text: COPY.intro.en, i18n: es("intro"), style: { size: "lg", maxWidth: "reading" } },
      },
      { id: `${NAIL_BAND_ID}-app`, kind: "app_nail_designer", props: {} },
    ],
  } as BuilderNode;
}

/**
 * Home tree with the demo's trade apps placed. Only Maison v2 demos, only when
 * the trade has the app. Returns the same array when nothing applies.
 */
export function placeDemoApps(
  homeTree: BuilderNode[],
  demo: { design: string; profileCode: string },
): { tree: BuilderNode[]; placed: boolean } {
  if (demo.design !== "maison-v2") return { tree: homeTree, placed: false };
  if (!appsForDemo(demo).some((a) => a.nativeKind === "app_nail_designer")) return { tree: homeTree, placed: false };
  const rest = homeTree.filter((n) => n.id !== NAIL_BAND_ID);
  const at = rest.findIndex((n) => label(n) === "Menu");
  if (at < 0) return { tree: homeTree, placed: false };
  return { tree: [...rest.slice(0, at + 1), nailBand(), ...rest.slice(at + 1)], placed: true };
}
