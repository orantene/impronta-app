/**
 * extraction.ts — turning prose into facts, safely.
 *
 * The model's FIRST job. It reads what someone just said and proposes fact rows;
 * this module decides which of those proposals are allowed to exist.
 *
 * WHY EVERY FIELD IS RE-VALIDATED
 * ───────────────────────────────
 * The schema is a request, not a guarantee — Anthropic's structured output is
 * prompt-enforced, so a schema violation is a normal Tuesday rather than an
 * exceptional event. And the failure mode is not a crash: it is a plausible
 * wrong fact, silently written, which then argues for a plan the person does not
 * need. So a proposal survives only if its key is in the vocabulary, its value
 * matches the declared type, and its confidence is in range.
 *
 * WHY NOTHING HERE ARRIVES CONFIRMED
 * ──────────────────────────────────
 * Extraction produces `ai_inference` facts, and the store maps those to
 * `needs_approval` (decision L20). Some inferences are close to verbatim — a
 * name in "I'm Sofia" is not really a guess — but making that judgement here
 * would put the confirm/guess boundary in the extractor, where it is invisible.
 * The Agent confirms verbally instead, which is both cheaper and more honest.
 */

import type { JsonSchemaForChat } from "@/lib/ai/provider";
import { factKeyDef, isKnownFactKey, validateFactValue, FACT_KEYS } from "./fact-keys";
import type { FactInput } from "./brief-store";

// ─── Schema ───────────────────────────────────────────────────────────────────

/**
 * The extraction contract.
 *
 * Values arrive as STRINGS regardless of the fact's real type, then get coerced
 * here. A union-typed value field produces markedly worse compliance from every
 * model tested in this codebase, and coercion we control is more predictable
 * than type discipline we merely request.
 */
export const EXTRACTION_SCHEMA: JsonSchemaForChat = {
  name: "tulala_fact_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["facts"],
    properties: {
      facts: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "value", "confidence", "quote"],
          properties: {
            key: { type: "string", description: "Must be one of the listed fact keys." },
            value: {
              type: "string",
              description:
                "The value as a string. For yes/no facts use exactly 'true' or 'false'. For numbers, digits only. For lists, comma-separated.",
            },
            confidence: {
              type: "number",
              description:
                "0.9+ they said it almost verbatim. 0.6-0.8 clearly implied. 0.4-0.5 a reasonable guess. Below 0.4, do not include it.",
            },
            quote: {
              type: "string",
              description:
                "The user's own words this came from, verbatim, max 200 chars. Empty string if inferred from context rather than a phrase.",
            },
          },
        },
      },
    },
  },
};

/**
 * The IMPORT variant, and the only difference is `maxItems`.
 *
 * A conversation yields a few facts per turn, so 12 is generous there. A page
 * import is not a turn: El Paisa's menu page alone carries a name, a
 * description, hours, socials, a logo, a palette, section names and every dish.
 * Under the conversational cap the extractor would return the first twelve and
 * we would never know which it dropped — a silent truncation that reads exactly
 * like "the page did not say".
 *
 * A separate schema rather than a raised shared one: the conversational cap is
 * load-bearing for turn latency and cost, and widening it for everyone to serve
 * one caller is how a limit stops meaning anything.
 */
export const IMPORT_EXTRACTION_SCHEMA: JsonSchemaForChat = {
  name: "tulala_fact_extraction_import",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["facts"],
    properties: {
      facts: {
        type: "array",
        maxItems: 40,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "value", "confidence", "quote"],
          properties: {
            key: { type: "string", description: "Must be one of the listed fact keys." },
            value: {
              type: "string",
              description:
                "The value as a string. For yes/no facts use exactly 'true' or 'false'. For numbers, digits only. For lists, comma-separated.",
            },
            confidence: {
              type: "number",
              description:
                "0.9+ they said it almost verbatim. 0.6-0.8 clearly implied. 0.4-0.5 a reasonable guess. Below 0.4, do not include it.",
            },
            quote: {
              type: "string",
              description:
                "The user's own words this came from, verbatim, max 200 chars. Empty string if inferred from context rather than a phrase.",
            },
          },
        },
      },
    },
  },
};


