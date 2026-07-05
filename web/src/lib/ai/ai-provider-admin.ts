import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";
import { encryptSecret, isCredentialEncryptionConfigured, maskApiKey } from "@/lib/ai/credential-vault";
import { getEnvAiProviderOverride, getResolvedAiChatKind } from "@/lib/ai/resolve-provider";
import { estimateCostUsd } from "@/lib/ai/ai-model-costs";
import { logServerError } from "@/lib/server/safe-error";
import type { AiProviderRegistryKind } from "@/lib/ai/ai-provider-repository";

/**
 * PLATFORM-ADMIN writers + loaders for the global AI provider registry (the row
 * set under {@link DEFAULT_AI_TENANT_ID}). Setting the `is_default` instance's
 * `kind` to `anthropic` + a stored key is what makes "AI_PROVIDER=anthropic"
 * real without an env var (see resolveDefaultRegistryKind).
 *
 * These use the service-role client; every CALLER must be super_admin-gated
 * (the actions layer enforces it). Secrets go IN encrypted, never OUT.
 */

const LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
  none: "Disabled",
  custom: "Custom",
};

export type ProviderConfigKind = "openai" | "anthropic";

async function service() {
  return createServiceRoleClient();
}

async function findInstanceId(
  supabase: NonNullable<Awaited<ReturnType<typeof service>>>,
  kind: ProviderConfigKind,
): Promise<string | null> {
  const { data } = await supabase
    .from("ai_provider_instances")
    .select("id")
    .eq("tenant_id", DEFAULT_AI_TENANT_ID)
    .eq("kind", kind)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export type SaveProviderResult = { ok: true } | { ok: false; error: string };

/**
 * Save an API key for a provider AND make it the active default. Encrypts the
 * key into `ai_provider_secrets`, upserts the provider instance (credential
 * source = agency/DB), sets it as the sole default, and marks it active.
 */
export async function saveAndActivateProvider(
  kind: ProviderConfigKind,
  plaintextKey: string,
): Promise<SaveProviderResult> {
  const key = (plaintextKey ?? "").trim();
  if (key.length < 8) return { ok: false, error: "That key looks too short." };
  if (!isCredentialEncryptionConfigured()) {
    return { ok: false, error: "AI_CREDENTIALS_ENCRYPTION_KEY is not configured on the server." };
  }

  try {
    const supabase = await service();
    if (!supabase) return { ok: false, error: "Database is unavailable." };

    let instanceId = await findInstanceId(supabase, kind);
    const common = {
      kind,
      label: LABELS[kind] ?? kind,
      is_default: true,
      disabled: false,
      credential_source: "agency" as const,
      credential_ui_state: "active" as const,
      credential_masked_hint: maskApiKey(key),
      updated_at: new Date().toISOString(),
    };

    if (instanceId) {
      const { error } = await supabase
        .from("ai_provider_instances")
        .update(common)
        .eq("id", instanceId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("ai_provider_instances")
        .insert({ tenant_id: DEFAULT_AI_TENANT_ID, ...common })
        .select("id")
        .single();
      if (error) throw error;
      instanceId = data.id as string;
    }

    // Only one default in the registry.
    await supabase
      .from("ai_provider_instances")
      .update({ is_default: false })
      .eq("tenant_id", DEFAULT_AI_TENANT_ID)
      .neq("id", instanceId);

    // Upsert the encrypted secret (1:1 with the instance).
    const ciphertext = encryptSecret(key);
    const { data: existingSecret } = await supabase
      .from("ai_provider_secrets")
      .select("id")
      .eq("provider_instance_id", instanceId)
      .maybeSingle();
    if (existingSecret?.id) {
      const { error } = await supabase
        .from("ai_provider_secrets")
        .update({ ciphertext, updated_at: new Date().toISOString() })
        .eq("provider_instance_id", instanceId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("ai_provider_secrets")
        .insert({ provider_instance_id: instanceId, ciphertext, key_version: 1 });
      if (error) throw error;
    }

    return { ok: true };
  } catch (err) {
    logServerError("ai-provider-admin/saveAndActivateProvider", err);
    return { ok: false, error: "Couldn't save. Please try again." };
  }
}

/** Enable/disable a provider instance. Disabling the default removes it from resolution. */
export async function setProviderActive(
  kind: ProviderConfigKind,
  active: boolean,
): Promise<SaveProviderResult> {
  try {
    const supabase = await service();
    if (!supabase) return { ok: false, error: "Database is unavailable." };
    const instanceId = await findInstanceId(supabase, kind);
    if (!instanceId) return { ok: false, error: "That provider is not configured yet." };
    const { error } = await supabase
      .from("ai_provider_instances")
      .update({
        disabled: !active,
        is_default: active,
        credential_ui_state: active ? "active" : "disabled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", instanceId);
    if (error) throw error;
    if (active) {
      await supabase
        .from("ai_provider_instances")
        .update({ is_default: false })
        .eq("tenant_id", DEFAULT_AI_TENANT_ID)
        .neq("id", instanceId);
    }
    return { ok: true };
  } catch (err) {
    logServerError("ai-provider-admin/setProviderActive", err);
    return { ok: false, error: "Couldn't update. Please try again." };
  }
}

// ── Loaders ──────────────────────────────────────────────────────────────────

export type ProviderRow = {
  kind: AiProviderRegistryKind;
  label: string;
  isDefault: boolean;
  disabled: boolean;
  hasKey: boolean;
  maskedHint: string | null;
  uiState: string;
};

export type PlatformAiProviderState = {
  encryptionConfigured: boolean;
  resolvedKind: string;
  envOverride: string | null;
  anthropicModelEnv: string | null;
  providers: ProviderRow[];
};

export async function loadPlatformAiProviderState(): Promise<PlatformAiProviderState> {
  const encryptionConfigured = isCredentialEncryptionConfigured();
  const resolvedKind = await getResolvedAiChatKind().catch(() => "none");
  const envOverride = getEnvAiProviderOverride();
  const anthropicModelEnv = process.env.ANTHROPIC_CHAT_MODEL?.trim() || null;

  const supabase = await service();
  const providers: ProviderRow[] = [];
  if (supabase) {
    const { data: rows } = await supabase
      .from("ai_provider_instances")
      .select("id, kind, label, is_default, disabled, credential_masked_hint, credential_ui_state")
      .eq("tenant_id", DEFAULT_AI_TENANT_ID);
    const { data: secrets } = await supabase
      .from("ai_provider_secrets")
      .select("provider_instance_id");
    const withKey = new Set((secrets ?? []).map((s) => s.provider_instance_id as string));
    for (const r of rows ?? []) {
      providers.push({
        kind: r.kind as AiProviderRegistryKind,
        label: (r.label as string) || LABELS[r.kind as string] || (r.kind as string),
        isDefault: !!r.is_default,
        disabled: !!r.disabled,
        hasKey: withKey.has(r.id as string),
        maskedHint: (r.credential_masked_hint as string | null) ?? null,
        uiState: (r.credential_ui_state as string) ?? "unset",
      });
    }
  }
  return { encryptionConfigured, resolvedKind, envOverride, anthropicModelEnv, providers };
}

export type AiUsageSummary = {
  totalCalls: number;
  okCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  byDay: { day: string; calls: number; costUsd: number }[];
  windowDays: number;
};

/** Aggregate builder-generation usage from cms_ai_usage_log over the last N days. */
export async function loadAiGenerationUsageSummary(windowDays = 30): Promise<AiUsageSummary> {
  const empty: AiUsageSummary = {
    totalCalls: 0,
    okCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    byDay: [],
    windowDays,
  };
  try {
    const supabase = await service();
    if (!supabase) return empty;
    const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("cms_ai_usage_log")
      .select("model, input_tokens, output_tokens, ok, created_at, context_jsonb")
      .eq("tenant_id", DEFAULT_AI_TENANT_ID)
      .eq("action", "generate_section")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error || !data) return empty;

    const dayMap = new Map<string, { calls: number; costUsd: number }>();
    const out = { ...empty, byDay: [] as AiUsageSummary["byDay"] };
    for (const row of data) {
      const ctx = (row.context_jsonb ?? {}) as { feature?: string; cost_usd?: number };
      if (ctx.feature !== "builder_generate") continue;
      out.totalCalls += 1;
      if (row.ok) out.okCalls += 1;
      const inTok = row.input_tokens ?? 0;
      const outTok = row.output_tokens ?? 0;
      out.inputTokens += inTok;
      out.outputTokens += outTok;
      const cost =
        typeof ctx.cost_usd === "number"
          ? ctx.cost_usd
          : estimateCostUsd(row.model, inTok, outTok);
      out.costUsd += cost;
      const day = String(row.created_at).slice(0, 10);
      const d = dayMap.get(day) ?? { calls: 0, costUsd: 0 };
      d.calls += 1;
      d.costUsd += cost;
      dayMap.set(day, d);
    }
    out.byDay = [...dayMap.entries()]
      .map(([day, v]) => ({ day, calls: v.calls, costUsd: v.costUsd }))
      .sort((a, b) => (a.day < b.day ? 1 : -1))
      .slice(0, 14);
    return out;
  } catch (err) {
    logServerError("ai-provider-admin/loadAiGenerationUsageSummary", err);
    return empty;
  }
}
