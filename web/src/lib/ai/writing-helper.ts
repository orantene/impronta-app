/**
 * The writing helper (Phase 9): write / rewrite / expand / shorten / tone for
 * one text a person owns, from their facts, SEO-aware, never inventing.
 * Pure: prompt building and screening. The model call and the store live in
 * the server action.
 */

export const WRITING_OPS = ["write", "rewrite", "expand", "shorten", "tone"] as const;
export type WritingOp = (typeof WRITING_OPS)[number];
export const WRITING_TONES = ["warm", "professional", "fun"] as const;
export type WritingTone = (typeof WRITING_TONES)[number];

export type WritingFacts = {
  name: string | null;
  /** What they do, in their words ("Manicurista", "House cleaner"). */
  discipline: string | null;
  city: string | null;
  services: string[];
  languages: string[];
};

export type WritingRequest = {
  surface: "bio";
  op: WritingOp;
  tone?: WritingTone | null;
  /** The current text (empty for `write`). */
  text: string;
  locale: "es" | "en";
  facts: WritingFacts;
};

export const BIO_MAX_CHARS = 600;
export const BIO_MIN_CHARS = 30;
/** Per tenant per day. A button must not be able to spend the month's cap. */
export const WRITING_HELPER_DAILY_CAP = 30;

export function buildWritingPrompt(req: WritingRequest): { systemPrompt: string; userMessage: string } {
  const f = req.facts;
  const langName = req.locale === "es" ? "Spanish (Mexico)" : "English";
  const system = [
    `You help a self-employed person write the short bio on their own page. Write in ${langName}, first person, plain words a client would use when searching.`,
    "HARD RULES. Use only the facts given and the person's own text. Never invent services, places, prices, years of experience, numbers of clients, awards, certifications, reviews or quotes. Do not add a phone, email or address.",
    "Search: say what they do and their city naturally in the first sentence (that is what people search), once each; no keyword lists, no slogans.",
    "Style: two to four sentences, no exclamation marks, no em dashes or en dashes (use a comma or a period), no hashtags, no emojis.",
    `Length: between ${BIO_MIN_CHARS} and ${BIO_MAX_CHARS} characters.`,
    "Return only the bio text. No title, no quotes, no explanation.",
  ].join("\n");
  const facts = [
    f.name ? `name: ${f.name}` : null,
    f.discipline ? `what they do: ${f.discipline}` : null,
    f.city ? `city: ${f.city}` : null,
    f.services.length ? `services (names only): ${f.services.slice(0, 12).join("; ")}` : "services: (none stated)",
    f.languages.length ? `languages they speak: ${f.languages.join(", ")}` : null,
  ].filter(Boolean);
  const task =
    req.op === "write"
      ? "TASK: write the bio from the facts."
      : req.op === "rewrite"
        ? "TASK: rewrite the current text with the same facts, fresher wording, same length."
        : req.op === "expand"
          ? "TASK: expand the current text a little, using only the facts; do not pad with generalities."
          : req.op === "shorten"
            ? "TASK: shorten the current text to its two strongest sentences."
            : `TASK: rewrite the current text in a ${req.tone ?? "warm"} tone, same facts, same length.`;
  return {
    systemPrompt: system,
    userMessage: ["FACTS", ...facts, "", req.text.trim() ? `CURRENT TEXT\n${req.text.trim().slice(0, 1200)}` : "CURRENT TEXT\n(none)", "", task].join("\n"),
  };
}

const PRICE_RE = /(\$|€|£|mxn|usd|eur|pesos?)\s?\d|\d+\s?(\$|€|£|mxn|usd|eur|pesos)/i;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/;
const EMAIL_RE = /\S+@\S+\.\S+/;
const YEARS_RE = /\b\d+\s?(años|years?|yrs)\b/i;
const CLAIM_RE = /\b(award|premio|certif|licen|guarantee|garantiz|#1|number one|best in|mejor de)\w*/i;
const DASH_RE = /[—–]/;

/** The same floor the deterministic bio meets; a model draft that fails it is discarded, never shown. */
export function screenWrittenText(raw: string): { ok: true; text: string } | { ok: false; reason: string } {
  const text = raw.replace(/^["“”']+|["“”']+$/g, "").replace(/\s+/g, " ").trim();
  if (text.length < BIO_MIN_CHARS) return { ok: false, reason: "too_short" };
  if (text.length > BIO_MAX_CHARS) return { ok: false, reason: "too_long" };
  if (DASH_RE.test(text)) return { ok: false, reason: "dash" };
  if (PRICE_RE.test(text)) return { ok: false, reason: "price" };
  if (PHONE_RE.test(text)) return { ok: false, reason: "phone" };
  if (EMAIL_RE.test(text)) return { ok: false, reason: "email" };
  if (YEARS_RE.test(text)) return { ok: false, reason: "years" };
  if (CLAIM_RE.test(text)) return { ok: false, reason: "claim" };
  if (/[#]\w|[\u{1F300}-\u{1FAFF}]/u.test(text)) return { ok: false, reason: "hashtag_or_emoji" };
  return { ok: true, text };
}
