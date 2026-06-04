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

/** List every configured integration row for a tenant. Empty array on failure. */
export async function listTenantIntegrations(
  tenantId: string,
): Promise<TenantIntegrationRow[]> {
  const supabase = service();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("tenant_integrations")
    .select("*")
    .eq("tenant_id", tenantId);
  if (error || !data) return [];
  return data as TenantIntegrationRow[];
}

/**
 * Merge a partial set of PUBLIC config values into the integration's config_json
 * (read-modify-write so untouched keys survive). Optionally update status /
 * verified-at / error in the same upsert. Returns the resulting row or null.
 *
 * Use ONLY for public identifiers (GA4 measurement IDs, pixel/partner/container
 * IDs). Secrets never go through config_json — use setSecret().
 *
 * A partialConfig value of `null` (or `undefined`) DELETES that key from the
 * merged config (a clear), so callers can null-out an identifier without an
 * extra round-trip.
 */
export async function setIntegrationConfig(
  tenantId: string,
  key: string,
  partialConfig: Record<string, unknown>,
  opts?: {
    status?: TenantIntegrationRow["status"];
    connectionMethod?: TenantIntegrationRow["connection_method"];
    lastVerifiedAt?: string | null;
    lastError?: string | null;
    actorId?: string | null;
  },
): Promise<TenantIntegrationRow | null> {
  const existing = await getTenantIntegration(tenantId, key);
  const mergedConfig: Record<string, unknown> = {
    ...(existing?.config_json ?? {}),
  };
  for (const [k, v] of Object.entries(partialConfig)) {
    if (v === null || v === undefined) delete mergedConfig[k];
    else mergedConfig[k] = v;
  }
  return upsertTenantIntegration({
    tenantId,
    key,
    configJson: mergedConfig,
    status: opts?.status,
    connectionMethod: opts?.connectionMethod,
    lastVerifiedAt: opts?.lastVerifiedAt,
    lastError: opts?.lastError,
    actorId: opts?.actorId,
  });
}

/**
 * Switch the credential_mode (inherit | custom) for a (tenant, integration).
 * Returns the resulting row or null. Does not touch secrets or config_json.
 */
export async function setCredentialMode(
  tenantId: string,
  key: string,
  mode: "inherit" | "custom",
  actorId?: string | null,
): Promise<TenantIntegrationRow | null> {
  return upsertTenantIntegration({
    tenantId,
    key,
    credentialMode: mode,
    actorId,
  });
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
 * Read the NON-SENSITIVE secret status for a (tenant, integration, field):
 * whether a secret is stored and its last4. NEVER returns the ciphertext or
 * plaintext — this is the only secret-table read that is safe to surface to a
 * (server-side, staff-gated) UI loader.
 */
export async function getSecretStatus(
  tenantId: string,
  key: string,
  secretField: string,
): Promise<{ present: boolean; last4: string | null }> {
  const supabase = service();
  if (!supabase) return { present: false, last4: null };
  const { data, error } = await supabase
    .from("tenant_integration_secrets")
    .select("last4")
    .eq("tenant_id", tenantId)
    .eq("integration_key", key)
    .eq("secret_field", secretField)
    .maybeSingle();
  if (error || !data) return { present: false, last4: null };
  return { present: true, last4: (data as { last4: string | null }).last4 ?? null };
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

/**
 * Read the two plan-entitlement flags the integrations hub gates on
 * (custom_css_allowed → custom_code; white_label_email → email_domain). Missing
 * row / failure → both false (fail closed). Service-role read.
 */
export async function getIntegrationEntitlements(
  tenantId: string,
): Promise<{ custom_css_allowed: boolean; white_label_email: boolean }> {
  const supabase = service();
  if (!supabase) return { custom_css_allowed: false, white_label_email: false };
  const { data, error } = await supabase
    .from("agency_entitlements")
    .select("custom_css_allowed, white_label_email")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) {
    return { custom_css_allowed: false, white_label_email: false };
  }
  const row = data as {
    custom_css_allowed: boolean | null;
    white_label_email: boolean | null;
  };
  return {
    custom_css_allowed: row.custom_css_allowed === true,
    white_label_email: row.white_label_email === true,
  };
}

/**
 * True when the tenant (workspace/agency) has a connected Stripe payout
 * account. Read-only; service role. Used to give the surfaced "Stripe payouts"
 * link card a live connected/not-set status.
 */
export async function tenantHasConnectedPayoutAccount(
  tenantId: string,
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("payout_accounts")
    .select("status")
    .eq("tenant_id", tenantId)
    .eq("owner_type", "agency")
    .is("disconnected_at", null)
    .limit(1);
  if (error || !data || data.length === 0) return false;
  const status = (data[0] as { status: string | null }).status ?? "";
  return status === "connected" || status === "enabled";
}

/**
 * True when the tenant has an active/verified custom domain row. Read-only;
 * service role. Used for the surfaced "Custom domain" link card status.
 */
export async function tenantHasCustomDomain(tenantId: string): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("agency_domains")
    .select("status")
    .eq("tenant_id", tenantId)
    .limit(5);
  if (error || !data || data.length === 0) return false;
  return data.some((r) => {
    const status = (r as { status: string | null }).status ?? "";
    return status === "verified" || status === "active" || status === "connected";
  });
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
