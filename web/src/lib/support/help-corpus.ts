/**
 * Flattened DRAWER_HELP corpus for support AI retrieval.
 * Server-safe: imports the registry, not the HelpPanel client island.
 */
import { DRAWER_HELP, type HelpEntry } from "@/components/admin/shell/internal/help-registry";

export type HelpCorpusEntry = {
  slug: string;
  purpose: string;
  youCanHere: string[];
  faqs: { q: string; a: string }[];
  category: string;
  ticketCategory: string | null;
};

const STOP = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "and",
  "or",
  "in",
  "on",
  "for",
  "is",
  "it",
  "this",
  "that",
  "you",
  "we",
  "can",
  "how",
  "do",
  "i",
  "my",
  "me",
  "your",
  "with",
  "from",
  "what",
  "when",
  "where",
  "why",
  "are",
  "be",
  "not",
  "if",
]);

export function flattenHelpCorpus(
  registry: Partial<Record<string, HelpEntry>> = DRAWER_HELP,
): HelpCorpusEntry[] {
  const out: HelpCorpusEntry[] = [];
  for (const [slug, entry] of Object.entries(registry)) {
    if (!entry) continue;
    out.push({
      slug,
      purpose: entry.purpose,
      youCanHere: entry.youCanHere,
      faqs: entry.faqs ?? [],
      category: entry.category,
      ticketCategory: entry.ticketCategory ?? null,
    });
  }
  return out;
}

const CORPUS = flattenHelpCorpus();

export const SUPPORT_CATEGORIES: string[] = [
  ...new Set(
    CORPUS.map((e) => e.ticketCategory).filter((c): c is string => Boolean(c)),
  ),
].sort((a, b) => a.localeCompare(b));

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

function entryText(entry: HelpCorpusEntry): string {
  const faqBits = entry.faqs.flatMap((f) => [f.q, f.a]);
  return [entry.slug, entry.purpose, ...entry.youCanHere, ...faqBits, entry.category, entry.ticketCategory ?? ""]
    .join(" ")
    .toLowerCase();
}

export function retrieveHelpEntries(
  question: string,
  opts: {
    originSlug?: string | null;
    category?: string | null;
    extraTexts?: string[];
    corpus?: HelpCorpusEntry[];
    limit?: number;
  } = {},
): HelpCorpusEntry[] {
  const corpus = opts.corpus ?? CORPUS;
  const limit = opts.limit ?? 4;
  const qTokens = tokenize([question, ...(opts.extraTexts ?? [])].join(" "));
  const qSet = new Set(qTokens);

  const scored = corpus.map((entry) => {
    const hay = entryText(entry);
    let score = 0;
    for (const tok of qSet) {
      if (hay.includes(tok)) score += 1;
    }
    if (opts.originSlug && entry.slug === opts.originSlug) score += 8;
    if (
      opts.category &&
      entry.ticketCategory &&
      entry.ticketCategory.toLowerCase() === opts.category.toLowerCase()
    ) {
      score += 4;
    }
    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score || a.entry.slug.localeCompare(b.entry.slug));
  const picked = scored.filter((s) => s.score > 0).slice(0, limit);
  if (picked.length > 0) return picked.map((s) => s.entry);

  const fallback: HelpCorpusEntry[] = [];
  if (opts.originSlug) {
    const origin = corpus.find((e) => e.slug === opts.originSlug);
    if (origin) fallback.push(origin);
  }
  if (opts.category) {
    for (const e of corpus) {
      if (e.ticketCategory?.toLowerCase() === opts.category.toLowerCase() && !fallback.includes(e)) {
        fallback.push(e);
      }
      if (fallback.length >= limit) break;
    }
  }
  return fallback.slice(0, limit);
}
