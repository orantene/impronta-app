/**
 * Placement of library apps on Maison v2 home trees. Pure: takes a home tree
 * and returns a new one. A Maison v2 site whose trade has an app gets it as its
 * own band right after the Menu section, built from the design's own section
 * kit (eyebrow + heading + intro, token styles only). Deterministic ids, so an
 * identical rerun yields an identical tree.
 *
 * Used for demos AND real talents (apply + render fixup) — demos are not the
 * only path that may carry Nail Designer.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { appsForDemo, appsForTrade } from "@/lib/site-admin/add-gallery/apps-registry";
import { professionsForTerm } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { readOrigin } from "@/lib/talent-site/theme-releases/origin";

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

/**
 * Maison section rhythm for the Nail Designer band: full-bleed gutters, 88/48
 * vertical pad, no raised white surface (sits on the page colour like Reviews).
 */
const NAIL_BAND_STYLE = {
  maxWidth: "full",
  paddingX: "l",
  paddingY: "none",
  paddingTop: "88px",
  paddingBottom: "88px",
  responsive: {
    mobile: {
      paddingX: "s",
      paddingLeft: "18px",
      paddingRight: "18px",
      paddingTop: "48px",
      paddingBottom: "48px",
    },
  },
} as const;

/** Drop a stale surface-raised / wide constraint on an already-placed nail band. */
export function normalizeNailBand(node: BuilderNode): BuilderNode {
  if (node.id !== NAIL_BAND_ID || node.kind !== "container") return node;
  const props = (node.props ?? {}) as Record<string, unknown>;
  const prev = (props.style as Record<string, unknown> | undefined) ?? {};
  const { backgroundColor: _bg, paddingY: _py, ...rest } = prev;
  void _bg;
  void _py;
  return {
    ...node,
    props: {
      ...props,
      style: { ...rest, ...NAIL_BAND_STYLE },
      responsive: { mobile: { layout: "stack" } },
    },
  } as unknown as BuilderNode;
}

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
      style: { ...NAIL_BAND_STYLE },
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

function treeHasNailApp(nodes: ReadonlyArray<BuilderNode>): boolean {
  for (const n of nodes) {
    if (n.kind === "app_nail_designer" || label(n) === "Nail designer" || n.id === NAIL_BAND_ID) {
      return true;
    }
    const kids = "children" in n && Array.isArray(n.children) ? n.children : [];
    if (treeHasNailApp(kids)) return true;
  }
  return false;
}

/** True when any node carries a Maison v2 design-origin stamp (or Menu + services_row_cards). */
export function treeLooksMaisonV2(nodes: ReadonlyArray<BuilderNode>): boolean {
  for (const n of nodes) {
    if (readOrigin(n)?.design === "maison-v2") return true;
    const kids = "children" in n && Array.isArray(n.children) ? n.children : [];
    if (treeLooksMaisonV2(kids)) return true;
  }
  return false;
}

/** Insert the Nail Designer band after Menu when the tree does not already have it. */
function placeNailBand(homeTree: BuilderNode[]): { tree: BuilderNode[]; placed: boolean } {
  if (treeHasNailApp(homeTree)) {
    // Heal width / surface on bands already baked into a published tree.
    return { tree: homeTree.map(normalizeNailBand), placed: false };
  }
  const rest = homeTree.filter((n) => n.id !== NAIL_BAND_ID);
  const at = rest.findIndex((n) => label(n) === "Menu");
  if (at < 0) return { tree: homeTree, placed: false };
  return { tree: [...rest.slice(0, at + 1), nailBand(), ...rest.slice(at + 1)], placed: true };
}

/**
 * Home tree with trade apps placed for any Maison v2 site (demo or real).
 * `trades` are gallery profession keys (`nails`, `lashes`, …).
 */
export function placeMaisonTradeApps(
  homeTree: BuilderNode[],
  trades: ReadonlyArray<string>,
  opts?: { designSlug?: string | null },
): { tree: BuilderNode[]; placed: boolean } {
  const designOk =
    opts?.designSlug === "maison-v2" ||
    (!opts?.designSlug && treeLooksMaisonV2(homeTree));
  if (!designOk) return { tree: homeTree, placed: false };
  const wantsNail = trades.some((t) =>
    appsForTrade(t).some((a) => a.nativeKind === "app_nail_designer"),
  );
  if (!wantsNail) return { tree: homeTree, placed: false };
  return placeNailBand(homeTree);
}

/** Resolve gallery profession keys from talent type labels (primary + secondary). */
export function tradesFromTypeLabels(labels: ReadonlyArray<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const label of labels) {
    if (!label?.trim()) continue;
    for (const p of professionsForTerm(label)) out.add(p);
  }
  return [...out];
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
  return placeNailBand(homeTree);
}
