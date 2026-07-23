/**
 * AIQ-19 — LLM-judge rubric pass for the AI page-builder eval. One Opus call per
 * case (opt-in via the runner's --judge flag), scoring the generated page on 7
 * axes 1-5 in strict JSON. Reuses the existing Anthropic adapter (no new SDK
 * use). BUILD-ONLY execution (needs ANTHROPIC_API_KEY); serializeTree +
 * validateScores are pure and unit-tested.
 */
import { createAnthropicChatAdapter } from "../../src/lib/ai/providers/anthropic-adapter";
import { parseModelJson } from "../../src/lib/site-admin/builder-core/ai/generate-nodes";
import type { JsonSchemaForChat } from "../../src/lib/ai/provider";
import type { BuilderNode } from "../../src/lib/site-admin/builder-node/types";

export const JUDGE_AXES = [
  "copy_voice",
  "hierarchy",
  "component_fit",
  "readability",
  "responsiveness",
  "brand",
  "premium_feel",
] as const;
export type JudgeAxis = (typeof JUDGE_AXES)[number];
export type JudgeScores = { axes: Record<JudgeAxis, number>; mean: number; notes: string };

/** Compact one-line-per-node serialization of the generated tree for the judge. */
export function serializeTree(tree: ReadonlyArray<BuilderNode>): string {
  const walk = (n: BuilderNode, depth: number): string => {
    const p = (n as { props?: Record<string, unknown> }).props ?? {};
    const style = (p.style as Record<string, unknown>) ?? {};
    const bits = [
      p.text,
      p.label,
      p.title,
      p.level ? `h${p.level}` : null,
      style.tone,
      style.background,
      p.role,
      p.icon,
      p.variant,
      p.tone,
    ].filter(Boolean);
    let line = `${"  ".repeat(depth)}${n.kind}${bits.length ? ` [${bits.join(" · ")}]` : ""}`;
    // Data-array props are the CONTENT of these kinds — without serializing them
    // the judge sees an "empty placeholder" and scores component_fit ~2 for a
    // fully-populated table/form (verified on the first live run).
    if (n.kind === "pricing_table" && Array.isArray(p.tiers)) {
      for (const t of p.tiers as Array<Record<string, unknown>>) {
        line += `\n${"  ".repeat(depth + 1)}tier [${[t.name, t.price, t.period, t.highlighted ? "highlighted" : null, Array.isArray(t.features) ? `${(t.features as unknown[]).length} features` : null, t.ctaLabel].filter(Boolean).join(" · ")}]`;
      }
    }
    if (n.kind === "form" && Array.isArray(p.fields)) {
      for (const f of p.fields as Array<Record<string, unknown>>) {
        line += `\n${"  ".repeat(depth + 1)}field [${[f.type, f.label, f.required ? "required" : null].filter(Boolean).join(" · ")}]`;
      }
    }
    const kids = (n as { children?: BuilderNode[] }).children ?? [];
    return [line, ...kids.map((c) => walk(c, depth + 1))].join("\n");
  };
  return tree.map((n) => walk(n, 0)).join("\n");
}

/** Pure guard: every axis must be an integer in [1,5]; returns null on malformed input. */
export function validateScores(parsed: unknown): JudgeScores | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const axes = {} as Record<JudgeAxis, number>;
  for (const axis of JUDGE_AXES) {
    const v = obj[axis];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) return null;
    axes[axis] = v;
  }
  const mean = JUDGE_AXES.reduce((sum, a) => sum + axes[a], 0) / JUDGE_AXES.length;
  const notes = typeof obj.notes === "string" ? obj.notes : "";
  return { axes, mean: Number(mean.toFixed(2)), notes };
}

const JUDGE_SYSTEM =
  'You are a senior brand designer scoring a generated website page for a boutique talent agency. Score STRICTLY on a 1 to 5 integer scale (5 = ships as-is to a paying client; 1 = unusable). Judge only what the serialized tree shows. Axes: copy_voice (specific, on-brand, no "Lorem"/"Learn more"), hierarchy (one clear H1, sane heading levels, eyebrow to heading rhythm), component_fit (right block for the job), readability (legible tone/contrast intent), responsiveness (layouts that reflow, no fixed columns that break on mobile), brand (client/book/inquire/roster language, never buyer/cart/SKU), premium_feel (restraint, taste, editorial polish). Respond with the JSON object only.';

const JUDGE_SCHEMA: JsonSchemaForChat = {
  name: "page_rubric",
  schema: {
    type: "object",
    required: [...JUDGE_AXES, "notes"],
    properties: {
      ...Object.fromEntries(JUDGE_AXES.map((a) => [a, { type: "integer", minimum: 1, maximum: 5 }])),
      notes: { type: "string" },
    },
  },
};

/** BUILD-ONLY: needs ANTHROPIC_API_KEY. Returns null on any provider/parse failure. */
export async function judgeCase(brief: string, tree: ReadonlyArray<BuilderNode>): Promise<JudgeScores | null> {
  const adapter = createAnthropicChatAdapter();
  const res = await adapter.chatCompletion({
    systemPrompt: JUDGE_SYSTEM,
    userMessage: `Brief: ${brief}\n\nPage:\n${serializeTree(tree)}`,
    jsonSchema: JUDGE_SCHEMA,
    maxTokens: 4000,
    model: "claude-opus-4-8",
    thinking: true,
  });
  if (!res.ok) return null;
  return validateScores(parseModelJson(res.text));
}