// ─── Floors ───────────────────────────────────────────────────────────────────

/**
 * Below this, a proposal is dropped rather than stored.
 *
 * A 0.3-confidence guess is not free to keep: it satisfies the question that
 * targets it, so the Agent stops asking, and it lands in the approval queue as
 * noise. Storing weak guesses makes the conversation shorter and the answer
 * worse, which is the wrong trade in both directions.
 */
export const MIN_EXTRACTION_CONFIDENCE = 0.4;

/** Ceiling on an AI proposal, no matter what it claims. */
export const MAX_EXTRACTION_CONFIDENCE = 0.95;

/** Longest quote kept, matching the store's excerpt cap behaviour. */
export const MAX_QUOTE_CHARS = 200;

// ─── Parsing ──────────────────────────────────────────────────────────────────

export type RejectedProposal = {
  key: string;
  reason:
    | "unknown_key"
    | "bad_value"
    | "low_confidence"
    | "malformed"
    /** A real key the model was not offered on this turn. See `isPhysicalAttribute`. */
    | "not_offered";
};

export type ExtractionResult = {
  facts: FactInput[];
  rejected: RejectedProposal[];
  /** True when the payload itself could not be read. Distinct from zero facts. */
  parseFailed: boolean;
};

type RawProposal = {
  key?: unknown;
  value?: unknown;
  confidence?: unknown;
  quote?: unknown;
};

/**
 * Coerce the model's string value into the type the vocabulary declares.
 *
 * Returns `undefined` for anything unconvincing rather than picking a default.
 * A booleanish "maybe" coerced to `false` is a fact nobody stated, and it will
 * be indistinguishable from a real answer once it is a row.
 */
export function coerceValue(factKey: string, raw: unknown): unknown | undefined {
  const def = factKeyDef(factKey);
  if (!def) return undefined;
  if (typeof raw !== "string") {
    // Already the right shape? Take it. Models occasionally ignore the
    // stringly-typed instruction and send a real boolean or number.
    return validateFactValue(factKey, raw).ok ? raw : undefined;
  }

  const text = raw.trim();
  if (!text) return undefined;

  switch (def.type) {
    case "boolean": {
      const lowered = text.toLowerCase();
      if (["true", "yes", "y", "si", "sí"].includes(lowered)) return true;
      if (["false", "no", "n"].includes(lowered)) return false;
      return undefined;
    }
    case "number": {
      // "about 5", "5 people", "5-6" → 5. The engine wants a count, and a lower
      // bound from a range is the safe read: it never over-sells a seat band.
      const match = text.match(/\d+(?:\.\d+)?/);
      if (!match) return undefined;
      const n = Number(match[0]);
      return Number.isFinite(n) ? n : undefined;
    }
    case "string_list": {
      const parts = text
        .split(/[,;]|\band\b|\by\b/i)
        .map((p) => p.trim())
        .filter(Boolean);
      return parts.length > 0 ? parts : undefined;
    }
    case "string": {
      if (def.allowed) {
        const lowered = text.toLowerCase().replace(/[\s-]+/g, "_");
        const hit = def.allowed.find((a) => a.toLowerCase() === lowered);
        return hit ?? undefined;
      }
      return text;
    }
  }
}

/**
 * Parse and validate a model extraction payload.
 *
 * Never throws. A malformed payload on a signup turn must degrade to "learned
 * nothing this turn", because the alternative is a 500 in the middle of someone
 * describing their business.
 */
