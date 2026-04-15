import {
  effectiveCredentialMode,
  fetchTenantControls,
  getDecryptedSecretForInstance,
  getDefaultProviderInstance,
  getProviderInstanceByKind,
  resolveKeyForMode,
  type AiProviderRegistryKind,
} from "@/lib/ai/ai-provider-repository";
import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";

function envOpenAi(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

function envAnthropic(): string | null {
  return process.env.ANTHROPIC_API_KEY?.trim() || null;
}

async function resolvedKeyForOpenAiInstance(
  tenantId: string = DEFAULT_AI_TENANT_ID,
): Promise<string | null> {
  const tenant = await fetchTenantControls(tenantId);
  const inst = await getProviderInstanceByKind("openai", tenantId);
  if (!inst) {
    const mode = effectiveCredentialMode({ credential_source: "inherit" }, tenant);
    return resolveKeyForMode(mode, null, envOpenAi());
  }
  const mode = effectiveCredentialMode(inst, tenant);
  const db = await getDecryptedSecretForInstance(inst.id);
  return resolveKeyForMode(mode, db, envOpenAi());
}

async function resolvedKeyForAnthropicInstance(
  tenantId: string = DEFAULT_AI_TENANT_ID,
): Promise<string | null> {
  const tenant = await fetchTenantControls(tenantId);
  const inst = await getProviderInstanceByKind("anthropic", tenantId);
  if (!inst || inst.disabled) {
    const mode = effectiveCredentialMode(
      { credential_source: "inherit" },
      tenant,
    );
    return resolveKeyForMode(mode, null, envAnthropic());
  }
  const mode = effectiveCredentialMode(inst, tenant);
  const db = await getDecryptedSecretForInstance(inst.id);
  return resolveKeyForMode(mode, db, envAnthropic());
}

/**
 * OpenAI API key for embeddings + OpenAI-native chat. Uses the OpenAI registry row (or env fallback).
 */
export async function resolveOpenAiApiKey(
  tenantId: string = DEFAULT_AI_TENANT_ID,
): Promise<string | null> {
  return resolvedKeyForOpenAiInstance(tenantId);
}

export async function resolveAnthropicApiKey(
  tenantId: string = DEFAULT_AI_TENANT_ID,
): Promise<string | null> {
  return resolvedKeyForAnthropicInstance(tenantId);
}

/**
 * Effective chat provider kind from the default registry row (falls back to settings-driven behavior in resolve-provider).
 */
export async function resolveDefaultRegistryKind(
  tenantId: string = DEFAULT_AI_TENANT_ID,
): Promise<AiProviderRegistryKind> {
  const def = await getDefaultProviderInstance(tenantId);
  if (def && !def.disabled) return def.kind;
  return "openai";
}
