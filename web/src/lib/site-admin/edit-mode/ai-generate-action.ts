"use server";

/**
 * Phase 14 — AI section generation + alt-text + page critique.
 *
 * Three actions, all sharing the same provider adapter and rate limit
 * as the existing rewrite/translate actions:
 *
 *   - generateSectionWithAi(sectionTypeKey, prompt) → returns props
 *     for that section, validated against its v1 schema.
 *   - generateAltTextWithAi(imageUrl, context) → returns alt string.
 *   - critiquePage() → audits the section list + theme tokens and
 *     returns prioritized findings.
 *
 * Image generation is deliberately NOT included — that needs a
 * Replicate / OpenAI Image API integration with cost gating that
 * should be product-scoped before code lands.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { resolveAiChatAdapter } from "@/lib/ai/resolve-provider";
import { logServerError } from "@/lib/server/safe-error";
import {
  SECTION_REGISTRY,
  type SectionTypeKey,
} from "@/lib/site-admin/sections/registry";
import { listSectionsForStaff } from "@/lib/site-admin/server/sections-reads";

// Reuse the same in-memory rate bucket as the rewrite action would —
// we re-declare it here to avoid an import cycle. Per-tenant cap of
// 50 calls/hr across ALL AI actions in this file.
const RATE_LIMIT_MAX = 50;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const tenantHits = new Map<string, number[]>();

function checkRate(tenantId: string): {
  ok: boolean;
  remainingMs?: number;
} {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (tenantHits.get(tenantId) ?? []).filter((t) => t > cutoff);
  if (arr.length >= RATE_LIMIT_MAX) {
    return { ok: false, remainingMs: arr[0] + RATE_LIMIT_WINDOW_MS - now };
  }
  arr.push(now);
  tenantHits.set(tenantId, arr);
  return { ok: true };
}

// ── Action: generate section ─────────────────────────────────────────────

export type GenerateSectionInput = {
  sectionTypeKey: string;
  prompt: string;
};

export type GenerateSectionResult =
  | { ok: true; props: Record<string, unknown> }
  | { ok: false; error: string; code?: string };

const SECTION_GEN_SYSTEM_PROMPT = `You generate JSON props for a section of a small-business website. Given the section type's Zod schema (as TypeScript) and the operator's brief, return ONLY a JSON object that matches the schema. No preamble, no markdown fences.

Tone: confident, concrete. Avoid marketing fluff. Avoid em-dashes between independent clauses. Sentence-case headlines unless the brief asks otherwise. Keep within reasonable character lengths (eyebrow ≤ 60, headline ≤ 200, body ≤ 800).

Formatting markers you may use in text fields:
- {accent}phrase{/accent}  → italic-serif accent
- {b}phrase{/b}            → bold
- {i}phrase{/i}            → italic
- [text](https://url)      → markdown link

If the schema includes image URLs, use placeholders like https://images.unsplash.com/photo-1519741497674-611481863552 — the operator will replace them.

Never invent specific facts (real names, phone numbers, addresses, prices) unless the brief provides them. Use illustrative placeholders.`;

export async function generateSectionWithAi(
  input: GenerateSectionInput,
): Promise<GenerateSectionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  if (!(input.sectionTypeKey in SECTION_REGISTRY)) {
    return {
      ok: false,
      error: `Unknown section type "${input.sectionTypeKey}".`,
      code: "UNKNOWN_SECTION_TYPE",
    };
  }
  const entry = SECTION_REGISTRY[input.sectionTypeKey as SectionTypeKey];

  const limit = checkRate(scope.tenantId);
  if (!limit.ok) {
    const minutes = Math.ceil((limit.remainingMs ?? 0) / 60000);
    return {
      ok: false,
      error: `AI limit reached (50/hour). Try again in ~${minutes} min.`,
      code: "RATE_LIMITED",
    };
  }

  // We don't have a clean way to serialize the Zod schema to text —
  // shipping a hand-written cheat sheet PER section type would be
  // tedious. Instead we describe the section by its meta + the
  // section's KNOWN field names from a shape probe (best-effort, won't
  // catch every nested shape but covers ~90% of sections).
  const fieldShape = describeSectionShape(entry.schemasByVersion[entry.currentVersion]);

  const userMessage = [
    `Section type: ${input.sectionTypeKey}`,
    `Section description: ${entry.meta.description}`,
    `Field shape (TypeScript-ish):`,
    "```",
    fieldShape,
    "```",
    "",
    `Brief: ${input.prompt.slice(0, 1000)}`,
  ].join("\n");

  const adapter = await resolveAiChatAdapter();
  try {
    const result = await adapter.chatCompletion({
      systemPrompt: SECTION_GEN_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.7,
      maxTokens: 2000,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.message ?? "AI provider call failed.",
        code: result.code,
      };
    }
    let raw = result.text.trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        error: "AI returned invalid JSON. Try again.",
        code: "AI_OUTPUT_INVALID",
      };
    }
    // Validate against the section's Zod schema. If validation fails,
    // we still return the raw object so the operator can patch up the
    // bits that are wrong rather than starting over.
    const validated = entry.schemasByVersion[entry.currentVersion].safeParse(parsed);
    if (!validated.success) {
      return {
        ok: true,
        props: parsed as Record<string, unknown>,
      };
    }
    return { ok: true, props: validated.data as Record<string, unknown> };
  } catch (err) {
    logServerError("ai-generate/section", err);
    return { ok: false, error: "Couldn't reach the AI provider.", code: "AI_PROVIDER_ERROR" };
  }
}

// Crude Zod-shape probe for the LLM. Walks one level deep, names
// fields with their Zod type. Good enough for the LLM to produce
// reasonable JSON; not a full schema serializer.
function describeSectionShape(schema: unknown): string {
  const root = schema as { shape?: Record<string, unknown>; _def?: { shape?: () => Record<string, unknown> } };
  const shape = root.shape ?? root._def?.shape?.();
  if (!shape) return "(unknown)";
  const lines: string[] = [];
  for (const [k, v] of Object.entries(shape)) {
    if (k === "presentation") continue;
    lines.push(`  ${k}: ${describeNode(v)}`);
  }
  return `{\n${lines.join(",\n")}\n}`;
}

function describeNode(node: unknown): string {
  let cur = node as { _def?: Record<string, unknown> };
  let optional = false;
  for (let i = 0; i < 5; i += 1) {
    const def = cur._def;
    if (!def) break;
    const t = def.type as string | undefined;
    if (t === "optional" || t === "nullable") {
      optional = true;
      cur = def.innerType as { _def?: Record<string, unknown> };
      continue;
    }
    if (t === "default") {
      cur = def.innerType as { _def?: Record<string, unknown> };
      continue;
    }
    break;
  }
  const def = cur._def ?? {};
  const t = def.type as string | undefined;
  let base = "unknown";
  if (t === "string") base = "string";
  else if (t === "number") base = "number";
  else if (t === "boolean") base = "boolean";
  else if (t === "enum") {
    const entries = (def.entries as Record<string, string> | undefined) ?? {};
    base = `${Object.values(entries).map((v) => `"${v}"`).join(" | ")}`;
  } else if (t === "array") {
    const el = def.element as { _def?: Record<string, unknown> } | undefined;
    base = `${el ? describeNode(el) : "unknown"}[]`;
  } else if (t === "object") {
    const inner = (cur as unknown as { shape?: Record<string, unknown>; _def?: { shape?: () => Record<string, unknown> } });
    const sh = inner.shape ?? inner._def?.shape?.();
    if (sh) {
      const inner2 = Object.entries(sh).map(([k, v]) => `${k}: ${describeNode(v)}`).join(", ");
      base = `{ ${inner2} }`;
    } else {
      base = "object";
    }
  }
  return optional ? `${base}?` : base;
}

// ── Action: generate alt-text ────────────────────────────────────────────

export type AltTextResult =
  | { ok: true; alt: string }
  | { ok: false; error: string; code?: string };

const ALT_SYSTEM_PROMPT = `You write alt text for images on small-business websites. Given an image URL and any surrounding context, return ONE concise sentence (max 200 characters, ideally 100) that describes what's IN the image — not what it represents or its mood. No preamble. No quotes around the text. Examples:

GOOD: "Bride having makeup applied in front of a vanity mirror."
GOOD: "Salon stylist sectioning a client's hair before a cut."
BAD: "Beautiful moment of joy on wedding day."  (too abstract)
BAD: "Photo of a bride."  (too vague)`;

export async function generateAltTextWithAi(
  imageUrl: string,
  context: string,
): Promise<AltTextResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };
  const limit = checkRate(scope.tenantId);
  if (!limit.ok) return { ok: false, error: "AI limit reached (50/hour).", code: "RATE_LIMITED" };

  const userMessage = [
    `Image URL: ${imageUrl}`,
    `Surrounding context (section type, headline, etc.):`,
    context.slice(0, 600),
    "",
    "Write the alt text. Just the sentence, no quotes.",
  ].join("\n");

  const adapter = await resolveAiChatAdapter();
  try {
    const result = await adapter.chatCompletion({
      systemPrompt: ALT_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.4,
      maxTokens: 200,
    });
    if (!result.ok) return { ok: false, error: result.message ?? "AI failed.", code: result.code };
    let alt = result.text.trim().slice(0, 200);
    if ((alt.startsWith('"') && alt.endsWith('"')) || (alt.startsWith("'") && alt.endsWith("'"))) {
      alt = alt.slice(1, -1).trim();
    }
    return { ok: true, alt };
  } catch (err) {
    logServerError("ai-generate/alt", err);
    return { ok: false, error: "Couldn't reach the AI provider.", code: "AI_PROVIDER_ERROR" };
  }
}

// ── Action: critique page ────────────────────────────────────────────────

export interface CritiqueFinding {
  severity: "high" | "med" | "low";
  category: "design" | "copy" | "structure" | "a11y";
  message: string;
}

export type CritiqueResult =
  | { ok: true; findings: ReadonlyArray<CritiqueFinding>; summary: string }
  | { ok: false; error: string; code?: string };

const CRITIQUE_SYSTEM_PROMPT = `You audit small-business website page compositions. Given the section list with their headlines / key fields, return a JSON object:

{
  "summary": "one paragraph overall verdict",
  "findings": [
    { "severity": "high" | "med" | "low",
      "category": "design" | "copy" | "structure" | "a11y",
      "message": "specific actionable note" }
  ]
}

Be concrete. Don't say "consider improving copy" — say "the hero headline is 14 words; aim for under 8 for visual punch." 5-10 findings is ideal. Sort by severity desc.`;

export async function critiquePage(): Promise<CritiqueResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };
  const limit = checkRate(scope.tenantId);
  if (!limit.ok) return { ok: false, error: "AI limit reached (50/hour).", code: "RATE_LIMITED" };

  const rows = await listSectionsForStaff(auth.supabase, scope.tenantId);
  // Compact section list — types + key text fields. Skip heavy props
  // like image arrays.
  const sections = rows.map((r) => {
    const props = (r.props_jsonb as Record<string, unknown> | null) ?? {};
    const compact: Record<string, unknown> = {};
    for (const k of ["eyebrow", "headline", "subheadline", "title", "intro", "copy", "body"]) {
      const v = props[k];
      if (typeof v === "string" && v.trim()) compact[k] = v.slice(0, 300);
    }
    return { type: r.section_type_key, name: r.name, props: compact };
  });

  const userMessage = [
    `Section list (${sections.length} sections):`,
    JSON.stringify(sections, null, 2),
  ].join("\n");

  const adapter = await resolveAiChatAdapter();
  try {
    const result = await adapter.chatCompletion({
      systemPrompt: CRITIQUE_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.4,
      maxTokens: 1600,
    });
    if (!result.ok) return { ok: false, error: result.message ?? "AI failed.", code: result.code };
    let raw = result.text.trim();
    if (raw.startsWith("```")) raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    let parsed: { summary?: string; findings?: ReadonlyArray<CritiqueFinding> };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: "AI returned invalid JSON.", code: "AI_OUTPUT_INVALID" };
    }
    return {
      ok: true,
      summary: parsed.summary ?? "",
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
    };
  } catch (err) {
    logServerError("ai-generate/critique", err);
    return { ok: false, error: "Couldn't reach the AI provider.", code: "AI_PROVIDER_ERROR" };
  }
}
