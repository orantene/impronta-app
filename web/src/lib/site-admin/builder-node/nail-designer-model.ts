/**
 * Nail Designer (app_nail_designer): the pure model, ported from the owner's
 * Nail Studio design (design-references/apps/nail-designer). Catalogs, the
 * starter and saved looks, the state transitions, and the plain-text summary
 * the "Send my design" button hands to the booking / inquiry flow.
 *
 * Zero config: the block always offers the full design. Polish swatches and
 * skin tones are CONTENT (the colours of physical polish), kept as data.
 */
import type { BuilderAppNailDesignerNode } from "./types";

export type Named = { id: string; en: string; es: string };
export type NailShape = Named & { radius: string; clip: string };
export type NailColor = { en: string; es: string; hex: string };

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
  { en: "Cherry", es: "Cereza", hex: "#B3122E" },
  { en: "Rosewood", es: "Palo de rosa", hex: "#8E3B46" },
  { en: "Blush", es: "Rubor", hex: "#E8A9A6" },
  { en: "Ballet", es: "Ballet", hex: "#F2D4CF" },
  { en: "Nude", es: "Nude", hex: "#D9B39A" },
  { en: "Mocha", es: "Moca", hex: "#7B5544" },
  { en: "Coral", es: "Coral", hex: "#F2735B" },
  { en: "Tangerine", es: "Mandarina", hex: "#F39A3B" },
  { en: "Butter", es: "Mantequilla", hex: "#F4DC8A" },
  { en: "Sage", es: "Salvia", hex: "#A7B99A" },
  { en: "Emerald", es: "Esmeralda", hex: "#1F6B52" },
  { en: "Sky", es: "Cielo", hex: "#9CC5E3" },
  { en: "Cobalt", es: "Cobalto", hex: "#2448A6" },
  { en: "Lilac", es: "Lila", hex: "#C4A8E0" },
  { en: "Plum", es: "Ciruela", hex: "#5B2A58" },
  { en: "Milk", es: "Leche", hex: "#F7F3EE" },
  { en: "Graphite", es: "Grafito", hex: "#4A4A4F" },
  { en: "Onyx", es: "Ónix", hex: "#16151A" },
];

