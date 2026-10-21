/**
 * TUL-1415: the front-door chat builds ONE request across roster services from a
 * sentence ("chef for 10 people Saturday and 2 waiters"). Pure, no I/O.
 *
 * REQUEST-ONLY (same privacy rules as the roster dock rows, TUL-1372 / #4171):
 *  - the candidate entries are exactly the `RosterServiceItem`s the tenant-strict reader
 *    returned (every one already passed the public-directory predicate, hidden show-who
 *    entries included); nothing outside that list can ever be matched;
 *  - lines carry the OPAQUE entry id (`roster_<listingId>`, the same id as the public
 *    catalog), never an offering id or a talent id; a hidden entry exposes no name;
 *  - no price, no pay button, no checkout: the output is a message for the workspace
 *    contact form, which a person at the workspace answers.
 *
 * The matcher is deterministic (title words against the sentence) so it costs nothing and
 * cannot invent a service. A model may later PROPOSE lines through
 * `sanitizeModelRosterLines`, which accepts only ids from the same allow-list.
 */
import { CONTACT_PREFILL_MAX_LENGTH } from "./roster-request";
import type { RosterServiceItem } from "./roster-services";

export const ROSTER_REQUEST_MAX_LINES = 6;
export const ROSTER_REQUEST_MAX_QUANTITY = 50;
export const ROSTER_REQUEST_MAX_PARTY = 5000;
export const ROSTER_REQUEST_MAX_SENTENCE = 500;

export type RosterRequestLine = {
  /** Opaque, listing-derived (`roster_<listingId>`). Never an offering or talent id. */
  entryId: string;
  title: string;
  quantity: number;
  /** Only when the entry's show-who is "name". */
  talentName: string | null;
};

export type RosterRequestDraft = {
  lines: RosterRequestLine[];
  /** headcount named once for the whole request, when the sentence has one */
  partySize: number | null;
  /** a day word / ISO date exactly as the guest wrote it (whitelisted words only) */
  when: string | null;
};

export function rosterEntryId(item: Pick<RosterServiceItem, "listingId">): string {
  return `roster_${item.listingId}`;
}

const isEs = (locale: string) => locale.toLowerCase().startsWith("es");

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const STOP = new Set([
  "the", "and", "for", "with", "per", "from", "service", "services", "servicio", "servicios",
  "una", "uno", "los", "las", "del", "por", "con", "para", "que", "pro",
  "de", "la", "el", "en", "un", "of", "to", "in", "at", "by", "on", "or", "an", "us", "my", "se", "es",
]);

/** Crude singular form so "waiters" matches "waiter" and "meseros" matches "mesero". */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

function words(s: string): string[] {
  return (fold(s).match(/[a-z0-9]+/g) ?? []);
}

function titleTokens(title: string): string[] {
  return [...new Set(words(title).filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w)).map(stem))];
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

function numberOf(token: string | undefined): number | null {
  if (!token) return null;
  if (/^\d{1,4}$/.test(token)) return Number(token);
  return NUMBER_WORDS[token] ?? null;
}

const PARTY_RE = /\b(?:for|para)\s+(\d{1,4})\s*(?:people|persons|person|guests|pax|personas|invitados|comensales|gente|adults|adultos)?\b|\b(\d{1,4})\s*(?:people|persons|guests|pax|personas|invitados|comensales|gente)\b/;

const WHEN_WORDS = new Set([
  "today", "tomorrow", "tonight", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "hoy", "manana", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo",
]);

const ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

function extractWhen(folded: string): string | null {
  const iso = folded.match(ISO_DATE_RE);
  if (iso) return iso[1]!;
  for (const w of words(folded)) if (WHEN_WORDS.has(w)) return w;
  return null;
}

function extractParty(folded: string): number | null {
  const m = folded.match(PARTY_RE);
  const n = m ? Number(m[1] ?? m[2]) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= ROSTER_REQUEST_MAX_PARTY ? n : null;
}

const CLAUSE_SPLIT = /\s*(?:,|;|\+|&|\band\b|\by\b|\be\b|\balso\b|\btambien\b)\s*/;

function clampQty(n: number | null): number {
  if (n == null || !Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), ROSTER_REQUEST_MAX_QUANTITY);
}

/**
 * Builds the draft from a free sentence. Each clause ("chef for 10 people saturday",
 * "2 waiters") is matched to the roster entry whose title words overlap it most; a clause
 * that matches nothing is ignored. An entry named twice has its quantities added.
 */
