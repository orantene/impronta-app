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

export function fold(value: string): string {
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
    // Per word, the one that names the fewest types wins: "food service" is
    // a restaurant (via "food"), not the alphabetically first "… service".
    // A word that IS a type ("spa") beats one that merely appears inside an
    // alias ("casa" in "limpieza de casas"); then the fewer types, the better.
    let best: { hits: BusinessType[]; exact: boolean } | null = null;
    for (const w of queryWords(query)) {
      const h = searchBusinessTypes(w);
      if (!h.length) continue;
      const top = h[0];
      const exact = fold(top.id) === w || fold(top.label.en) === w || fold(top.label.es) === w || top.aliases.some((a) => fold(a) === w);
      if (!best || (exact && !best.exact) || (exact === best.exact && h.length < best.hits.length)) best = { hits: h, exact };
    }
    hits = best?.hits ?? [];
  }
  const [first, ...rest] = hits.map(businessOption);
  return { kind: "business", query, proposed: first ?? null, alternatives: rest.slice(0, 4) };
}

/**
 * How many terms carry each word in their names. A word shared by many terms
 * ("technician": AC, pool, sound, lighting…) says little about the trade; a
 * word held by one or two ("nail") says everything. Without this, "nail
 * technician" tied Nail Artist with AC Technician and lost on the alphabet.
 */
function wordFrequencies(terms: readonly TalentTypeTerm[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const term of terms) {
    const ws = new Set([...fold(term.name.en).split(" "), ...fold(term.name.es).split(" "), ...fold(term.slug.replaceAll("-", " ")).split(" ")]);
    for (const w of ws) if (w) df.set(w, (df.get(w) ?? 0) + 1);
  }
  return df;
}

function wordWeight(w: string, df: Map<string, number>): number {
  const n = df.get(w) ?? 0;
  if (n <= 2) return 50;
  if (n <= 5) return 25;
  return 10;
}

function scoreTerm(term: TalentTypeTerm, q: string, words: string[], head: string | null, first: string | null, df: Map<string, number>): number {
  const en = fold(term.name.en);
  const es = fold(term.name.es);
  const slug = fold(term.slug.replaceAll("-", " "));
  const extras = [...term.aliases, ...term.synonyms].map(fold);
  if (en === q || es === q || slug === q) return 400;
  if (extras.includes(q)) return 300;
  if (en.startsWith(q) || es.startsWith(q) || slug.startsWith(q)) return 200;
  if (en.includes(q) || es.includes(q) || slug.includes(q) || extras.some((x) => x.includes(q))) return 100;
  let score = 0;
  let nameHits = 0;
  const termWords = [...en.split(" "), ...es.split(" "), ...slug.split(" ")];
  for (const w of words) {
    if (termWords.includes(w)) {
      score += wordWeight(w, df);
      nameHits += 1;
    }
    // A synonym hit is a hint, not the trade: "wedding dj" must not make a
    // wedding photographer a DJ.
    else if (extras.some((x) => x.split(" ").includes(w))) score += 15;
    else {
      // "cleaner" ~ "cleaning": a shared five-letter stem counts a little.
      const stem = w.slice(0, 5);
      if (stem.length === 5 && termWords.some((tw) => tw.startsWith(stem))) score += 15;
    }
  }
  if (score === 0) return 0;
  // The last word of the phrase names the trade ("event photographer"): a
  // term whose own name carries it is the right kind of thing.
  // "yoga teacher" → a yoga term, but "teacher" alone must not crown Language
  // Teacher: the bonus needs a qualifier hit beside the head (or a one-word ask).
  if (head && termWords.includes(head) && (nameHits > 1 || words.length === 1)) score += 20;
  // The first word carries the trade in both languages ("yoga and breathwork").
  if (first && termWords.includes(first)) score += 5;
  // Words in the term's name that the person never said make it more specific
  // than what they asked for ("Drone Photographer" for "photographer").
  const unsaid = en.split(" ").filter((tw) => tw.length > 2 && !STOP.has(tw) && !words.includes(tw)).length;
  return Math.max(1, score - 5 * unsaid);
}

/** Non-stop words in the phrase's own order: the first carries the trade, the last (EN) names the kind of thing. */
function orderedWords(query: string): string[] {
  return fold(query).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
}

export function proposeTalentType(query: string, terms: readonly TalentTypeTerm[]): TypeChipProposal {
  const q = fold(query);
  const words = queryWords(query);
  const df = wordFrequencies(terms);
  const ordered = orderedWords(query);
  const head = ordered.length ? ordered[ordered.length - 1] : null;
  const lead = ordered[0] ?? null;
  const scored = terms
    .map((term) => ({ term, score: q ? scoreTerm(term, q, words, head, lead, df) : 0 }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.term.slug.localeCompare(b.term.slug));
  const opts = scored.map(({ term }) => ({ id: term.id, slug: term.slug, label: term.name }));
  const [first, ...rest] = opts;
  return { kind: "talent", query, proposed: first ?? null, alternatives: rest.slice(0, 4) };
}
