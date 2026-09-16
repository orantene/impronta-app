/**
 * copy-pass.ts — the ONE model call in a compose: rewrite a Look's copy slots
 * in the business's own register, from facts only. PURE: the model call is
 * injected, so this module is unit-testable with a stubbed reply.
 *
 * Contract (docs/plans/templates/01-plan.md §4, ai-composer-brief-contract §2):
 *  - the model writes copy for the KEYS it is given; it never lays out;
 *  - it may not invent a fact: no prices, hours, addresses, phone numbers,
 *    years, awards, credentials, reviews, staff names, or a business name
 *    other than the one given. `screenCopy` enforces the machine-checkable
 *    part after the fact and DROPS any value that fails, key by key, so one
 *    bad line never costs the whole pass;
 *  - both languages, no em dashes, length caps;
 *  - on any failure the Look's defaults ship (`fallback_used`), never nothing.
 */

import type { Bilingual } from "./types";

export interface CopyPassFacts {
  businessName: string;
  city?: string | null;
  tagline?: string | null;
  familyLabel: string;
  typeLabel: { es: string; en: string };
  /** Positioning facts from the brief, already redacted of anything personal. */
  audience?: string | null;
  tone?: string | null;
  differentiator?: string | null;
  description?: string | null;
  /** Names of services in the owner's words (no prices). */
  services?: string[];
}

export interface CopyPassInput {
  facts: CopyPassFacts;
  /** The Look's default copy: what the model may rewrite. */
  defaults: Readonly<Record<string, Bilingual>>;
  /** Keys the pass is allowed to touch (nav labels and footer rights are not). */
  keys: readonly string[];
  primaryLocale: "es" | "en";
}

export const COPY_PASS_JSON_SCHEMA = {
  name: "look_copy_pass",
  strict: false,
  schema: {
    type: "object",
    required: ["copy"],
    properties: {
      copy: {
        type: "object",
        additionalProperties: {
          type: "object",
          required: ["es", "en"],
          properties: { es: { type: "string" }, en: { type: "string" } },
        },
        description: "Map of copy key to {es, en}. Omit keys you leave unchanged.",
      },
    },
  },
} as const;

export const COPY_PASS_MAX_TOKENS = 1_800;
export const COPY_PASS_TIMEOUT_MS = 25_000;

/** Keys a compose lets the model rewrite; everything else stays deterministic. */
export const COPY_PASS_KEYS = [
  "home.hero.sub",
  "home.offer.eyebrow",
  "home.offer.headline",
  "home.offer.body",
  "home.closing.headline",
  "home.closing.body",
  "catalogue.headline",
  "catalogue.intro",
  "transaction.headline",
  "transaction.intro",
  "about.headline",
  "about.body",
  "about.body2",
  "contact.headline",
  "contact.intro",
  "gallery.headline",
] as const;

const MAX_LEN: Record<string, number> = { "home.hero.sub": 120, "home.offer.headline": 70, "home.closing.headline": 60, "catalogue.headline": 60, "transaction.headline": 60, "about.headline": 80, "contact.headline": 80, "gallery.headline": 80 };
const DEFAULT_MAX = 320;

export function buildCopyPassPrompt(input: CopyPassInput): { systemPrompt: string; userMessage: string } {
  const f = input.facts;
  const system = [
    "You write short website copy for a small local business. You are given the business's facts and the current copy of its site, keyed by slot.",
    "Rewrite the copy in the business's own voice. Return JSON only: {\"copy\": {\"<key>\": {\"es\": \"…\", \"en\": \"…\"}}}. Write BOTH languages for every key you return. Omit keys you would leave unchanged.",
    "HARD RULES. Never invent a fact. Do not write prices, currency amounts, opening hours, dates, addresses, phone numbers, email addresses, years of experience, numbers of clients, awards, certifications, reviews, quotes, or people's names. Do not rename the business. Do not mention services, dishes or classes that are not in the facts. Do not promise delivery, parking, discounts or availability.",
    "Style: Spanish (Mexico) natural and warm, English plain. Headlines 3 to 8 words. Body one or two sentences. No exclamation marks in headlines. Never use em dashes or en dashes; use a comma or a period.",
    "Keep every value under the length limit given for its key.",
  ].join("\n");
  const facts = [
    `business: ${f.businessName}`,
    `type: ${f.typeLabel.es} / ${f.typeLabel.en} (${f.familyLabel})`,
    f.city ? `city: ${f.city}` : null,
    f.tagline ? `tagline: ${f.tagline}` : null,
    f.description ? `description: ${f.description.slice(0, 600)}` : null,
    f.audience ? `audience: ${f.audience}` : null,
    f.tone ? `tone: ${f.tone}` : null,
    f.differentiator ? `what makes it different: ${f.differentiator}` : null,
    f.services && f.services.length > 0 ? `services (names only): ${f.services.slice(0, 12).join("; ")}` : null,
  ].filter(Boolean);
  const current = input.keys
    .filter((k) => input.defaults[k])
    .map((k) => `${k} (max ${MAX_LEN[k] ?? DEFAULT_MAX} chars): es="${input.defaults[k].es}" en="${input.defaults[k].en}"`);
  return {
    systemPrompt: system,
    userMessage: [`PRIMARY LANGUAGE: ${input.primaryLocale}`, "", "FACTS", ...facts, "", "CURRENT COPY", ...current, "", "Return only the JSON object."].join("\n"),
  };
}

