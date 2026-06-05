import "server-only";

import {
  decryptSecret,
  encryptSecret,
  maskApiKey,
} from "@/lib/ai/credential-vault";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { writeClientTrustLevel } from "@/lib/client-trust/evaluator";
import {
  getClientIntegrationDef,
  type ClientIntegrationConnectionMethod,
  type ClientIntegrationControls,
} from "./catalog";

export type ClientIntegrationStatus =
  | "not_connected"
  | "pending"
  | "connected"
  | "needs_reauth"
  | "error"
  | "disabled";

export type ClientIntegrationRow = {
  id: string;
  user_id: string;
  provider_key: string;
  provider_account_id: string | null;
  provider_account_label: string | null;
  connection_method: ClientIntegrationConnectionMethod;
  status: ClientIntegrationStatus;
  scopes: string[];
  consent_version: string;
  trust_signal_enabled: boolean;
  agency_visible: boolean;
  talent_visible: boolean;
  public_profile_enabled: boolean;
  auto_refresh_enabled: boolean;
  settings_json: Record<string, unknown>;
  metadata_cache: Record<string, unknown>;
  last_sync_at: string | null;
  last_verified_at: string | null;
  last_error: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type UpsertClientIntegrationInput = {
  userId: string;
  providerKey: string;
  providerAccountId?: string | null;
  providerAccountLabel?: string | null;
  connectionMethod?: ClientIntegrationConnectionMethod;
  status?: ClientIntegrationStatus;
  scopes?: string[];
  consentVersion?: string;
  controls?: Partial<ClientIntegrationControls>;
  settingsJson?: Record<string, unknown>;
  metadataCache?: Record<string, unknown>;
  lastSyncAt?: string | null;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
  actorId?: string | null;
};

function service() {
  return createServiceRoleClient();
}

function toControls(row: ClientIntegrationRow): ClientIntegrationControls {
  return {
    trustSignalEnabled: row.trust_signal_enabled,
    agencyVisible: row.agency_visible,
    talentVisible: row.talent_visible,
    publicProfileEnabled: row.public_profile_enabled,
    autoRefreshEnabled: row.auto_refresh_enabled,
  };
}

function applyControls(
  row: Record<string, unknown>,
  controls: Partial<ClientIntegrationControls> | undefined,
) {
  if (!controls) return;
  if (controls.trustSignalEnabled !== undefined) {
    row.trust_signal_enabled = controls.trustSignalEnabled;
  }
  if (controls.agencyVisible !== undefined) {
    row.agency_visible = controls.agencyVisible;
  }
  if (controls.talentVisible !== undefined) {
    row.talent_visible = controls.talentVisible;
  }
  if (controls.publicProfileEnabled !== undefined) {
    row.public_profile_enabled = controls.publicProfileEnabled;
  }
  if (controls.autoRefreshEnabled !== undefined) {
    row.auto_refresh_enabled = controls.autoRefreshEnabled;
  }
}

export function isClientIntegrationVerifiedTrustSignal(
  row: ClientIntegrationRow,
): boolean {
  return (
    row.status === "connected" &&
    row.trust_signal_enabled &&
    row.metadata_cache?.verification_status === "oauth_verified"
  );
}

export async function getClientIntegration(
  userId: string,
  providerKey: string,
): Promise<ClientIntegrationRow | null> {
  const supabase = service();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("client_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider_key", providerKey)
    .maybeSingle();
  if (error || !data) return null;
  return data as ClientIntegrationRow;
}

export async function listClientIntegrations(
  userId: string,
): Promise<ClientIntegrationRow[]> {
  const supabase = service();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("client_integrations")
    .select("*")
    .eq("user_id", userId)
    .order("provider_key", { ascending: true });
  if (error || !data) return [];
  return data as ClientIntegrationRow[];
}

export async function upsertClientIntegration(
  input: UpsertClientIntegrationInput,
): Promise<ClientIntegrationRow | null> {
  const supabase = service();
  if (!supabase) return null;

  const existing = await getClientIntegration(input.userId, input.providerKey);
  const def = getClientIntegrationDef(input.providerKey);
  const existingControls = existing ? toControls(existing) : def?.defaultControls;
  const mergedControls: Partial<ClientIntegrationControls> = {
    ...(existingControls ?? {}),
    ...(input.controls ?? {}),
  };

  const row: Record<string, unknown> = {
    user_id: input.userId,
    provider_key: input.providerKey,
    provider_account_id:
      input.providerAccountId !== undefined
        ? input.providerAccountId
        : existing?.provider_account_id ?? null,
    provider_account_label:
      input.providerAccountLabel !== undefined
        ? input.providerAccountLabel
        : existing?.provider_account_label ?? null,
    connection_method:
      input.connectionMethod ?? existing?.connection_method ?? "manual",
    status: input.status ?? existing?.status ?? "not_connected",
    scopes: input.scopes ?? existing?.scopes ?? [],
    consent_version:
      input.consentVersion ??
      existing?.consent_version ??
      "client-connections-v1",
    settings_json: input.settingsJson ?? existing?.settings_json ?? {},
    metadata_cache: input.metadataCache ?? existing?.metadata_cache ?? {},
    updated_by_user_id: input.actorId ?? existing?.updated_by_user_id ?? null,
  };
  applyControls(row, mergedControls);
  if (input.lastSyncAt !== undefined) row.last_sync_at = input.lastSyncAt;
  if (input.lastVerifiedAt !== undefined) {
    row.last_verified_at = input.lastVerifiedAt;
  }
  if (input.lastError !== undefined) row.last_error = input.lastError;
  if (!existing) row.created_by_user_id = input.actorId ?? null;

  const { data, error } = await supabase
    .from("client_integrations")
    .upsert(row, { onConflict: "user_id,provider_key" })
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return data as ClientIntegrationRow;
}

export async function setClientIntegrationControls(
  userId: string,
  providerKey: string,
  controls: Partial<ClientIntegrationControls>,
  actorId?: string | null,
): Promise<ClientIntegrationRow | null> {
  return upsertClientIntegration({
    userId,
    providerKey,
    controls,
    actorId,
  });
}

export async function getDecryptedClientIntegrationSecret(
  userId: string,
  providerKey: string,
  secretField: string,
): Promise<string | null> {
  const supabase = service();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("client_integration_secrets")
    .select("ciphertext")
    .eq("user_id", userId)
    .eq("provider_key", providerKey)
    .eq("secret_field", secretField)
    .maybeSingle();
  if (error || !data) return null;
  const ciphertext = (data as { ciphertext: string }).ciphertext;
  if (!ciphertext) return null;
  return decryptSecret(ciphertext);
}

export async function getClientIntegrationSecretStatus(
  userId: string,
  providerKey: string,
  secretField: string,
): Promise<{ present: boolean; last4: string | null }> {
  const supabase = service();
  if (!supabase) return { present: false, last4: null };
  const { data, error } = await supabase
    .from("client_integration_secrets")
    .select("last4")
    .eq("user_id", userId)
    .eq("provider_key", providerKey)
    .eq("secret_field", secretField)
    .maybeSingle();
  if (error || !data) return { present: false, last4: null };
  return { present: true, last4: (data as { last4: string | null }).last4 ?? null };
}

export async function setClientIntegrationSecret(
  userId: string,
  providerKey: string,
  secretField: string,
  plaintext: string,
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  const trimmed = plaintext.trim();
  if (!trimmed) return false;
  const ciphertext = encryptSecret(trimmed);
  const masked = maskApiKey(trimmed);
  const last4 = masked.replace(/[^0-9A-Za-z]/g, "").slice(-4) || null;

  const { error } = await supabase
    .from("client_integration_secrets")
    .upsert(
      {
        user_id: userId,
        provider_key: providerKey,
        secret_field: secretField,
        ciphertext,
        last4,
      },
      { onConflict: "user_id,provider_key,secret_field" },
    );
  return !error;
}

export async function deleteClientIntegrationSecret(
  userId: string,
  providerKey: string,
  secretField: string,
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  const { error } = await supabase
    .from("client_integration_secrets")
    .delete()
    .eq("user_id", userId)
    .eq("provider_key", providerKey)
    .eq("secret_field", secretField);
  return !error;
}

export async function deleteClientIntegrationSecrets(
  userId: string,
  providerKey: string,
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  const { error } = await supabase
    .from("client_integration_secrets")
    .delete()
    .eq("user_id", userId)
    .eq("provider_key", providerKey);
  return !error;
}

export async function syncClientIntegrationTrustSignalForTenant(
  row: ClientIntegrationRow,
  tenantId: string,
): Promise<boolean> {
  const supabase = service();
  if (!supabase || !isClientIntegrationVerifiedTrustSignal(row)) return false;

  const { data: existing } = await supabase
    .from("client_trust_state")
    .select("verified_at, funded_balance_cents, manual_override")
    .eq("user_id", row.user_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  type TrustSignalRow = {
    verified_at: string | null;
    funded_balance_cents: number | null;
    manual_override: "basic" | "verified" | "silver" | "gold" | null;
  };
  const trust = existing as TrustSignalRow | null;
  const result = await writeClientTrustLevel(
    row.user_id,
    tenantId,
    {
      verifiedAt: trust?.verified_at ?? row.last_verified_at ?? new Date().toISOString(),
      fundedBalanceCents: Number(trust?.funded_balance_cents ?? 0),
      manualOverride: trust?.manual_override ?? null,
    },
    supabase,
  );
  return Boolean(result);
}

/**
 * Reverse of {@link syncClientIntegrationTrustSignalForTenant}.
 *
 * When a client disconnects a verified OAuth integration, the verified trust
 * signal that the connection granted must NOT persist. We recompute
 * `client_trust_state` for the (user, tenant) pair with the OAuth-granted
 * verification removed.
 *
 * IMPORTANT: `verified_at` is a shared signal — the $5 Stripe verification fee
 * also sets it. A Stripe-paid verification ALWAYS leaves a
 * `client_stripe_customers` row (the customer is created during that checkout),
 * whereas an OAuth-only verification never does. So we only clear `verified_at`
 * when the client has no Stripe customer record; otherwise we preserve the
 * paid verification and just re-derive the level from the remaining signals.
 */
export async function revokeClientIntegrationTrustSignalForTenant(
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;

  const { data: existing } = await supabase
    .from("client_trust_state")
    .select("verified_at, funded_balance_cents, manual_override")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  type TrustSignalRow = {
    verified_at: string | null;
    funded_balance_cents: number | null;
    manual_override: "basic" | "verified" | "silver" | "gold" | null;
  };
  const trust = existing as TrustSignalRow | null;
  // No trust row → nothing to reverse.
  if (!trust) return false;

  // Preserve a Stripe-paid verification: its checkout always created a
  // client_stripe_customers row. An OAuth-only verification never did.
  const { data: stripeCustomer } = await supabase
    .from("client_stripe_customers")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  const hasStripeCustomer = Boolean(stripeCustomer);

  const result = await writeClientTrustLevel(
    userId,
    tenantId,
    {
      verifiedAt: hasStripeCustomer ? trust.verified_at : null,
      fundedBalanceCents: Number(trust.funded_balance_cents ?? 0),
      manualOverride: trust.manual_override ?? null,
    },
    supabase,
  );
  return Boolean(result);
}
