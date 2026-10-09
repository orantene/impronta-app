/**
 * TUL-209 (b): the English the block overlays may use. Pure data plus two small
 * builders; no database, no writes.
 *
 * Rule: English comes from a source that already exists in the repo, never from
 * a new translation of a demo's own claims.
 *   1. The platform's seed dictionary (`SEED_TEXT_ES`, English seed -> Spanish),
 *      read backwards. A Spanish text with two different English seeds is
 *      ambiguous and dropped.
 *   2. The platform's own generic headings (below), each with its source.
 *   3. A demo's own typed English (`hero.factsI18n.en` of its Gridline fixture),
 *      matched cell by cell to the Spanish cells.
 * Anything else is NOT translated here; the planner reports it as "needs English".
 */
import { SEED_TEXT_ES } from "../../src/lib/talent-site/theme-catalog/seed-i18n";
import { GRIDLINE_DEMO_FIXTURES } from "../../src/lib/talent-site/demos/gridline-demo-fixtures";

export interface GlossEntry { en: string; source: string }
/** Normalised Spanish -> English. */
export type Gloss = ReadonlyMap<string, GlossEntry>;

/** Trimmed, whitespace-collapsed, case and accent insensitive. */
export const norm = (s: unknown): string =>
  typeof s === "string" ? s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase() : "";

/** Generic headings and labels of the platform's own demo designs (platform-owned copy, short and literal). */
export const GENERIC_HEADINGS: ReadonlyArray<{ es: string; en: string; source: string }> = [
  { es: "Tu visita", en: "Your visit", source: "maison-v2 content.json location.eyebrow" },
  { es: "Dónde encontrarme", en: "Where to find me", source: "section-kit-location default heading" },
  { es: "Lo que dicen", en: "What they say", source: "maison-v2 content.json reviews.title" },
  { es: "Zona aproximada", en: "Approximate area", source: "maison-v2 content.json location.sub" },
  { es: "Aproximada", en: "Approximate", source: "gridline content.json location.sub" },
  { es: "Zona", en: "Area", source: "gridline content.json location.title" },
  { es: "Especificaciones", en: "Specifications", source: "gridline content.json specTable.title" },
  { es: "Cómo trabajo", en: "How I work", source: "gridline content.json specTable.subtitle" },
  { es: "Medidas", en: "Measures", source: "folio content.json statsTitle (first word)" },
  { es: "Voltaje", en: "Voltage", source: "gridline content.json specTable row label" },
  { es: "Materiales", en: "Materials", source: "gridline content.json specTable row label" },
];

/** The seed dictionary read backwards: Spanish -> English, ambiguous Spanish dropped. */
export function seedGloss(): Map<string, GlossEntry> {
  const out = new Map<string, GlossEntry>();
  const ambiguous = new Set<string>();
  for (const [en, es] of Object.entries(SEED_TEXT_ES)) {
    const k = norm(es);
    const prev = out.get(k);
    if (prev && norm(prev.en) !== norm(en)) ambiguous.add(k);
    else out.set(k, { en, source: "seed-i18n SEED_TEXT_ES (reversed)" });
  }
  for (const k of ambiguous) out.delete(k);
  return out;
}

/** Platform-wide glossary: headings first (they win), then the reversed seed dictionary. */
export function genericGloss(): Gloss {
  const out = seedGloss();
  for (const h of GENERIC_HEADINGS) out.set(norm(h.es), { en: h.en, source: h.source });
  return out;
}

/** A demo's own typed English, cell by cell: Gridline `hero.facts` (Spanish) against `hero.factsI18n.en`. */
export function profileGloss(profileCode: string): Gloss {
  const out = new Map<string, GlossEntry>();
  const f = GRIDLINE_DEMO_FIXTURES[profileCode];
  const en = f?.hero.factsI18n?.en;
  if (!f || f.locale !== "es" || !en) return out;
  const source = `gridline fixture ${profileCode} hero.factsI18n.en`;
  (f.hero.facts ?? []).forEach((cell, i) => {
    const e = en[i];
    if (!e) return;
    if (norm(cell.label) && norm(cell.label) !== norm(e.label)) out.set(norm(cell.label), { en: e.label, source });
    if (norm(cell.value) && norm(cell.value) !== norm(e.value)) out.set(norm(cell.value), { en: e.value, source });
  });
  return out;
}

/** Profile glossary first, then the generic one. */
export function glossFor(profileCode: string): Gloss {
  const merged = new Map<string, GlossEntry>(genericGloss());
  for (const [k, v] of profileGloss(profileCode)) merged.set(k, v);
  return merged;
}
