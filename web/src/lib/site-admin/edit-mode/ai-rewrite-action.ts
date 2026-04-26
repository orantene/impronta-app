"use server";

/**
 * Phase 14-lite — AI rewrite + translate-section for section copy.
 *
 * Two server actions:
 *   - rewriteFieldWithAi  — rewrite a single field with operator instruction
 *   - translateSectionWithAi — translate every rewritable field on a section
 *
 * Both share the same provider adapter, allow-list, and rate limit.
 *
 * Safety:
 *   - requireStaff + requireTenantScope (same gate as every other edit
 *     action).
 *   - Field allow-list per section (string fields only; we never let
 *     the AI rewrite numbers, enums, or URLs).
 *   - Per-tenant rate limit (50 calls / hour) — in-memory bucket.
 *     Survives a single serverless instance's lifetime; not a
 *     security boundary, just a sane "stop runaway editor" cap. Real
 *     billing-grade limiting still TBD.
 *   - Context priming: the prompt now sees the section's other
 *     copy fields (eyebrow + headline + body together) so a rewrite
 *     of `headline` knows what `body` says, producing more coherent
 *     output.
 *   - Length cap on the instruction (240 chars) and on the output
 *     (4000 chars) to bound API cost.
 *   - Model output is plain text, never executed or rendered as HTML.
 *     The {accent}/{b}/{i}/[link]() rich-text markers are explicitly
 *     allowed in the system prompt so the AI can preserve formatting
 *     when present.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { resolveAiChatAdapter } from "@/lib/ai/resolve-provider";
import { logServerError } from "@/lib/server/safe-error";

export type AiRewriteInput = {
  sectionTypeKey: string;
  fieldName: string;
  /** The field's current value (the AI rewrites this). */
  currentValue: string;
  /** Operator-supplied instruction (max 240 chars). */
  instruction: string;
  /** Other field values from the same section, for context priming. */
  siblingContext?: Record<string, string>;
};

export type AiRewriteResult =
  | { ok: true; text: string }
  | { ok: false; error: string; code?: string };

/** Section keys + field names the AI is allowed to rewrite. Anything
 * outside this map returns FIELD_NOT_REWRITABLE (no provider call). */
const REWRITABLE_FIELDS: Record<string, ReadonlyArray<string>> = {
  hero: ["headline", "subheadline"],
  cta_banner: ["eyebrow", "headline", "copy", "reassurance"],
  category_grid: ["eyebrow", "headline", "copy"],
  destinations_mosaic: ["eyebrow", "headline", "copy", "footnote"],
  testimonials_trio: ["eyebrow", "headline"],
  process_steps: ["eyebrow", "headline", "copy"],
  image_copy_alternating: ["eyebrow", "headline"],
  values_trio: ["eyebrow", "headline"],
  press_strip: ["eyebrow"],
  gallery_strip: ["eyebrow", "headline", "caption"],
  featured_talent: ["eyebrow", "headline", "copy"],
  trust_strip: ["eyebrow", "headline"],
  // M9/M10
  stats: ["eyebrow", "headline"],
  faq_accordion: ["eyebrow", "headline", "intro"],
  split_screen: ["eyebrow", "headline", "body"],
  marquee: [],
  timeline: ["eyebrow", "headline"],
  pricing_grid: ["eyebrow", "headline", "intro"],
  team_grid: ["eyebrow", "headline", "intro"],
  contact_form: ["eyebrow", "headline", "intro", "successMessage"],
  before_after: ["eyebrow", "headline"],
  content_tabs: ["eyebrow", "headline"],
  code_embed: ["eyebrow", "headline", "caption"],
  anchor_nav: [],
  // M11
  blog_index: ["eyebrow", "headline"],
  comparison_table: ["eyebrow", "headline", "intro"],
  // M12
  lottie: ["eyebrow", "headline", "caption"],
  sticky_scroll: ["eyebrow", "headline"],
  masonry: ["eyebrow", "headline"],
  scroll_carousel: ["eyebrow", "headline"],
  blog_detail: ["category", "title", "byline", "body", "pullQuote"],
  magazine_layout: ["eyebrow", "headline"],
  hero_split: ["eyebrow", "headline", "subheadline"],
  // M13
  logo_cloud: ["eyebrow", "headline"],
  image_orbit: ["eyebrow", "headline"],
  video_reel: ["eyebrow", "headline"],
  map_overlay: ["eyebrow", "headline"],
  donation_form: ["eyebrow", "headline", "intro", "trustNote"],
  code_snippet: ["eyebrow", "headline"],
  event_listing: ["eyebrow", "headline"],
  lookbook: ["eyebrow", "headline"],
  booking_widget: ["eyebrow", "headline", "intro", "buttonLabel"],
};

