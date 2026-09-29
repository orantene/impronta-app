/**
 * Pure model for the talent AI translate action (PR 6): the field allow-list,
 * the cache key, the prompt, and the daily-cap query shape. No I/O here so it
 * is testable without a DB or a model.
 */

import { createHash } from "node:crypto";

import { glossaryPromptBlock } from "@/lib/translation/glossary-prompt";

export const TALENT_TRANSLATE_LOCALES = ["en", "es", "fr", "pt", "de"] as const;
export type TalentTranslateLocale = (typeof TALENT_TRANSLATE_LOCALES)[number];

export const TALENT_TRANSLATE_LANGUAGE_NAMES: Record<TalentTranslateLocale, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
  de: "German",
};

export type TalentTranslateStyle = "label" | "paragraph";

export type TalentTranslateFieldSpec = {
  /** Longest source text accepted (characters, after normalisation). */
  maxLength: number;
  style: TalentTranslateStyle;
  /** Output token budget for the model call. */
  maxTokens: number;
};

export const TALENT_TRANSLATE_FIELDS = {
  offering_title: { maxLength: 120, style: "label", maxTokens: 80 },
  offering_description: { maxLength: 2000, style: "paragraph", maxTokens: 900 },
  variant_label: { maxLength: 80, style: "label", maxTokens: 60 },
  addon_label: { maxLength: 80, style: "label", maxTokens: 60 },
  faq_question: { maxLength: 300, style: "label", maxTokens: 160 },
  faq_answer: { maxLength: 1500, style: "paragraph", maxTokens: 700 },
  page_title: { maxLength: 120, style: "label", maxTokens: 80 },
  seo_title: { maxLength: 120, style: "label", maxTokens: 80 },
  seo_description: { maxLength: 320, style: "paragraph", maxTokens: 200 },
  bio: { maxLength: 2000, style: "paragraph", maxTokens: 900 },
  tagline: { maxLength: 160, style: "label", maxTokens: 100 },
  builder_text: { maxLength: 2000, style: "paragraph", maxTokens: 900 },
} as const satisfies Record<string, TalentTranslateFieldSpec>;

export type TalentTranslateField = keyof typeof TALENT_TRANSLATE_FIELDS;

/** Default daily translate budget per talent (fields per UTC day). */
export const TALENT_TRANSLATE_DAILY_CAP = 200;
/** `context_jsonb.scope` written by `recordAiGenerationUsage` for this action. */
export const TALENT_TRANSLATE_SCOPE = "talent_translate";

export function isTalentTranslateField(v: unknown): v is TalentTranslateField {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(TALENT_TRANSLATE_FIELDS, v);
}

export function isTalentTranslateLocale(v: unknown): v is TalentTranslateLocale {
  return typeof v === "string" && (TALENT_TRANSLATE_LOCALES as readonly string[]).includes(v);
}

/** Trim, unify newlines, collapse runs of spaces/tabs. Paragraph breaks survive. */
export function normaliseTranslateText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ValidatedTranslateInput = {
  field: TalentTranslateField;
  from: TalentTranslateLocale;
  to: TalentTranslateLocale;
  text: string;
  spec: TalentTranslateFieldSpec;
};

/** Allow-list + length clamp. Null = invalid input (unknown field/locale, same locale, empty). */
export function validateTranslateInput(input: { field: unknown; from: unknown; to: unknown; text: unknown }): ValidatedTranslateInput | null {
  if (!isTalentTranslateField(input.field)) return null;
  if (!isTalentTranslateLocale(input.from) || !isTalentTranslateLocale(input.to)) return null;
  if (input.from === input.to) return null;
  if (typeof input.text !== "string") return null;
  const spec = TALENT_TRANSLATE_FIELDS[input.field];
  const text = normaliseTranslateText(input.text).slice(0, spec.maxLength).trim();
  if (!text) return null;
  return { field: input.field, from: input.from, to: input.to, text, spec };
}

/** sha256 over the normalised input; stable across whitespace noise. */
export function translationCacheKey(field: string, from: string, to: string, text: string): string {
  const payload = [field.trim(), from.trim().toLowerCase(), to.trim().toLowerCase(), normaliseTranslateText(text)].join("\u0000");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function buildTalentTranslatePrompt(input: { field: TalentTranslateField; from: TalentTranslateLocale; to: TalentTranslateLocale; text: string }): {
  systemPrompt: string;
  userMessage: string;
} {
  const spec = TALENT_TRANSLATE_FIELDS[input.field];
  const fromName = TALENT_TRANSLATE_LANGUAGE_NAMES[input.from];
  const toName = TALENT_TRANSLATE_LANGUAGE_NAMES[input.to];
  const styleLine =
    spec.style === "label"
      ? "This is a short label. Keep it short, natural and in the same register; no trailing period unless the source has one."
      : "This is a paragraph. Keep the meaning, tone, line breaks and length close to the source.";
  const systemPrompt = [
    `You translate text written by an independent professional for their own website from ${fromName} to ${toName}.`,
    styleLine,
    glossaryPromptBlock(),
    "Keep personal names, prices, numbers, emails, links and emoji unchanged.",
    "Do not use em dashes.",
    `Output only the ${toName} translation: no quotes, no notes, no preamble.`,
  ].join(" ");
  return { systemPrompt, userMessage: input.text };
}

/** Strip wrapping quotes a model sometimes adds. */
export function cleanTranslatedText(raw: string): string {
  let t = raw.trim();
  const pairs: Array<[string, string]> = [["\"", "\""], ["“", "”"], ["'", "'"], ["«", "»"]];
  for (const [a, b] of pairs) {
    if (t.length >= 2 && t.startsWith(a) && t.endsWith(b)) {
      t = t.slice(a.length, t.length - b.length).trim();
      break;
    }
  }
  return t;
}

export type DailyAiCapQuery = {
  table: "cms_ai_usage_log";
  eq: Array<[column: string, value: string]>;
  contains: { column: "context_jsonb"; value: Record<string, string> };
  gteCreatedAt: string;
};

/**
 * Shape of the per-day usage count. Rows are written by
 * `recordAiGenerationUsage` with `action = "generate_section"` and the real
 * scope inside `context_jsonb`, so the filter matches on both.
 */
export function buildDailyAiCapQuery(input: { tenantId: string; scope: string; talentProfileId?: string | null; now?: Date }): DailyAiCapQuery {
  const since = new Date(input.now ?? Date.now());
  since.setUTCHours(0, 0, 0, 0);
  const contains: Record<string, string> = { scope: input.scope };
  if (input.talentProfileId) contains.talent_profile_id = input.talentProfileId;
  return {
    table: "cms_ai_usage_log",
    eq: [
      ["tenant_id", input.tenantId],
      ["action", "generate_section"],
    ],
    contains: { column: "context_jsonb", value: contains },
    gteCreatedAt: since.toISOString(),
  };
}
