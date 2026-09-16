/**
 * Type chip — the proposal shown as "Kind of business / kind of work", built
 * from what the person said (`work.industry` / `work.discipline`).
 *
 * Business side: the words catalogue (`lib/words/business-types.ts`), whole
 * phrase first, then each word, longest first. Talent side: the taxonomy v2
 * `talent_type` terms, matched on name (EN/ES), slug, aliases and synonyms.
 * Pure scoring here; the term list is loaded by the server module.
 */

import { searchBusinessTypes, type BusinessType } from "@/lib/words/business-types";

export type TalentTypeTerm = {
  id: string;
  slug: string;
  name: { en: string; es: string };
  aliases: readonly string[];
  synonyms: readonly string[];
};

export type ChipOption = {
  /** Catalogue id (business) or taxonomy term id (talent). */
  id: string;
  slug: string;
  label: { en: string; es: string };
  /** Business only: the preset the workspace starts as. */
  preset?: string;
  family?: string;
};

export type TypeChipProposal = {
  kind: "business" | "talent";
  query: string;
  /** The best match, or null when nothing in the catalogue fits. */
  proposed: ChipOption | null;
  /** Up to four alternatives for the chip row. */
  alternatives: ChipOption[];
};

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

const STOP = new Set(["a", "an", "the", "of", "in", "at", "and", "y", "de", "la", "el", "los", "las", "un", "una", "en", "con", "para", "for", "my", "mi", "our"]);

/** Words of the phrase, longest first, minus stop words. */
export function queryWords(query: string): string[] {
  return Array.from(
    new Set(
      fold(query)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2 && !STOP.has(w)),
    ),
  ).sort((a, b) => b.length - a.length);
}

function businessOption(t: BusinessType): ChipOption {
  return { id: t.id, slug: t.id, label: t.label, preset: t.preset, family: t.family };
}

export function proposeBusinessType(query: string): TypeChipProposal {
  const q = fold(query);
  let hits = q ? searchBusinessTypes(q) : [];
  if (hits.length === 0) {
    for (const w of queryWords(query)) {
      hits = searchBusinessTypes(w);
      if (hits.length) break;
    }
  }
  const [first, ...rest] = hits.map(businessOption);
  return { kind: "business", query, proposed: first ?? null, alternatives: rest.slice(0, 4) };
}

function scoreTerm(term: TalentTypeTerm, q: string, words: string[]): number {
  const en = fold(term.name.en);
  const es = fold(term.name.es);
  const slug = fold(term.slug.replaceAll("-", " "));
  const extras = [...term.aliases, ...term.synonyms].map(fold);
  if (en === q || es === q || slug === q) return 400;
  if (extras.includes(q)) return 300;
  if (en.startsWith(q) || es.startsWith(q) || slug.startsWith(q)) return 200;
  if (en.includes(q) || es.includes(q) || slug.includes(q) || extras.some((x) => x.includes(q))) return 100;
  let score = 0;
  const termWords = [...en.split(" "), ...es.split(" "), ...slug.split(" ")];
  for (const w of words) {
    if (termWords.includes(w)) score += 50;
    else if (extras.some((x) => x.split(" ").includes(w))) score += 30;
    else {
      // "cleaner" ~ "cleaning": a shared five-letter stem counts a little.
      const stem = w.slice(0, 5);
      if (stem.length === 5 && termWords.some((tw) => tw.startsWith(stem))) score += 20;
    }
  }
  return score;
}

export function proposeTalentType(query: string, terms: readonly TalentTypeTerm[]): TypeChipProposal {
  const q = fold(query);
  const words = queryWords(query);
  const scored = terms
    .map((term) => ({ term, score: q ? scoreTerm(term, q, words) : 0 }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.term.slug.localeCompare(b.term.slug));
  const opts = scored.map(({ term }) => ({ id: term.id, slug: term.slug, label: term.name }));
  const [first, ...rest] = opts;
  return { kind: "talent", query, proposed: first ?? null, alternatives: rest.slice(0, 4) };
}