const SYSTEM_PROMPT = `You rewrite copy for sections of a small-business website. The operator gives you the current text and a one-line instruction. Return ONLY the rewritten text — no preamble, no explanation, no quotes around it.

Tone: confident, concrete, free of marketing fluff. Avoid em-dashes between independent clauses (use periods). Avoid exclamation marks unless the instruction asks for them. Sentence-case headlines unless told otherwise.

Length: respect any character cap implied by the original (don't write a 200-char headline if the original was 40). If the instruction asks for a specific length, respect it exactly.

Formatting: the source MAY contain these rich-text markers — preserve or use them where they fit:
- {accent}phrase{/accent}  → italic-serif accent on a single phrase
- {b}phrase{/b}            → bold
- {i}phrase{/i}            → italic
- [text](https://url)      → markdown link

Context: when the operator includes "other section fields" below, those are sibling fields on the same page section. Use them to keep the rewrite consistent with the section's overall message — never copy text out of them, and never invent a fact that doesn't appear there or in the current text.

Never invent facts. If the operator's instruction is empty or non-actionable, just polish the existing copy lightly.`;

// ── Rate limiting ─────────────────────────────────────────────────────────
//
// In-memory token bucket per tenant. 50 calls per rolling hour. Reset by
// trimming entries older than the window on every check. Not a security
// boundary — a forgetful runtime resets the bucket. It exists to stop a
// runaway editor session from racking up Anthropic spend.

const RATE_LIMIT_MAX = 50;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const tenantHits = new Map<string, number[]>();

function checkRateLimit(tenantId: string): {
  ok: boolean;
  remaining: number;
  resetMs?: number;
} {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (tenantHits.get(tenantId) ?? []).filter((t) => t > cutoff);
  if (arr.length >= RATE_LIMIT_MAX) {
    const oldest = arr[0];
    return {
      ok: false,
      remaining: 0,
      resetMs: oldest + RATE_LIMIT_WINDOW_MS - now,
    };
  }
  arr.push(now);
  tenantHits.set(tenantId, arr);
  return { ok: true, remaining: RATE_LIMIT_MAX - arr.length };
}

// ── Action: rewrite single field ──────────────────────────────────────────

export async function rewriteFieldWithAi(
  input: AiRewriteInput,
): Promise<AiRewriteResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return { ok: false, error: "Pick an agency workspace before editing." };
  }

  const allowed = REWRITABLE_FIELDS[input.sectionTypeKey];
  if (!allowed) {
    return {
      ok: false,
      error: `Section "${input.sectionTypeKey}" is not registered.`,
      code: "UNKNOWN_SECTION_TYPE",
    };
  }
  if (!allowed.includes(input.fieldName)) {
    return {
      ok: false,
      error: `Field "${input.fieldName}" is not rewritable on this section.`,
      code: "FIELD_NOT_REWRITABLE",
    };
  }

  const limit = checkRateLimit(scope.tenantId);
  if (!limit.ok) {
    const minutes = Math.ceil((limit.resetMs ?? 0) / 60000);
    return {
      ok: false,
      error: `AI rewrite limit reached (50/hour). Try again in ~${minutes} min.`,
      code: "RATE_LIMITED",
    };
  }

  const instruction = input.instruction.trim().slice(0, 240);
  const currentValue = input.currentValue.slice(0, 4000);

  // Build sibling-field context block (only the OTHER allowed fields,
  // truncated, with empty values omitted for token economy).
  const siblings = Object.entries(input.siblingContext ?? {})
    .filter(([k, v]) => k !== input.fieldName && allowed.includes(k) && typeof v === "string" && v.trim().length > 0)
    .map(([k, v]) => `- ${k}: ${v.slice(0, 400)}`)
    .join("\n");

  const adapter = await resolveAiChatAdapter();
  const userMessageParts = [
    `Section type: ${input.sectionTypeKey}`,
    `Field: ${input.fieldName}`,
  ];
  if (siblings) {
    userMessageParts.push("", "Other fields on the same section (for context — do not copy from these):", siblings);
  }
  userMessageParts.push(
    "",
    `Current text:`,
    "```",
    currentValue || "(empty)",
    "```",
    "",
    `Operator instruction: ${instruction || "(none — polish lightly)"}`,
  );
  const userMessage = userMessageParts.join("\n");

  try {
    const result = await adapter.chatCompletion({
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      temperature: 0.6,
      maxTokens: 600,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.message ?? "AI provider call failed.",
        code: result.code,
      };
    }
    let text = result.text.trim();
    if (
      (text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))
    ) {
      text = text.slice(1, -1).trim();
    }
    text = text.slice(0, 4000);
    return { ok: true, text };
  } catch (err) {
    logServerError("ai-rewrite-action/chatCompletion", err);
    return {
      ok: false,
      error: "Couldn't reach the AI provider — try again.",
      code: "AI_PROVIDER_ERROR",
    };
  }
}