export function parseExtraction(
  rawText: string,
  context: {
    questionId?: string | null;
    questionVersion?: number | null;
    /** Only true inside the modelling pack. Defaults to refusing. */
    allowPhysicalAttributes?: boolean;
  } = {},
): ExtractionResult {
  const rejected: RejectedProposal[] = [];

  let payload: unknown;
  try {
    payload = JSON.parse(stripCodeFences(rawText));
  } catch {
    return { facts: [], rejected: [], parseFailed: true };
  }

  const proposals = (payload as { facts?: unknown })?.facts;
  if (!Array.isArray(proposals)) {
    return { facts: [], rejected: [], parseFailed: true };
  }

  const facts: FactInput[] = [];
  const seen = new Set<string>();

  for (const entry of proposals as RawProposal[]) {
    if (!entry || typeof entry !== "object") {
      rejected.push({ key: "?", reason: "malformed" });
      continue;
    }

    const key = typeof entry.key === "string" ? entry.key.trim() : "";
    if (!key || !isKnownFactKey(key)) {
      rejected.push({ key: key || "?", reason: "unknown_key" });
      continue;
    }

    // A valid key the model had no business producing. Defaults to refusing, so
    // a caller that forgets to pass the flag gets the safe behaviour rather than
    // the permissive one.
    if (!context.allowPhysicalAttributes && isPhysicalAttribute(key)) {
      rejected.push({ key, reason: "not_offered" });
      continue;
    }

    // One proposal per key per turn. A model that emits the same key twice has
    // contradicted itself, and the first mention is the one tied to the quote.
    if (seen.has(key)) continue;

    const confidence = typeof entry.confidence === "number" ? entry.confidence : NaN;
    if (!Number.isFinite(confidence) || confidence < MIN_EXTRACTION_CONFIDENCE) {
      rejected.push({ key, reason: "low_confidence" });
      continue;
    }

    const value = coerceValue(key, entry.value);
    if (value === undefined || !validateFactValue(key, value).ok) {
      rejected.push({ key, reason: "bad_value" });
      continue;
    }

    const quote = typeof entry.quote === "string" ? entry.quote.trim() : "";

    seen.add(key);
    facts.push({
      factKey: key,
      value,
      source: "ai_inference",
      confidence: Math.min(MAX_EXTRACTION_CONFIDENCE, confidence),
      sourceExcerpt: quote ? quote.slice(0, MAX_QUOTE_CHARS) : null,
      questionId: context.questionId ?? null,
      questionVersion: context.questionVersion ?? null,
    });
  }

  return { facts, rejected, parseFailed: false };
}

/**
 * Tolerate fenced JSON.
 *
 * Anthropic's structured output is prompt-enforced, so a stray ```json fence is
 * a routine occurrence rather than a bug worth failing a turn over.
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

// ─── Vocabulary for the prompt ────────────────────────────────────────────────

/**
 * The fact keys, rendered for the extraction prompt.
 *
 * Generated from `FACT_KEYS` rather than written out, so a key added to the
 * vocabulary is immediately extractable. A hand-maintained copy in a prompt
 * string is guaranteed to fall behind, and the symptom — a fact that can be
 * stored but never gets extracted — is close to undiagnosable from the outside.
 */
export function factVocabularyForPrompt(
  options: { allowPhysicalAttributes?: boolean } = {},
): string {
  return FACT_KEYS.filter(
    (def) => options.allowPhysicalAttributes || !isPhysicalAttribute(def.key),
  )
    .map((def) => {
      const parts = [`${def.key} (${def.type})`];
      if (def.allowed) parts.push(`one of: ${def.allowed.join(" | ")}`);
      parts.push(def.label);
      return `- ${parts.join(" — ")}`;
    })
    .join("\n");
}

/**
 * Keys the extractor is not offered unless the modelling pack is active.
 *
 * Height, measurements, hair and eye colour are required in casting and nowhere
 * else. Leaving them in the general vocabulary would let an offhand remark
 * become a stored physical description of somebody who was never asked and never
 * agreed — the model cannot record what it was not told exists, so withholding
 * the key is the enforcement, not a prompt instruction asking it to be careful.
 */
const PHYSICAL_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set([
  "industry.height_cm",
  "industry.measurements",
  "industry.hair_color",
  "industry.eye_color",
]);

export function isPhysicalAttribute(key: string): boolean {
  return PHYSICAL_ATTRIBUTE_KEYS.has(key);
}
