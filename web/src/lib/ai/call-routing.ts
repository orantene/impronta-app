/**
 * Per-call AI routing (Phase 9). One model per kind of call, chosen from a
 * measured bake-off (`scripts/onboarding-qa/ai-bakeoff.mts`), editable in
 * Operations without a deploy. "auto" means the global chat provider and its
 * default model, exactly as before this existed.
 *
 * Pure module: option list, parsing, provider-from-model. The DB read and the
 * adapter live in `call-routing.server.ts`.
 */

export const AI_ROUTED_CALLS = ["extraction", "copy", "critic", "helper"] as const;
export type AiRoutedCall = (typeof AI_ROUTED_CALLS)[number];

export const AI_ROUTE_SETTING_KEYS: Record<AiRoutedCall, string> = {
  extraction: "ai_route_extraction",
  copy: "ai_route_copy",
  critic: "ai_route_critic",
  helper: "ai_route_helper",
};

export const AI_ROUTE_AUTO = "auto";

/** Models the admin can pick. Rates live in `ai-model-costs.ts`; keep both lists in step. */
export const AI_ROUTE_MODEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: AI_ROUTE_AUTO, label: "Auto (global provider)" },
  { value: "claude-sonnet-5", label: "Claude Sonnet 5 (best writing)" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fast, accurate facts)" },
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { value: "gpt-4o-mini", label: "GPT-4o mini" },
];

/**
 * What the bake-off chose (2026-09-17): Haiku for facts (recall 0.70 vs 0.44,
 * 2.9 s vs 5.4 s), Sonnet for the one writing call (specific headlines; the
 * cheap models wrote the same line for three different businesses), Haiku for
 * judging and for edits where the person is tapping and waiting.
 */
export const AI_ROUTE_RECOMMENDED: Record<AiRoutedCall, string> = {
  extraction: "claude-haiku-4-5-20251001",
  copy: "claude-sonnet-5",
  critic: "claude-haiku-4-5-20251001",
  helper: "claude-haiku-4-5-20251001",
};

export type AiRouteProvider = "anthropic" | "openai";

export function providerForModel(model: string): AiRouteProvider | null {
  const m = model.trim().toLowerCase();
  if (m.startsWith("claude")) return "anthropic";
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) return "openai";
  return null;
}

export function isKnownRouteModel(value: unknown): value is string {
  return typeof value === "string" && AI_ROUTE_MODEL_OPTIONS.some((o) => o.value === value && o.value !== AI_ROUTE_AUTO);
}

/** Setting value → model id, or null for auto / unknown. */
export function parseRouteValue(value: unknown): string | null {
  if (typeof value === "string") return isKnownRouteModel(value) ? value : null;
  if (value && typeof value === "object" && "model" in value) return parseRouteValue((value as { model: unknown }).model);
  return null;
}
