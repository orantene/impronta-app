/**
 * Guide search ranking (QA F-08: searching "horario" found nothing about
 * schedules). Pure: no I/O, no React, safe to unit test.
 *
 * Why it needs synonyms: topic titles and one-sentence summaries are English
 * even when the dashboard is Spanish, so a Spanish word can only match through
 * a bridge. Each synonym group below lists words that mean the same thing for
 * a talent (EN + ES). A query word matches a topic when ANY word of its group
 * (or the word itself) appears in the topic; every query word must match.
 *
 * Accents are folded ("sesión" = "sesion") and a trailing plural "s"/"es" is
 * ignored, so "horarios" finds "horario".
 */

export type GuideSearchTopic = {
  nodeId: string;
  title: string;
  oneSentence: string;
  category: string;
};

/** Words that mean the same thing to a talent. Keep entries folded (no accents). */
export const GUIDE_SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["horario", "hora", "schedule", "hours", "availability", "available", "disponibilidad", "disponible", "agenda", "calendar", "calendario", "week", "semana"],
  ["precio", "tarifa", "price", "rate", "pricing", "cost", "costo"],
  ["pago", "cobro", "payment", "payout", "money", "dinero", "pay"],
  ["sitio", "web", "website", "site", "pagina", "page"],
  ["foto", "imagen", "photo", "image", "picture", "media", "gallery", "galeria"],
  ["cliente", "client", "customer"],
  ["reserva", "cita", "booking", "appointment", "book"],
  ["mensaje", "message", "inbox", "chat"],
  ["servicio", "service", "offering", "oferta"],
  ["idioma", "language", "lenguaje"],
  ["ayuda", "help", "support", "soporte", "ticket"],
];

/** Lowercase, strip accents, split on anything that is not a letter or digit. */
export function guideTokens(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

/** Light plural fold: "horarios" -> "horario", "hours" -> "hour". */
function stem(token: string): string {
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

const GROUP_BY_STEM: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const group of GUIDE_SYNONYM_GROUPS) {
    const stems = group.map(stem);
    for (const s of stems) map.set(s, stems);
  }
  return map;
})();

/** The query word plus its synonyms, as stems. */
export function expandGuideTerm(term: string): string[] {
  const s = stem(term);
  const group = GROUP_BY_STEM.get(s);
  return group ? [...new Set([s, ...group])] : [s];
}

/** Does `stemmed` (a topic token) match `candidate` (a query stem)? Prefix match, so "avail" finds "availability". */
function tokenMatches(topicStem: string, candidate: string): boolean {
  return topicStem === candidate || (candidate.length >= 4 && topicStem.startsWith(candidate));
}

type Field = { stems: string[]; weight: number };

function fieldsFor(topic: GuideSearchTopic): Field[] {
  const idWords = topic.nodeId.replace(/[:._/-]+/g, " ");
  return [
    { stems: guideTokens(topic.title).map(stem), weight: 4 },
    { stems: guideTokens(idWords).map(stem), weight: 3 },
    { stems: guideTokens(topic.category).map(stem), weight: 2 },
    { stems: guideTokens(topic.oneSentence).map(stem), weight: 1.5 },
  ];
}

/** Score of one query word against a topic; 0 means no match. A literal hit beats a synonym hit. */
function termScore(term: string, fields: Field[]): number {
  const own = stem(term);
  const expanded = expandGuideTerm(term);
  let best = 0;
  for (const field of fields) {
    for (const topicStem of field.stems) {
      if (tokenMatches(topicStem, own)) best = Math.max(best, field.weight * 1.5);
      else if (expanded.some((c) => tokenMatches(topicStem, c))) best = Math.max(best, field.weight);
    }
  }
  return best;
}

/**
 * Ranked topics for `query`. Empty array for an empty query. Stable: ties keep
 * the input order.
 */
export function searchGuideTopics<T extends GuideSearchTopic>(topics: readonly T[], query: string, limit = 8): T[] {
  const terms = guideTokens(query);
  if (terms.length === 0) return [];
  const scored: { topic: T; score: number; index: number }[] = [];
  topics.forEach((topic, index) => {
    const fields = fieldsFor(topic);
    let total = 0;
    for (const term of terms) {
      const s = termScore(term, fields);
      if (s === 0) return;
      total += s;
    }
    scored.push({ topic, score: total, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map((r) => r.topic);
}
