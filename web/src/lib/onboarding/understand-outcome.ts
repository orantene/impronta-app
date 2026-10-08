/**
 * Pure classification for the understand step: a short sentence is one thing,
 * a missing or failing AI provider is another. Nothing here touches a key or
 * the person's text; the log line carries the kind and the provider id only.
 */

export type UnderstandAiProblem = "ai_not_configured" | "ai_failed";

/** Flags on but no usable chat provider (no DB row, no env key, undecryptable). */
export function classifyProviderState(input: { flagsOn: boolean; configured: boolean }): UnderstandAiProblem | "degrade" | "ready" {
  if (!input.flagsOn) return "degrade";
  return input.configured ? "ready" : "ai_not_configured";
}

/**
 * After an extraction attempt: a failed attempt is an AI problem, never "too
 * little". An ok attempt that found nothing is the person's short text.
 */
export function classifyExtraction(last: { ok: boolean } | null): UnderstandAiProblem | null {
  if (!last || !last.ok) return "ai_failed";
  return null;
}

export function aiProblemLogLine(kind: UnderstandAiProblem, provider: string): string {
  // Allow-list: an unexpected string can never leak into the log.
  const id = provider === "anthropic" || provider === "openai" || provider === "none" || provider === "custom" ? provider : "unknown";
  return `[onboarding.understand] ${kind} provider=${id}`;
}
