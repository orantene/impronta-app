import type { AiProviderRegistryKind } from "@/lib/ai/ai-provider-repository";

/**
 * Which chat provider is the default. The DB registry always wins: a default
 * row that is not disabled decides. Only when there is no default row at all
 * (a fresh or isolated database) do the env keys decide, ANTHROPIC first then
 * OPENAI, so a new environment works with nothing but an env key. The env
 * keys are passed as booleans here, never as values.
 */
export function pickDefaultChatKind(
  def: { kind: AiProviderRegistryKind; disabled: boolean } | null,
  env: { anthropic: boolean; openai: boolean },
): AiProviderRegistryKind {
  if (def && !def.disabled) return def.kind;
  if (def) return "openai";
  if (env.anthropic) return "anthropic";
  return "openai";
}