export const NAIL_PATTERNS: ReadonlyArray<Named> = [
  { id: "solid", en: "Solid", es: "Liso" },
  { id: "french", en: "French tip", es: "Francesa" },
  { id: "ombre", en: "Ombré", es: "Degradado" },
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

export const NAIL_STICKERS: ReadonlyArray<Named> = [
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

export const NAIL_SKINS: ReadonlyArray<{ en: string; es: string; hex: string }> = [
  { en: "Porcelain", es: "Porcelana", hex: "#F4D9C6" },
  { en: "Light", es: "Claro", hex: "#E9BE9E" },
  { en: "Tan", es: "Bronceado", hex: "#CF9670" },
  { en: "Olive", es: "Oliva", hex: "#B07A52" },
  { en: "Brown", es: "Moreno", hex: "#7E5236" },
  { en: "Deep", es: "Profundo", hex: "#4F3222" },
];

/** Geometry per finger (design px at scale 1), thumb last. */
export const NAIL_FINGERS: ReadonlyArray<Named & { w: number; h: number; rot: number; tx: number; ty: number }> = [
  { id: "pinky", en: "Pinky", es: "Meñique", w: 64, h: 270, rot: -7, tx: 0, ty: 0 },
  { id: "ring", en: "Ring", es: "Anular", w: 74, h: 340, rot: -2, tx: 0, ty: 0 },
  { id: "middle", en: "Middle", es: "Medio", w: 78, h: 370, rot: 0, tx: 0, ty: 0 },
  { id: "index", en: "Index", es: "Índice", w: 76, h: 340, rot: 4, tx: 0, ty: 0 },
  { id: "thumb", en: "Thumb", es: "Pulgar", w: 92, h: 240, rot: 30, tx: 18, ty: 56 },
];

export type NailDesignerProps = BuilderAppNailDesignerNode["props"];

/** Zero config: a fresh block carries no props at all. */
export function cloneNailDesignerDefaultProps(): NailDesignerProps {
  return {};
}

export type NailState = { c1: string; c2: string; pattern: string; finish: string; sticker: string };
export type NailDesign = { nails: NailState[]; shape: string; length: string; skin: string };
export type NailLook = { name: string; nameEs: string; shape: string; length: string; nails: NailState[] };

export function nail(c1: string, c2: string, pattern: string, finish: string, sticker = "none"): NailState {
  return { c1, c2, pattern, finish, sticker };
}
const cloneNails = (list: ReadonlyArray<NailState>): NailState[] => list.map((n) => ({ ...n }));

export const NAIL_START: ReadonlyArray<NailState> = [
  nail("#E8A9A6", "#F7F3EE", "french", "gloss"),
  nail("#8E3B46", "#F7F3EE", "solid", "gloss", "gem"),
  nail("#E8A9A6", "#F7F3EE", "french", "gloss"),
  nail("#E8A9A6", "#F7F3EE", "french", "gloss"),
  nail("#E8A9A6", "#F7F3EE", "french", "gloss"),
];

export const NAIL_STARTER_LOOKS: ReadonlyArray<NailLook> = [
  { name: "Rosé French", nameEs: "Francesa rosé", shape: "almond", length: "medium", nails: [...NAIL_START] },
  {
    name: "Midnight Chrome",
    nameEs: "Cromo medianoche",
    shape: "coffin",
    length: "long",
    nails: [
      nail("#2448A6", "#16151A", "solid", "chrome"),
      nail("#16151A", "#2448A6", "solid", "glitter", "star"),
      nail("#2448A6", "#16151A", "solid", "chrome"),
      nail("#2448A6", "#16151A", "solid", "chrome"),
      nail("#2448A6", "#16151A", "solid", "chrome"),
    ],
  },
  {
    name: "Garden Party",
    nameEs: "Fiesta en el jardín",
    shape: "round",
    length: "short",
    nails: [
      nail("#A7B99A", "#F7F3EE", "dots", "gloss"),
      nail("#F4DC8A", "#F7F3EE", "solid", "gloss", "flower"),
      nail("#A7B99A", "#F7F3EE", "dots", "gloss"),
      nail("#A7B99A", "#F7F3EE", "dots", "gloss"),
      nail("#A7B99A", "#F7F3EE", "dots", "gloss"),
    ],
  },
];

export const NAIL_DEFAULT_SKIN = "#E9BE9E";
export const NAIL_HISTORY_MAX = 40;
export const NAIL_LOOKS_MAX = 12;

export function starterNailDesign(): NailDesign {
  return { nails: cloneNails(NAIL_START), shape: "almond", length: "medium", skin: NAIL_DEFAULT_SKIN };
}
export { cloneNails };

/** Apply a patch to every nail (target null) or to one selected index. */
export function patchNails(
  nails: ReadonlyArray<NailState>,
  target: number | null,
  patch: Partial<NailState>,
): NailState[] {
  return nails.map((n, i) => (target === null || i === target ? { ...n, ...patch } : n));
}

/** "Surprise me": ported from the reference; `rand` is injectable for tests. */
export function surpriseNailDesign(rand: () => number = Math.random): { nails: NailState[]; shape: string } {
  const r = <T,>(a: ReadonlyArray<T>): T => a[Math.floor(rand() * a.length)];
  const c1 = r(NAIL_COLORS).hex;
  let c2 = r(NAIL_COLORS).hex;
  if (c2 === c1) c2 = c1 === "#F7F3EE" ? "#16151A" : "#F7F3EE";
  const pat = r(NAIL_PATTERNS).id;
  const fin = r(NAIL_FINISHES).id;
  const acc = r(NAIL_PATTERNS).id;
  const st = r(NAIL_STICKERS.slice(1)).id;
  const nails = [0, 1, 2, 3, 4].map((i) => (i === 1 ? nail(c2, c1, acc, fin, st) : nail(c1, c2, pat, fin, "none")));
  return { nails, shape: r(NAIL_SHAPES).id };
}

const LENGTH_FACTOR = new Map(NAIL_LENGTHS.map((l) => [l.id, l.k] as const));
export function nailLengthFactor(id: string): number {
  return LENGTH_FACTOR.get(id) ?? 1.2;
}

export function nailLabel(list: ReadonlyArray<{ id: string; en: string; es: string }>, id: string, es: boolean): string {
  const hit = list.find((x) => x.id === id);
  return hit ? (es ? hit.es : hit.en) : id;
}

/** Polish name for a hex, or "Custom #HEX" for a mixed colour. */
export function nailColorName(hex: string, es: boolean): string {
  const up = String(hex).toUpperCase();
  const c = NAIL_COLORS.find((x) => x.hex === up);
  return c ? (es ? c.es : c.en) : `${es ? "Personalizado" : "Custom"} ${up}`;
}

export const NAIL_SUMMARY_MAX = 480;

function describeNail(n: NailState, es: boolean): string {
  const art = nailLabel(NAIL_PATTERNS, n.pattern, es).toLowerCase();
  const c1 = nailColorName(n.c1, es).toLowerCase();
  const c2 = nailColorName(n.c2, es).toLowerCase();
  const finish = nailLabel(NAIL_FINISHES, n.finish, es).toLowerCase();
  const accent = n.pattern === "solid" ? "" : es ? ` con acento ${c2}` : ` with ${c2} accent`;
  const charm = n.sticker === "none" ? "" : `, ${nailLabel(NAIL_STICKERS, n.sticker, es).toLowerCase()}`;
  return es ? `${art}, ${c1}${accent}, acabado ${finish}${charm}` : `${art}, ${c1}${accent}, ${finish} finish${charm}`;
}

/**
 * The short text the visitor's booking / inquiry message starts from. Plain
 * words only (no ids), capped, no em dashes: it lands in a message box the
 * visitor can still edit before anything is sent.
 */
export function nailDesignSummary(
  design: Pick<NailDesign, "nails" | "shape" | "length">,
  locale: string,
): string {
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
