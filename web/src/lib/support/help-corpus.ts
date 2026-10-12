/**
 * Flattened DRAWER_HELP corpus for support AI retrieval.
 * Server-safe: imports the registry, not the HelpPanel client island.
 */
import { DRAWER_HELP, type HelpEntry } from "@/components/admin/shell/internal/help-registry";
import { SCHEDULING_HELP } from "@/components/admin/shell/internal/help-registry-scheduling";
import { TALENT_HELP } from "@/components/admin/shell/internal/help-registry-talent";

/**
 * What the in-product assistant is allowed to know.
 *
 * DRAWER_HELP is keyed by DRAWER ids, so the scheduling PAGES — events,
 * sessions, reservations — had no entry and the assistant denied they existed.
 * Merged here rather than in help-registry.ts, which sits exactly on its
 * line-count budget.
 */
export const SUPPORT_HELP_REGISTRY: Partial<Record<string, HelpEntry>> = {
  ...DRAWER_HELP,
  ...SCHEDULING_HELP,
  ...TALENT_HELP,
};

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
  // Spanish function words: retrieval is substring-based, so these would
  // otherwise match almost every entry.
  "de",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "uno",
  "en",
  "es",
  "mi",
  "mis",
  "tu",
  "tus",
  "como",
  "que",
  "por",
  "para",
  "con",
  "al",
  "del",
  "se",
  "lo",
  "le",
  "me",
  "soy",
  "hola",
  "gracias",
  "puedo",
  "quiero",
]);

/**
 * The in-app corpus is written in English, so a Spanish word in a question also
 * searches for its English equivalent. The original word is kept for the
 * Spanish guest corpus.
 */
const ES_TO_EN: Record<string, string> = {
  precio: "price",
  precios: "price",
  servicio: "service",
  servicios: "service",
  cambiar: "change",
  cambio: "change",
  foto: "photo",
  fotos: "photo",
  publicar: "publish",
  borrador: "draft",
  reserva: "booking",
  reservas: "booking",
  reservar: "book",
  cotizacion: "quote",
  cotizar: "quote",
  pago: "payment",
  pagos: "payment",
  cobrar: "payment",
  cliente: "client",
  clientes: "client",
  clienta: "client",
  clientas: "client",
  sitio: "site",
  pagina: "page",
  dominio: "domain",
  horario: "hours",
  horarios: "hours",
  mensaje: "message",
  mensajes: "message",
  factura: "invoice",
  cancelar: "cancel",
  perfil: "profile",
  enlace: "link",
  ocultar: "hide",
  minutos: "minutes",
  duracion: "minutes",
  ingles: "english",
};

export function flattenHelpCorpus(
  registry: Partial<Record<string, HelpEntry>> = SUPPORT_HELP_REGISTRY,
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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t))
    .flatMap((t) => (ES_TO_EN[t] ? [t, ES_TO_EN[t]] : [t]));
}

function entryText(entry: HelpCorpusEntry): string {
  const faqBits = entry.faqs.flatMap((f) => [f.q, f.a]);
  return [entry.slug, entry.purpose, ...entry.youCanHere, ...faqBits, entry.category, entry.ticketCategory ?? ""]
    .join(" ")
    .toLowerCase();
}

export function insightRowsToCorpus(
  rows: Array<{
    id: string;
    summary: string;
    root_cause?: string | null;
    product_area?: string | null;
  }>,
): HelpCorpusEntry[] {
  return rows.map((row) => ({
    slug: `insight:${row.id}`,
    purpose: row.summary,
    youCanHere: row.root_cause ? [row.root_cause] : [],
    faqs: [],
    category: "past confirmed resolution",
    ticketCategory: row.product_area ?? null,
  }));
}

export function retrieveHelpEntries(
  question: string,
  opts: {
    originSlug?: string | null;
    category?: string | null;
    extraTexts?: string[];
    corpus?: HelpCorpusEntry[];
    extraCorpus?: HelpCorpusEntry[];
    limit?: number;
  } = {},
): HelpCorpusEntry[] {
  const corpus = [...(opts.corpus ?? CORPUS), ...(opts.extraCorpus ?? [])];
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