export function buildRosterRequestDraft(sentence: string, items: readonly RosterServiceItem[]): RosterRequestDraft {
  const folded = fold(sentence.slice(0, ROSTER_REQUEST_MAX_SENTENCE));
  const party = extractParty(folded);
  const when = extractWhen(folded);
  const candidates = items.map((item) => ({ item, tokens: titleTokens(item.title) })).filter((c) => c.tokens.length > 0);

  const byId = new Map<string, RosterRequestLine>();
  for (const clause of folded.split(CLAUSE_SPLIT)) {
    const ws = words(clause);
    if (ws.length === 0) continue;
    const stems = ws.map(stem);
    let best: { item: RosterServiceItem; score: number; at: number } | null = null;
    for (const c of candidates) {
      let score = 0;
      let at = -1;
      for (const t of c.tokens) {
        const i = stems.indexOf(t);
        if (i >= 0) {
          score += 1;
          if (at < 0) at = i;
        }
      }
      if (score > 0 && (!best || score > best.score)) best = { item: c.item, score, at };
    }
    if (!best) continue;
    // "2 waiters", "two waiters", "2 x waiters": the number right before the matched word.
    let qty: number | null = null;
    for (let k = best.at - 1; k >= Math.max(0, best.at - 2) && qty == null; k--) {
      const prev = ws[k];
      if (prev === "x") continue;
      qty = numberOf(prev);
      // "for 10 people": that number is a headcount, not a quantity.
      if (qty != null && (ws[k - 1] === "for" || ws[k - 1] === "para")) qty = null;
      break;
    }
    const id = rosterEntryId(best.item);
    const prior = byId.get(id);
    if (prior) {
      prior.quantity = Math.min(prior.quantity + clampQty(qty), ROSTER_REQUEST_MAX_QUANTITY);
    } else if (byId.size < ROSTER_REQUEST_MAX_LINES) {
      byId.set(id, {
        entryId: id,
        title: best.item.title.trim(),
        quantity: clampQty(qty),
        talentName: best.item.talentName?.trim() || null,
      });
    }
  }
  return { lines: [...byId.values()], partySize: party, when };
}

/**
 * Lines a model proposed ({entry_id, quantity}), reduced to the ones that exist in the
 * allow-list. Unknown ids, duplicates and nonsense quantities are dropped; titles and names
 * always come from the allow-list, never from the model.
 */
export function sanitizeModelRosterLines(raw: unknown, items: readonly RosterServiceItem[]): RosterRequestLine[] {
  if (!Array.isArray(raw)) return [];
  const byEntry = new Map(items.map((i) => [rosterEntryId(i), i] as const));
  const out = new Map<string, RosterRequestLine>();
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = typeof o.entry_id === "string" ? o.entry_id.trim() : "";
    const item = byEntry.get(id);
    if (!item || out.has(id)) continue;
    const q = typeof o.quantity === "number" ? o.quantity : 1;
    out.set(id, { entryId: id, title: item.title.trim(), quantity: clampQty(q), talentName: item.talentName?.trim() || null });
    if (out.size >= ROSTER_REQUEST_MAX_LINES) break;
  }
  return [...out.values()];
}

function oneLine(s: string): string {
  // eslint-disable-next-line no-control-regex -- titles are owner text; no control characters in a prefill
  return s.replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * ONE message for the workspace contact form. Fits the contact prefill cap by dropping lines
 * from the end (`truncated` says so). No price, no ids.
 */
export function buildRosterRequestMessage(
  draft: RosterRequestDraft,
  locale: string,
): { message: string; truncated: boolean; lineCount: number } {
  const es = isEs(locale);
  const intro = es ? "Quiero solicitar:" : "I'd like to request:";
  const tail: string[] = [];
  if (draft.partySize) tail.push(es ? `Para ${draft.partySize} personas.` : `For ${draft.partySize} people.`);
  if (draft.when) tail.push(es ? `Cuando: ${draft.when}.` : `When: ${draft.when}.`);
  const render = (n: number) => {
    const rows = draft.lines.slice(0, n).map((l) => {
      const qty = l.quantity > 1 ? `${l.quantity} x ` : "";
      const who = l.talentName ? ` (${es ? "con" : "with"} ${oneLine(l.talentName)})` : "";
      return `- ${qty}${oneLine(l.title)}${who}`;
    });
    return [intro, ...rows, ...tail].join("\n");
  };
  let n = draft.lines.length;
  let message = render(n);
  while (message.length > CONTACT_PREFILL_MAX_LENGTH && n > 1) {
    n -= 1;
    message = render(n);
  }
  if (message.length > CONTACT_PREFILL_MAX_LENGTH) message = message.slice(0, CONTACT_PREFILL_MAX_LENGTH);
  return { message, truncated: n < draft.lines.length, lineCount: n };
}

/** The workspace contact page with the message prefilled. `contactHref` is the host's own path. */
export function rosterChatRequestHref(contactHref: string, message: string): string {
  const qs = new URLSearchParams({ message });
  return `${contactHref}?${qs.toString().replace(/\+/g, "%20")}`;
}
