import type { AiProviderAdapter, AiProviderId } from "@/lib/ai/provider";
import { createAnthropicChatAdapter } from "@/lib/ai/providers/anthropic-adapter";
import { createOpenAiChatAdapter } from "@/lib/ai/providers/openai-adapter";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";

/**
 * When set to `openai` or `anthropic`, overrides DB `ai_provider` (hosting / ops).
 */
export function getEnvAiProviderOverride(): AiProviderId | null {
  const env = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (env === "anthropic" || env === "openai") return env;
  return null;
}

export async function getResolvedAiProviderId(): Promise<AiProviderId> {
  const override = getEnvAiProviderOverride();
  if (override) return override;
  const flags = await getAiFeatureFlags();
  return flags.ai_provider;
}

export function adapterForProvider(id: AiProviderId): AiProviderAdapter {
  return id === "anthropic" ? createAnthropicChatAdapter() : createOpenAiChatAdapter();
}

export async function resolveAiChatAdapter(): Promise<AiProviderAdapter> {
  const id = await getResolvedAiProviderId();
  return adapterForProvider(id);
}

/** True when the active provider (DB + optional AI_PROVIDER env) has an API key set. */
export async function isResolvedAiChatConfigured(): Promise<boolean> {
  const id = await getResolvedAiProviderId();
  if (id === "anthropic") {
    return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  }
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
