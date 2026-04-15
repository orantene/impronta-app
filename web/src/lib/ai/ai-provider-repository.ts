import { createServiceRoleClient } from "@/lib/supabase/admin";
import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";
import { decryptSecret } from "@/lib/ai/credential-vault";

export type AiCredentialMode = "platform" | "agency" | "inherit";

export type AiProviderRegistryKind = "none" | "openai" | "anthropic" | "custom";

export type AiProviderInstanceRow = {
  id: string;
  tenant_id: string;
  kind: AiProviderRegistryKind;
  label: string;
  is_default: boolean;
  disabled: boolean;
  sort_order: number;
  credential_source: AiCredentialMode;
  credential_ui_state: string;
  credential_masked_hint: string | null;
};

export type AiTenantControlsRow = {
  tenant_id: string;
  credential_mode: AiCredentialMode;
  monthly_spend_cap_cents: number | null;
  warn_threshold_percent: number | null;
  hard_stop_on_cap: boolean;
  max_requests_per_minute: number | null;
  max_requests_per_month: number | null;
  provider_unavailable_behavior: "graceful" | "strict";
};

async function service() {
  return createServiceRoleClient();
}

export async function fetchTenantControls(
  tenantId: string = DEFAULT_AI_TENANT_ID,
): Promise<AiTenantControlsRow | null> {
  const supabase = await service();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("ai_tenant_controls")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return data as AiTenantControlsRow;
}

export async function listProviderInstances(
  tenantId: string = DEFAULT_AI_TENANT_ID,
): Promise<AiProviderInstanceRow[]> {
  const supabase = await service();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("ai_provider_instances")
    .select(
      "id, tenant_id, kind, label, is_default, disabled, sort_order, credential_source, credential_ui_state, credential_masked_hint",
    )
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data as AiProviderInstanceRow[];
}

export async function getDefaultProviderInstance(
  tenantId: string = DEFAULT_AI_TENANT_ID,
): Promise<AiProviderInstanceRow | null> {
  const supabase = await service();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("ai_provider_instances")
    .select(
      "id, tenant_id, kind, label, is_default, disabled, sort_order, credential_source, credential_ui_state, credential_masked_hint",
    )
    .eq("tenant_id", tenantId)
    .eq("is_default", true)
    .maybeSingle();
  if (error || !data) return null;
  return data as AiProviderInstanceRow;
}

export async function getProviderInstanceByKind(
  kind: AiProviderRegistryKind,
  tenantId: string = DEFAULT_AI_TENANT_ID,
): Promise<AiProviderInstanceRow | null> {
  const supabase = await service();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("ai_provider_instances")
    .select(
      "id, tenant_id, kind, label, is_default, disabled, sort_order, credential_source, credential_ui_state, credential_masked_hint",
    )
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .eq("disabled", false)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as AiProviderInstanceRow;
}

export async function getDecryptedSecretForInstance(instanceId: string): Promise<string | null> {
  const supabase = await service();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("ai_provider_secrets")
    .select("ciphertext")
    .eq("provider_instance_id", instanceId)
    .maybeSingle();
  if (error || !data?.ciphertext || typeof data.ciphertext !== "string") return null;
  return decryptSecret(data.ciphertext);
}

export function effectiveCredentialMode(
  instance: Pick<AiProviderInstanceRow, "credential_source">,
  tenant: Pick<AiTenantControlsRow, "credential_mode"> | null,
): AiCredentialMode {
  if (instance.credential_source !== "inherit") {
    return instance.credential_source;
  }
  return tenant?.credential_mode ?? "inherit";
}

export function resolveKeyForMode(
  mode: AiCredentialMode,
  dbKey: string | null,
  envKey: string | null,
): string | null {
  if (mode === "platform") return envKey?.trim() || null;
  if (mode === "agency") return dbKey?.trim() || null;
  const d = dbKey?.trim() || null;
  const e = envKey?.trim() || null;
  return d ?? e;
}
