/**
 * Nail Designer (app_nail_designer) — the pure model.
 *
 * Option catalogs, the design state and its transitions, and the plain-text
 * summary the CTA hands to the booking / inquiry flow. No React, no IO, so the
 * renderer, the island, the inspector, preflight and the tests share ONE
 * definition of "what can be offered" and "what a design says".
 *
 * Polish swatches are CONTENT: they are the colours of the physical polish a
 * nail artist stocks, not site chrome. Every surface of the app itself (frames,
 * tabs, buttons) is painted from the site's design tokens in the CSS.
 */
import type { BuilderAppNailDesignerNode } from "./types";

type Named = { id: string; en: string; es: string };

export type NailShape = Named & { radius: string; clip: string };
export type NailColor = Named & { hex: string };

export const NAIL_SHAPES: ReadonlyArray<NailShape> = [
  { id: "square", en: "Square", es: "Cuadrada", radius: "10% 10% 46% 46% / 6% 6% 24% 24%", clip: "none" },
  { id: "squoval", en: "Squoval", es: "Cuadrada suave", radius: "30% 30% 46% 46% / 16% 16% 24% 24%", clip: "none" },
  { id: "round", en: "Round", es: "Redonda", radius: "50% 50% 46% 46% / 32% 32% 24% 24%", clip: "none" },
  { id: "almond", en: "Almond", es: "Almendra", radius: "50% 50% 46% 46% / 72% 72% 24% 24%", clip: "none" },
  {
    id: "stiletto",
    en: "Stiletto",
    es: "Stiletto",
    radius: "0 0 46% 46% / 0 0 24% 24%",
    clip: "polygon(50% 0%, 64% 14%, 80% 32%, 94% 52%, 100% 66%, 100% 100%, 0% 100%, 0% 66%, 6% 52%, 20% 32%, 36% 14%)",
  },
  {
    id: "coffin",
    en: "Coffin",
    es: "Bailarina",
    radius: "6% 6% 46% 46% / 4% 4% 24% 24%",
    clip: "polygon(22% 0%, 78% 0%, 100% 64%, 100% 100%, 0% 100%, 0% 64%)",
  },
];

export const NAIL_COLORS: ReadonlyArray<NailColor> = [
  { id: "cherry", en: "Cherry", es: "Cereza", hex: "#B3122E" },
  { id: "rosewood", en: "Rosewood", es: "Palo de rosa", hex: "#8E3B46" },
  { id: "blush", en: "Blush", es: "Rubor", hex: "#E8A9A6" },
  { id: "ballet", en: "Ballet", es: "Ballet", hex: "#F2D4CF" },
  { id: "nude", en: "Nude", es: "Nude", hex: "#D9B39A" },
  { id: "mocha", en: "Mocha", es: "Moca", hex: "#7B5544" },
  { id: "coral", en: "Coral", es: "Coral", hex: "#F2735B" },
  { id: "tangerine", en: "Tangerine", es: "Mandarina", hex: "#F39A3B" },
  { id: "butter", en: "Butter", es: "Mantequilla", hex: "#F4DC8A" },
  { id: "sage", en: "Sage", es: "Salvia", hex: "#A7B99A" },
  { id: "emerald", en: "Emerald", es: "Esmeralda", hex: "#1F6B52" },
  { id: "sky", en: "Sky", es: "Cielo", hex: "#9CC5E3" },
  { id: "cobalt", en: "Cobalt", es: "Cobalto", hex: "#2448A6" },
  { id: "lilac", en: "Lilac", es: "Lila", hex: "#C4A8E0" },
  { id: "plum", en: "Plum", es: "Ciruela", hex: "#5B2A58" },
  { id: "milk", en: "Milk", es: "Leche", hex: "#F7F3EE" },
  { id: "graphite", en: "Graphite", es: "Grafito", hex: "#4A4A4F" },
  { id: "onyx", en: "Onyx", es: "Ónix", hex: "#16151A" },
];