// ── Screening ───────────────────────────────────────────────────────────────

const PRICE_RE = /(\$|€|£|mxn|usd|eur|pesos?)\s?\d|\d+\s?(\$|€|£|mxn|usd|eur|pesos)/i;
const TIME_RE = /\b\d{1,2}(:\d{2})?\s?(am|pm|hrs?|h)\b|\b\d{1,2}:\d{2}\b/i;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/;
const EMAIL_RE = /\S+@\S+\.\S+/;
const YEARS_RE = /\b\d+\s?(años|years?|yrs)\b/i;
const CLAIM_RE = /\b(award|premio|certif|licen|guarantee|garantiz|#1|number one|best in|mejor de)\w*/i;
const DASH_RE = /[—–]/;

export function screenCopyValue(key: string, value: string, facts: CopyPassFacts): { ok: true; value: string } | { ok: false; reason: string } {
  const v = value.replace(/\s+/g, " ").trim();
  if (!v) return { ok: false, reason: "empty" };
  if (v.length > (MAX_LEN[key] ?? DEFAULT_MAX)) return { ok: false, reason: "too long" };
  if (DASH_RE.test(v)) return { ok: false, reason: "dash" };
  if (PRICE_RE.test(v)) return { ok: false, reason: "price" };
  if (TIME_RE.test(v)) return { ok: false, reason: "time" };
  if (PHONE_RE.test(v)) return { ok: false, reason: "phone" };
  if (EMAIL_RE.test(v)) return { ok: false, reason: "email" };
  if (YEARS_RE.test(v)) return { ok: false, reason: "years" };
  if (CLAIM_RE.test(v)) return { ok: false, reason: "claim" };
  // Any 3+ digit number that is not in the facts is a number we made up.
  const known = new Set((JSON.stringify(facts).match(/\d{3,}/g) ?? []));
  for (const n of v.match(/\d{3,}/g) ?? []) if (!known.has(n)) return { ok: false, reason: "number" };
  return { ok: true, value: v };
}

/** Parse + screen a model reply. Returns only the keys that survived, with why the rest fell. */
export function screenCopyReply(raw: string | null, input: CopyPassInput): { copy: Record<string, Bilingual>; dropped: Array<{ key: string; reason: string }> } {
  const dropped: Array<{ key: string; reason: string }> = [];
  const copy: Record<string, Bilingual> = {};
  if (!raw) return { copy, dropped: [{ key: "*", reason: "no reply" }] };
  let parsed: unknown;
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
  } catch {
    return { copy, dropped: [{ key: "*", reason: "not json" }] };
  }
  const map = (parsed as { copy?: unknown })?.copy;
  if (!map || typeof map !== "object") return { copy, dropped: [{ key: "*", reason: "no copy map" }] };
  const allowed = new Set(input.keys);
  for (const [key, pair] of Object.entries(map as Record<string, unknown>)) {
    if (!allowed.has(key)) {
      dropped.push({ key, reason: "not allowed" });
      continue;
    }
    const es = typeof (pair as { es?: unknown })?.es === "string" ? screenCopyValue(key, (pair as { es: string }).es, input.facts) : ({ ok: false, reason: "missing es" } as const);
    const en = typeof (pair as { en?: unknown })?.en === "string" ? screenCopyValue(key, (pair as { en: string }).en, input.facts) : ({ ok: false, reason: "missing en" } as const);
    if (!es.ok) {
      dropped.push({ key, reason: `es ${es.reason}` });
      continue;
    }
    if (!en.ok) {
      dropped.push({ key, reason: `en ${en.reason}` });
      continue;
    }
    copy[key] = { es: es.value, en: en.value };
  }
  return { copy, dropped };
}