// ── Action: translate whole section ───────────────────────────────────────

export type AiTranslateInput = {
  sectionTypeKey: string;
  /** Current full props of the section. */
  currentProps: Record<string, unknown>;
  /** Target locale code (e.g. "es", "fr", "pt-BR"). */
  targetLocale: string;
  /** Optional human-readable name for the locale. */
  targetLocaleLabel?: string;
};

export type AiTranslateResult =
  | { ok: true; translations: Record<string, string> }
  | { ok: false; error: string; code?: string };

const TRANSLATE_SYSTEM_PROMPT = `You translate website copy. The operator gives you a JSON object of source field → English text. Return ONLY a JSON object with the same keys, values translated to the target language. Preserve {accent}/{b}/{i} markers verbatim around the equivalent phrases. Preserve [text](url) markers — translate the text inside [], leave the url as-is. No preamble, no markdown fences, raw JSON only.`;

export async function translateSectionWithAi(
  input: AiTranslateInput,
): Promise<AiTranslateResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return { ok: false, error: "Pick an agency workspace before editing." };
  }
  const allowed = REWRITABLE_FIELDS[input.sectionTypeKey];
  if (!allowed) {
    return {
      ok: false,
      error: `Section "${input.sectionTypeKey}" is not registered.`,
      code: "UNKNOWN_SECTION_TYPE",
    };
  }

  const limit = checkRateLimit(scope.tenantId);
  if (!limit.ok) {
    const minutes = Math.ceil((limit.resetMs ?? 0) / 60000);
    return {
      ok: false,
      error: `AI rewrite limit reached (50/hour). Try again in ~${minutes} min.`,
      code: "RATE_LIMITED",
    };
  }

  // Collect non-empty allowed fields.
  const source: Record<string, string> = {};
  for (const key of allowed) {
    const v = input.currentProps[key];
    if (typeof v === "string" && v.trim().length > 0) {
      source[key] = v.slice(0, 2000);
    }
  }
  if (Object.keys(source).length === 0) {
    return { ok: false, error: "Section has no translatable text fields." };
  }

  const targetLabel = input.targetLocaleLabel ?? input.targetLocale;
  const userMessage = [
    `Target language: ${targetLabel} (locale code: ${input.targetLocale})`,
    `Source JSON (English):`,
    JSON.stringify(source, null, 2),
  ].join("\n");

  const adapter = await resolveAiChatAdapter();
  try {
    const result = await adapter.chatCompletion({
      systemPrompt: TRANSLATE_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxTokens: 2400,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.message ?? "AI provider call failed.",
        code: result.code,
      };
    }
    // Strip optional ```json fences the model sometimes adds.
    let raw = result.text.trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        error: "AI returned non-JSON output. Try again.",
        code: "AI_OUTPUT_INVALID",
      };
    }
    const translations: Record<string, string> = {};
    for (const key of allowed) {
      const v = parsed[key];
      if (typeof v === "string" && v.length > 0) {
        translations[key] = v.slice(0, 4000);
      }
    }
    if (Object.keys(translations).length === 0) {
      return {
        ok: false,
        error: "AI returned no translated fields.",
        code: "AI_OUTPUT_EMPTY",
      };
    }
    return { ok: true, translations };
  } catch (err) {
    logServerError("ai-rewrite-action/translateSection", err);
    return {
      ok: false,
      error: "Couldn't reach the AI provider — try again.",
      code: "AI_PROVIDER_ERROR",
    };
  }
}