export const NAIL_ARTS: ReadonlyArray<Named> = [
  { id: "solid", en: "Solid", es: "Liso" },
  { id: "french", en: "French tip", es: "Francesa" },
  { id: "ombre", en: "Ombre", es: "Degradado" },
  { id: "dots", en: "Polka", es: "Lunares" },
  { id: "stripes", en: "Stripes", es: "Rayas" },
  { id: "moon", en: "Half-moon", es: "Media luna" },
  { id: "check", en: "Checker", es: "Cuadros" },
  { id: "marble", en: "Marble", es: "Mármol" },
];

export const NAIL_FINISHES: ReadonlyArray<Named> = [
  { id: "gloss", en: "Gloss", es: "Brillo" },
  { id: "matte", en: "Matte", es: "Mate" },
  { id: "chrome", en: "Chrome", es: "Cromado" },
  { id: "glitter", en: "Glitter", es: "Glitter" },
  { id: "pearl", en: "Pearl", es: "Perla" },
];

export const NAIL_CHARMS: ReadonlyArray<Named> = [
  { id: "none", en: "None", es: "Ninguno" },
  { id: "gem", en: "Crystal", es: "Cristal" },
  { id: "star", en: "Star", es: "Estrella" },
  { id: "heart", en: "Heart", es: "Corazón" },
  { id: "flower", en: "Flower", es: "Flor" },
  { id: "pearls", en: "Pearls", es: "Perlas" },
];

export const NAIL_LENGTHS: ReadonlyArray<Named & { k: number }> = [
  { id: "short", en: "Short", es: "Corta", k: 0.9 },
  { id: "medium", en: "Medium", es: "Media", k: 1.2 },
  { id: "long", en: "Long", es: "Larga", k: 1.6 },
];

/** Thumb last, as in the reference board. */
export const NAIL_FINGERS: ReadonlyArray<Named> = [
  { id: "pinky", en: "Pinky", es: "Meñique" },
  { id: "ring", en: "Ring", es: "Anular" },
  { id: "middle", en: "Middle", es: "Medio" },
  { id: "index", en: "Index", es: "Índice" },
  { id: "thumb", en: "Thumb", es: "Pulgar" },
];

/** The option groups the author can switch on and off. */
export type NailOptionGroup = "shapes" | "colors" | "arts" | "finishes" | "charms";
export const NAIL_OPTION_GROUPS: ReadonlyArray<NailOptionGroup> = [
  "shapes",
  "colors",
  "arts",
  "finishes",
  "charms",
];

export const NAIL_DESIGNER_CATALOG_IDS: Record<NailOptionGroup, ReadonlyArray<string>> = {
  shapes: NAIL_SHAPES.map((x) => x.id),
  colors: NAIL_COLORS.map((x) => x.id),
  arts: NAIL_ARTS.map((x) => x.id),
  finishes: NAIL_FINISHES.map((x) => x.id),
  charms: NAIL_CHARMS.filter((x) => x.id !== "none").map((x) => x.id),
};

export type NailDesignerProps = BuilderAppNailDesignerNode["props"];

/** Default props for a freshly inserted block: everything offered, booking on. */
export const NAIL_DESIGNER_DEFAULT_PROPS: NailDesignerProps = {
  title: "Design your nails",
  intro: "Pick a shape, colours and finish, then send the design with your booking.",
  shapes: [...NAIL_DESIGNER_CATALOG_IDS.shapes],
  colors: [...NAIL_DESIGNER_CATALOG_IDS.colors],
  arts: [...NAIL_DESIGNER_CATALOG_IDS.arts],
  finishes: [...NAIL_DESIGNER_CATALOG_IDS.finishes],
  charms: [...NAIL_DESIGNER_CATALOG_IDS.charms],
  ctaLabel: "Send my design",
  sendWithBooking: true,
};

