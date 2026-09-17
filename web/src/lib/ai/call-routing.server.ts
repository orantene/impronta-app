import "server-only";

import { cache } from "react";

import { createAnthropicChatAdapter } from "@/lib/ai/providers/anthropic-adapter";
import { createOpenAiChatAdapter } from "@/lib/ai/providers/openai-adapter";
import type { AiProviderAdapter } from "@/lib/ai/provider";
import { resolveAnthropicApiKey, resolveOpenAiApiKey } from "@/lib/ai/resolve-api-keys";
import { resolveAiChatAdapter } from "@/lib/ai/resolve-provider";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { AI_ROUTE_SETTING_KEYS, AI_ROUTED_CALLS, parseRouteValue, providerForModel, type AiRoutedCall } from "./call-routing";

export type RoutedChat = {
  /** Adapter with the routed model bound: callers keep calling `chatCompletion` as before. */
  adapter: AiProviderAdapter;
  /** The routed model, or undefined when the adapter's default applies. */
  model: string | undefined;
  /** "routed" when a setting chose the model, "auto" when the global provider did. */
  source: "routed" | "auto";
};

/** One read per request for all four routes. */
const readRoutes = cache(async (): Promise<Partial<Record<AiRoutedCall, string>>> => {
  const sb = createServiceRoleClient();
  if (!sb) return {};
  const keys = AI_ROUTED_CALLS.map((c) => AI_ROUTE_SETTING_KEYS[c]);
  const { data, error } = await sb.from("settings").select("key, value").in("key", keys).is("tenant_id", null);
  if (error) {
    logServerError("ai.call-routing.read", error);
    return {};
  }
  const out: Partial<Record<AiRoutedCall, string>> = {};
  for (const call of AI_ROUTED_CALLS) {
    const row = data?.find((r) => r.key === AI_ROUTE_SETTING_KEYS[call]);
    const model = parseRouteValue(row?.value);
    if (model) out[call] = model;
  }
  return out;
});

/** Binds a model so existing call sites need no change; an explicit `model` in the call still wins. */
function bound(adapter: AiProviderAdapter, model: string): AiProviderAdapter {
  return { ...adapter, chatCompletion: (input) => adapter.chatCompletion({ ...input, model: input.model ?? model }) };
}

/**
 * The adapter and model for one kind of call. A routed model whose provider
 * has no key falls back to the global provider rather than failing, and says
 * so in the server log once per request.
 */
export async function resolveRoutedChat(call: AiRoutedCall): Promise<RoutedChat> {
  const routes = await readRoutes();
  const model = routes[call];
  if (!model) return { adapter: await resolveAiChatAdapter(), model: undefined, source: "auto" };
  const provider = providerForModel(model);
  if (provider === "anthropic") {
    const key = await resolveAnthropicApiKey();
    if (key) return { adapter: bound(createAnthropicChatAdapter(key), model), model, source: "routed" };
  } else if (provider === "openai") {
    const key = await resolveOpenAiApiKey();
    if (key) return { adapter: bound(createOpenAiChatAdapter(key), model), model, source: "routed" };
  }
  logServerError("ai.call-routing.fallback", new Error(`${call}: no key for ${model}; using the global provider`));
  return { adapter: await resolveAiChatAdapter(), model: undefined, source: "auto" };
}

/**
 * The other provider for a call, when it has a key: the failover target after
 * an `api_error` / `quota` / `timeout` on the routed one. Null when only one
 * provider is configured. The failover model is the recommended one for that
 * provider, not the global default, so quality stays measured.
 */
export async function resolveFailoverChat(call: AiRoutedCall, failedProvider: AiProviderAdapter["id"] | string): Promise<RoutedChat | null> {
  const failed = String(failedProvider);
  if (failed !== "anthropic") {
    const key = await resolveAnthropicApiKey();
    if (key) {
      const model = FAILOVER_MODEL.anthropic[call];
      return { adapter: bound(createAnthropicChatAdapter(key), model), model, source: "routed" };
    }
    return null;
  }
  const key = await resolveOpenAiApiKey();
  if (key) {
    const model = FAILOVER_MODEL.openai[call];
    return { adapter: bound(createOpenAiChatAdapter(key), model), model, source: "routed" };
  }
  return null;
}

const FAILOVER_MODEL: Record<"anthropic" | "openai", Record<AiRoutedCall, string>> = {
  anthropic: { extraction: "claude-haiku-4-5-20251001", copy: "claude-sonnet-5", critic: "claude-haiku-4-5-20251001", helper: "claude-haiku-4-5-20251001" },
  openai: { extraction: "gpt-4.1", copy: "gpt-4.1", critic: "gpt-4.1-mini", helper: "gpt-4.1-mini" },
};
