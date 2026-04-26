"use server";

/**
 * Phase 14-lite — AI rewrite for a single section field.
 *
 * Operator selects a section, picks a field (headline / body / etc.),
 * gives a short instruction (e.g. "make it more playful", "tighten to
 * 80 chars", "translate to Spanish"), and we round-trip it through
 * Claude. The result is returned as plain text — the operator decides
 * whether to apply.
 *
 * Safety:
 *   - requireStaff + requireTenantScope (same gate as every other edit
 *     action).
 *   - Field allow-list per section (string fields only; we never let
 *     the AI rewrite numbers, enums, or URLs).
 *   - Model output is plain text, never executed or rendered as HTML.
 *     The {accent}/{b}/{i}/[link]() rich-text markers are explicitly
 *     allowed in the system prompt so the AI can preserve formatting
 *     when present.
 *   - Length cap on the instruction (240 chars) and on the output
 *     (4000 chars) to bound API cost.
 *   - No rate limiting in this slice (deferred). The provider's own
 *     rate limit is the floor.
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
};

const SYSTEM_PROMPT = `You rewrite copy for sections of a small-business website. The operator gives you the current text and a one-line instruction. Return ONLY the rewritten text — no preamble, no explanation, no quotes around it.

Tone: confident, concrete, free of marketing fluff. Avoid em-dashes between independent clauses (use periods). Avoid exclamation marks unless the instruction asks for them. Sentence-case headlines unless told otherwise.

Length: respect any character cap implied by the original (don't write a 200-char headline if the original was 40). If the instruction asks for a specific length, respect it exactly.

Formatting: the source MAY contain these rich-text markers — preserve or use them where they fit:
- {accent}phrase{/accent}  → italic-serif accent on a single phrase
- {b}phrase{/b}            → bold
- {i}phrase{/i}            → italic
- [text](https://url)      → markdown link

Never invent facts. If the operator's instruction is empty or non-actionable, just polish the existing copy lightly.`;

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

  const instruction = input.instruction.trim().slice(0, 240);
  const currentValue = input.currentValue.slice(0, 4000);

  const adapter = await resolveAiChatAdapter();
  const userMessage = [
    `Section type: ${input.sectionTypeKey}`,
    `Field: ${input.fieldName}`,
    `Current text:`,
    "```",
    currentValue || "(empty)",
    "```",
    "",
    `Operator instruction: ${instruction || "(none — polish lightly)"}`,
  ].join("\n");

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
    // Strip any wrapping quotes the model occasionally includes
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