export function cloneNailDesignerDefaultProps(): NailDesignerProps {
  return {
    ...NAIL_DESIGNER_DEFAULT_PROPS,
    shapes: [...(NAIL_DESIGNER_DEFAULT_PROPS.shapes ?? [])],
    colors: [...(NAIL_DESIGNER_DEFAULT_PROPS.colors ?? [])],
    arts: [...(NAIL_DESIGNER_DEFAULT_PROPS.arts ?? [])],
    finishes: [...(NAIL_DESIGNER_DEFAULT_PROPS.finishes ?? [])],
    charms: [...(NAIL_DESIGNER_DEFAULT_PROPS.charms ?? [])],
  };
}

export type NailOffered = {
  shapes: ReadonlyArray<NailShape>;
  colors: ReadonlyArray<NailColor>;
  arts: ReadonlyArray<Named>;
  finishes: ReadonlyArray<Named>;
  /** Includes the leading "none" entry whenever any charm is offered. */
  charms: ReadonlyArray<Named>;
};

function pick<T extends { id: string }>(all: ReadonlyArray<T>, ids: ReadonlyArray<string> | undefined): T[] {
  // An absent list means "all"; an empty list means the author switched the group off.
  if (!ids) return [...all];
  const want = new Set(ids);
  return all.filter((x) => want.has(x.id));
}

/** The options a visitor can use, in catalog order. Unknown ids are ignored. */
export function resolveNailOffered(props: NailDesignerProps): NailOffered {
  const charms = pick(
    NAIL_CHARMS.filter((x) => x.id !== "none"),
    props.charms,
  );
  return {
    shapes: pick(NAIL_SHAPES, props.shapes),
    colors: pick(NAIL_COLORS, props.colors),
    arts: pick(NAIL_ARTS, props.arts),
    finishes: pick(NAIL_FINISHES, props.finishes),
    charms: charms.length ? [NAIL_CHARMS[0], ...charms] : [],
  };
}

/** Count of offered choices across all groups (charms exclude "none"). */
export function nailOfferedCount(offered: NailOffered): number {
  return (
    offered.shapes.length +
    offered.colors.length +
    offered.arts.length +
    offered.finishes.length +
    Math.max(0, offered.charms.length - 1)
  );
}

export type NailState = { c1: string; c2: string; art: string; finish: string; charm: string };
export type NailDesign = { nails: NailState[]; shape: string; length: string };

function firstOf<T extends { id: string }>(list: ReadonlyArray<T>, prefer: string, fallback: string): string {
  if (list.some((x) => x.id === prefer)) return prefer;
  return list[0]?.id ?? fallback;
}

/** The starter look, clamped to what the author offers. */
export function initialNailDesign(offered: NailOffered): NailDesign {
  const colors = offered.colors.length ? offered.colors : NAIL_COLORS;
  const c1 = firstOf(colors, "blush", "blush");
  const c2 = colors.find((c) => c.id === "milk" && c.id !== c1)?.id ?? colors.find((c) => c.id !== c1)?.id ?? c1;
  const base: NailState = {
    c1,
    c2,
    art: firstOf(offered.arts, "french", "solid"),
    finish: firstOf(offered.finishes, "gloss", "gloss"),
    charm: "none",
  };
  return {
    nails: NAIL_FINGERS.map(() => ({ ...base })),
    shape: firstOf(offered.shapes, "almond", "almond"),
    length: "medium",
  };
}

/** Apply a patch to every nail (target null), or to the one selected index. */
export function patchNails(design: NailDesign, target: number | null, patch: Partial<NailState>): NailDesign {
  return {
    ...design,
    nails: design.nails.map((n, i) => (target === null || i === target ? { ...n, ...patch } : n)),
  };
}

