import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  decryptSecret,
  encryptSecret,
  maskApiKey,
} from "@/lib/ai/credential-vault";

/**
 * Tenant Integrations — server-only DB access (mirrors ai-provider-repository).
 *
 * Runs under the service role (bypasses RLS) for runtime key resolution and
 * trusted server-action writes. Callers must enforce their own tenant-scoping /
 * staff checks before calling the write functions. Read/resolve paths only ever
 * return the row for the explicit tenantId passed in.
 *
 * Style mirrors ai-provider-repository: local `service()` helper, null-guarded,
 * `.maybeSingle()`, no thrown errors (null/false on failure).
 */

export type TenantIntegrationRow = {
  id: string;
  tenant_id: string;
  integration_key: string;
  credential_mode: "inherit" | "custom";
  status: "not_configured" | "inherited" | "connected" | "error" | "disabled";
  config_json: Record<string, unknown>;
  connection_method: "inherit" | "manual" | "oauth";
  last_verified_at: string | null;
  last_error: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantIntegrationSecretRow = {
  id: string;
  tenant_id: string;
  integration_key: string;
  secret_field: string;
  ciphertext: string;
  last4: string | null;
  created_at: string;
  updated_at: string;
};

function service() {
  return createServiceRoleClient();
}

/** Fetch the config row for a (tenant, integration). Null if absent/unconfigured. */
export async function getTenantIntegration(
  tenantId: string,
  key: string,
): Promise<TenantIntegrationRow | null> {
  const supabase = service();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("tenant_integrations")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("integration_key", key)
    .maybeSingle();
  if (error || !data) return null;
  return data as TenantIntegrationRow;
}

export type UpsertTenantIntegrationInput = {
  tenantId: string;
  key: string;
  credentialMode?: "inherit" | "custom";
  status?: TenantIntegrationRow["status"];
  configJson?: Record<string, unknown>;
  connectionMethod?: "inherit" | "manual" | "oauth";
  lastVerifiedAt?: string | null;
  lastError?: string | null;
  actorId?: string | null;
};

/**
 * Insert or update the (tenant, integration) config row. Upserts on the
 * (tenant_id, integration_key) unique constraint. Only the provided fields are
 * written; omitted fields fall back to column defaults on insert and are left
 * unchanged on update (the DB upsert applies the merged row, so we read-modify
 * lightly to preserve untouched columns).
 */
export async function upsertTenantIntegration(
  input: UpsertTenantIntegrationInput,
): Promise<TenantIntegrationRow | null> {
  const supabase = service();
  if (!supabase) return null;

  const existing = await getTenantIntegration(input.tenantId, input.key);

  const row: Record<string, unknown> = {
    tenant_id: input.tenantId,
    integration_key: input.key,
    credential_mode:
      input.credentialMode ?? existing?.credential_mode ?? "inherit",
    status: input.status ?? existing?.status ?? "not_configured",
    config_json: input.configJson ?? existing?.config_json ?? {},
    connection_method:
      input.connectionMethod ?? existing?.connection_method ?? "manual",
    updated_by: input.actorId ?? existing?.updated_by ?? null,
  };
  if (input.lastVerifiedAt !== undefined) {
    row.last_verified_at = input.lastVerifiedAt;
  }
  if (input.lastError !== undefined) {
    row.last_error = input.lastError;
  }
  if (!existing) {
    row.created_by = input.actorId ?? null;
  }

  const { data, error } = await supabase
    .from("tenant_integrations")
    .upsert(row, { onConflict: "tenant_id,integration_key" })
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return data as TenantIntegrationRow;
}

/**
 * Decrypt and return the plaintext secret for a (tenant, integration, field).
 * Null when absent or undecryptable.
 */
export async function getDecryptedSecret(
  tenantId: string,
  key: string,
  secretField: string,
): Promise<string | null> {
  const supabase = service();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("tenant_integration_secrets")
    .select("ciphertext")
    .eq("tenant_id", tenantId)
    .eq("integration_key", key)
    .eq("secret_field", secretField)
    .maybeSingle();
  if (error || !data) return null;
  const ciphertext = (data as { ciphertext: string }).ciphertext;
  if (!ciphertext) return null;
  return decryptSecret(ciphertext);
}

/**
 * Encrypt and store (upsert) a secret for a (tenant, integration, field),
 * recording a non-sensitive last4 for display. Returns false on any failure.
 */
export async function setSecret(
  tenantId: string,
  key: string,
  secretField: string,
  plaintext: string,
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  const trimmed = plaintext.trim();
  if (!trimmed) return false;

  const ciphertext = encryptSecret(trimmed);
  // maskApiKey returns "••••<last4>"; persist only the trailing 4 chars.
  const masked = maskApiKey(trimmed);
  const last4 = masked.replace(/[^0-9A-Za-z]/g, "").slice(-4) || null;

  const { error } = await supabase
    .from("tenant_integration_secrets")
    .upsert(
      {
        tenant_id: tenantId,
        integration_key: key,
        secret_field: secretField,
        ciphertext,
        last4,
      },
      { onConflict: "tenant_id,integration_key,secret_field" },
    );
  return !error;
}

/** Delete a stored secret. Returns false on failure. */
export async function deleteSecret(
  tenantId: string,
  key: string,
  secretField: string,
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  const { error } = await supabase
    .from("tenant_integration_secrets")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("integration_key", key)
    .eq("secret_field", secretField);
  return !error;
}
