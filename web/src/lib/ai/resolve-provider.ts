import type { AiProviderAdapter, AiProviderId } from "@/lib/ai/provider";
import { createAnthropicChatAdapter } from "@/lib/ai/providers/anthropic-adapter";
import { createDisabledChatAdapter } from "@/lib/ai/providers/disabled-chat-adapter";
import { createOpenAiChatAdapter } from "@/lib/ai/providers/openai-adapter";
import { resolveAnthropicApiKey, resolveDefaultRegistryKind, resolveOpenAiApiKey } from "@/lib/ai/resolve-api-keys";

export type ResolvedAiChatKind = "openai" | "anthropic" | "none" | "custom";

/**
 * When set to `openai` or `anthropic`, overrides DB registry for all chat completions.
 */
export function getEnvAiProviderOverride(): AiProviderId | null {
  const env = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (env === "anthropic" || env === "openai") return env;
  return null;
}

export async function getResolvedAiChatKind(): Promise<ResolvedAiChatKind> {
  const override = getEnvAiProviderOverride();
  if (override === "anthropic") return "anthropic";
  if (override === "openai") return "openai";

  const kind = await resolveDefaultRegistryKind();
  if (kind === "anthropic") return "anthropic";
  if (kind === "openai") return "openai";
  if (kind === "none") return "none";
  return "custom";
}

/** Back-compat: maps non-OpenAI chat kinds to `openai` for legacy call sites that only typed OpenAI | Anthropic. */
export async function getResolvedAiProviderId(): Promise<AiProviderId> {
  const k = await getResolvedAiChatKind();
  return k === "anthropic" ? "anthropic" : "openai";
}

export function adapterForProvider(id: AiProviderId, apiKey?: string | null): AiProviderAdapter {
  return id === "anthropic"
    ? createAnthropicChatAdapter(apiKey)
    : createOpenAiChatAdapter(apiKey);
}

export async function resolveAiChatAdapter(): Promise<AiProviderAdapter> {
  const kind = await getResolvedAiChatKind();
  if (kind === "none" || kind === "custom") {
    return createDisabledChatAdapter(kind);
  }
  if (kind === "anthropic") {
    const key = await resolveAnthropicApiKey();
    return createAnthropicChatAdapter(key);
  }
  const key = await resolveOpenAiApiKey();
  return createOpenAiChatAdapter(key);
}

/** True when the active chat provider has a usable API key (ignores master toggle). */
export async function isResolvedAiChatConfigured(): Promise<boolean> {
  const kind = await getResolvedAiChatKind();
  if (kind === "none" || kind === "custom") return false;
  if (kind === "anthropic") {
    return Boolean((await resolveAnthropicApiKey())?.trim());
  }
  return Boolean((await resolveOpenAiApiKey())?.trim());
}