/** A random look drawn only from what is offered. `rand` is injectable for tests. */
export function surpriseNailDesign(offered: NailOffered, rand: () => number = Math.random): NailDesign {
  const r = <T,>(list: ReadonlyArray<T>, fallback: T): T =>
    list.length ? list[Math.min(list.length - 1, Math.floor(rand() * list.length))] : fallback;
  const base = initialNailDesign(offered);
  const c1 = r(offered.colors, NAIL_COLORS[0]).id;
  let c2 = r(offered.colors, NAIL_COLORS[0]).id;
  if (c2 === c1 && offered.colors.length > 1) c2 = offered.colors.find((c) => c.id !== c1)!.id;
  const finish = r(offered.finishes, NAIL_FINISHES[0]).id;
  const charmChoices = offered.charms.filter((c) => c.id !== "none");
  const plain: NailState = { c1, c2, art: r(offered.arts, NAIL_ARTS[0]).id, finish, charm: "none" };
  const accent: NailState = {
    c1: c2,
    c2: c1,
    art: r(offered.arts, NAIL_ARTS[0]).id,
    finish,
    charm: charmChoices.length ? r(charmChoices, NAIL_CHARMS[1]).id : "none",
  };
  return {
    shape: r(offered.shapes, NAIL_SHAPES[3]).id,
    length: base.length,
    nails: NAIL_FINGERS.map((_, i) => ({ ...(i === 1 ? accent : plain) })),
  };
}

const LENGTH_FACTOR = new Map(NAIL_LENGTHS.map((l) => [l.id, l.k] as const));
export function nailLengthFactor(id: string): number {
  return LENGTH_FACTOR.get(id) ?? 1.2;
}

export function nailLabel(list: ReadonlyArray<Named>, id: string, es: boolean): string {
  const hit = list.find((x) => x.id === id);
  return hit ? (es ? hit.es : hit.en) : id;
}

export const NAIL_SUMMARY_MAX = 480;

function describeNail(n: NailState, es: boolean): string {
  const art = nailLabel(NAIL_ARTS, n.art, es).toLowerCase();
  const c1 = nailLabel(NAIL_COLORS, n.c1, es).toLowerCase();
  const c2 = nailLabel(NAIL_COLORS, n.c2, es).toLowerCase();
  const finish = nailLabel(NAIL_FINISHES, n.finish, es).toLowerCase();
  const accent = n.art === "solid" ? "" : es ? ` con acento ${c2}` : ` with ${c2} accent`;
  const charm = n.charm === "none" ? "" : `, ${nailLabel(NAIL_CHARMS, n.charm, es).toLowerCase()}`;
  return es
    ? `${art}, ${c1}${accent}, acabado ${finish}${charm}`
    : `${art}, ${c1}${accent}, ${finish} finish${charm}`;
}

/**
 * The short text the visitor's booking / inquiry message starts from. Plain
 * words only (no ids), capped, no em dashes: it lands in a message box the
 * visitor can still edit before anything is sent.
 */
export function nailDesignSummary(design: NailDesign, locale: string): string {
  const es = locale.toLowerCase().startsWith("es");
  const shape = nailLabel(NAIL_SHAPES, design.shape, es).toLowerCase();
  const length = nailLabel(NAIL_LENGTHS, design.length, es).toLowerCase();
  const head = es
    ? `Mi diseño de uñas: forma ${shape}, largo ${length}.`
    : `My nail design: ${shape} shape, ${length} length.`;
  const lines: string[] = [];
  const first = design.nails[0];
  const same = design.nails.every((n) => JSON.stringify(n) === JSON.stringify(first));
  if (same) {
    lines.push(`${es ? "Todas las uñas" : "All nails"}: ${describeNail(first, es)}.`);
  } else {
    design.nails.forEach((n, i) => {
      const f = NAIL_FINGERS[i];
      lines.push(`${es ? f.es : f.en}: ${describeNail(n, es)}.`);
    });
  }
  return [head, ...lines].join(" ").slice(0, NAIL_SUMMARY_MAX);
}
