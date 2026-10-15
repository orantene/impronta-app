/**
 * TUL-802: the signup category picker's search, pure and unit-tested.
 * Ranks by intent, not substring: exact name or synonym, then prefix, then a
 * whole word, then a stem (casa ~ casas), and a bare substring last. Accent
 * and case insensitive. A code-side overlay adds the household-cleaning
 * intent ("limpieza", "aseo", "casa", "housekeeping") to the existing
 * `cleaner` term, so no DB change is needed.
 */

import { fold, type ChipOption, type TalentTypeTerm } from "./type-chip";

/** Extra search intent per taxonomy slug (and, optionally, the label to show). */
const OVERLAY: Record<string, { label?: { en: string; es: string }; synonyms: readonly string[] }> = {
  cleaner: {
    label: { en: "House cleaning", es: "Limpieza de casas" },
    synonyms: ["limpieza", "limpieza del hogar", "limpieza de casas", "limpieza de hogar", "aseo", "limpiadora", "limpiador", "casa", "casas", "hogar", "housekeeping", "house cleaning", "home cleaning", "cleaning", "maid"],
  },
  "house-cleaner": {
    label: { en: "House cleaning", es: "Limpieza de casas" },
    synonyms: ["limpieza", "limpieza del hogar", "aseo", "limpiadora", "casa", "casas", "hogar", "housekeeping", "maid"],
  },
  housekeeper: { synonyms: ["limpieza", "aseo", "hogar", "housekeeping"] },
  "villa-cleaner": { synonyms: ["limpieza", "aseo", "casa", "housekeeping"] },
  "deep-cleaning-specialist": { synonyms: ["limpieza", "aseo", "casa"] },
};

function withOverlay(term: TalentTypeTerm): TalentTypeTerm {
  const o = OVERLAY[term.slug];
  if (!o) return term;
  return { ...term, name: o.label ?? term.name, synonyms: [...term.synonyms, ...o.synonyms] };
}

const words = (s: string): string[] => s.split(/[^a-z0-9]+/).filter(Boolean);
const stem = (w: string): string => (w.length > 3 ? w.replace(/(es|s)$/, "") : w);

function scoreOne(term: TalentTypeTerm, q: string): number {
  const names = [term.name.en, term.name.es, term.slug.replaceAll("-", " ")].map(fold);
  const extras = [...term.aliases, ...term.synonyms].map(fold);
  const qw = words(q);
  const qs = qw.map(stem);
  let best = 0;
  const bump = (n: number) => { if (n > best) best = n; };
  if (names.includes(q)) bump(1000);
  if (extras.includes(q)) bump(900);
  if (names.some((n) => n.startsWith(q))) bump(800);
  if (extras.some((x) => x.startsWith(q))) bump(700);
  if (qw.length > 0) {
    if (names.some((n) => qw.every((w) => words(n).includes(w)))) bump(500);
    if (extras.some((x) => qw.every((w) => words(x).includes(w)))) bump(400);
    if (names.some((n) => qs.every((w) => words(n).map(stem).includes(w)))) bump(300);
    if (extras.some((x) => qs.every((w) => words(x).map(stem).includes(w)))) bump(250);
  }
  if (names.some((n) => n.includes(q))) bump(200);
  if (extras.some((x) => x.includes(q))) bump(100);
  return best;
}

/** Ranked options for the query (empty query: the default list, alphabetical by label). */
export function rankTalentTypeOptions(terms: readonly TalentTypeTerm[], query: string, locale: "en" | "es"): ChipOption[] {
  const q = fold(query);
  const all = terms.map(withOverlay);
  const scored = all
    // The overlay's headline term wins ties against its sibling cleaning trades.
    .map((t) => ({ t, score: q ? scoreOne(t, q) + (OVERLAY[t.slug]?.label ? 5 : 0) : 1 }))
    .filter((x) => (q ? scoreOne(x.t, q) > 0 : true))
    .sort((a, b) => b.score - a.score || (a.t.name[locale] || a.t.name.en).localeCompare(b.t.name[locale] || b.t.name.en, locale));
  return scored.map(({ t }) => ({ id: t.id, slug: t.slug, label: t.name }));
}

/** The "use what I typed" option: always offered when there is text. */
export function typedCategoryOption(text: string): ChipOption | null {
  const label = text.trim();
  if (!label) return null;
  return { id: "", slug: "", label: { en: label, es: label } };
}
