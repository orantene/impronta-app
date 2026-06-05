import "server-only";

import {
  decryptSecret,
  encryptSecret,
  maskApiKey,
} from "@/lib/ai/credential-vault";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  getTalentIntegrationDef,
  type TalentIntegrationControls,
  type TalentIntegrationConnectionMethod,
} from "./catalog";

export type TalentIntegrationStatus =
  | "not_connected"
  | "pending"
  | "connected"
  | "needs_reauth"
  | "error"
  | "disabled";

export type TalentIntegrationRow = {
  id: string;
  talent_profile_id: string;
  provider_key: string;
  provider_account_id: string | null;
  provider_account_label: string | null;
  connection_method: TalentIntegrationConnectionMethod;
  status: TalentIntegrationStatus;
  scopes: string[];
  consent_version: string;
  public_badge_enabled: boolean;
  agency_visible: boolean;
  public_profile_enabled: boolean;
  personal_site_enabled: boolean;
  auto_refresh_enabled: boolean;
  calendar_availability_enabled: boolean;
  calendar_write_enabled: boolean;
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

export type UpsertTalentIntegrationInput = {
  talentProfileId: string;
  providerKey: string;
  providerAccountId?: string | null;
  providerAccountLabel?: string | null;
  connectionMethod?: TalentIntegrationConnectionMethod;
  status?: TalentIntegrationStatus;
  scopes?: string[];
  consentVersion?: string;
  controls?: Partial<TalentIntegrationControls>;
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

function toControls(row: TalentIntegrationRow): TalentIntegrationControls {
  return {
    publicBadgeEnabled: row.public_badge_enabled,
    agencyVisible: row.agency_visible,
    publicProfileEnabled: row.public_profile_enabled,
    personalSiteEnabled: row.personal_site_enabled,
    autoRefreshEnabled: row.auto_refresh_enabled,
    calendarAvailabilityEnabled: row.calendar_availability_enabled,
    calendarWriteEnabled: row.calendar_write_enabled,
  };
}

function applyControls(
  row: Record<string, unknown>,
  controls: Partial<TalentIntegrationControls> | undefined,
) {
  if (!controls) return;
  if (controls.publicBadgeEnabled !== undefined) {
    row.public_badge_enabled = controls.publicBadgeEnabled;
  }
  if (controls.agencyVisible !== undefined) {
    row.agency_visible = controls.agencyVisible;
  }
  if (controls.publicProfileEnabled !== undefined) {
    row.public_profile_enabled = controls.publicProfileEnabled;
  }
  if (controls.personalSiteEnabled !== undefined) {
    row.personal_site_enabled = controls.personalSiteEnabled;
  }
  if (controls.autoRefreshEnabled !== undefined) {
    row.auto_refresh_enabled = controls.autoRefreshEnabled;
  }
  if (controls.calendarAvailabilityEnabled !== undefined) {
    row.calendar_availability_enabled = controls.calendarAvailabilityEnabled;
  }
  if (controls.calendarWriteEnabled !== undefined) {
    row.calendar_write_enabled = controls.calendarWriteEnabled;
  }
}

export async function getTalentIntegration(
  talentProfileId: string,
  providerKey: string,
): Promise<TalentIntegrationRow | null> {
  const supabase = service();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("talent_integrations")
    .select("*")
    .eq("talent_profile_id", talentProfileId)
    .eq("provider_key", providerKey)
    .maybeSingle();
  if (error || !data) return null;
  return data as TalentIntegrationRow;
}

export async function listTalentIntegrations(
  talentProfileId: string,
): Promise<TalentIntegrationRow[]> {
  const supabase = service();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("talent_integrations")
    .select("*")
    .eq("talent_profile_id", talentProfileId)
    .order("provider_key", { ascending: true });
  if (error || !data) return [];
  return data as TalentIntegrationRow[];
}

export async function upsertTalentIntegration(
  input: UpsertTalentIntegrationInput,
): Promise<TalentIntegrationRow | null> {
  const supabase = service();
  if (!supabase) return null;

  const existing = await getTalentIntegration(
    input.talentProfileId,
    input.providerKey,
  );
  const def = getTalentIntegrationDef(input.providerKey);
  const existingControls = existing ? toControls(existing) : def?.defaultControls;
  const mergedControls: Partial<TalentIntegrationControls> = {
    ...(existingControls ?? {}),
    ...(input.controls ?? {}),
  };

  const row: Record<string, unknown> = {
    talent_profile_id: input.talentProfileId,
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
      "talent-connections-v1",
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
    .from("talent_integrations")
    .upsert(row, { onConflict: "talent_profile_id,provider_key" })
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return data as TalentIntegrationRow;
}

export async function setTalentIntegrationControls(
  talentProfileId: string,
  providerKey: string,
  controls: Partial<TalentIntegrationControls>,
  actorId?: string | null,
): Promise<TalentIntegrationRow | null> {
  return upsertTalentIntegration({
    talentProfileId,
    providerKey,
    controls,
    actorId,
  });
}

export async function getDecryptedTalentIntegrationSecret(
  talentProfileId: string,
  providerKey: string,
  secretField: string,
): Promise<string | null> {
  const supabase = service();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("talent_integration_secrets")
    .select("ciphertext")
    .eq("talent_profile_id", talentProfileId)
    .eq("provider_key", providerKey)
    .eq("secret_field", secretField)
    .maybeSingle();
  if (error || !data) return null;
  const ciphertext = (data as { ciphertext: string }).ciphertext;
  if (!ciphertext) return null;
  return decryptSecret(ciphertext);
}

export async function getTalentIntegrationSecretStatus(
  talentProfileId: string,
  providerKey: string,
  secretField: string,
): Promise<{ present: boolean; last4: string | null }> {
  const supabase = service();
  if (!supabase) return { present: false, last4: null };
  const { data, error } = await supabase
    .from("talent_integration_secrets")
    .select("last4")
    .eq("talent_profile_id", talentProfileId)
    .eq("provider_key", providerKey)
    .eq("secret_field", secretField)
    .maybeSingle();
  if (error || !data) return { present: false, last4: null };
  return { present: true, last4: (data as { last4: string | null }).last4 ?? null };
}

export async function setTalentIntegrationSecret(
  talentProfileId: string,
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
    .from("talent_integration_secrets")
    .upsert(
      {
        talent_profile_id: talentProfileId,
        provider_key: providerKey,
        secret_field: secretField,
        ciphertext,
        last4,
      },
      { onConflict: "talent_profile_id,provider_key,secret_field" },
    );
  return !error;
}

export async function deleteTalentIntegrationSecret(
  talentProfileId: string,
  providerKey: string,
  secretField: string,
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  const { error } = await supabase
    .from("talent_integration_secrets")
    .delete()
    .eq("talent_profile_id", talentProfileId)
    .eq("provider_key", providerKey)
    .eq("secret_field", secretField);
  return !error;
}

export async function deleteTalentIntegrationSecrets(
  talentProfileId: string,
  providerKey: string,
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  const { error } = await supabase
    .from("talent_integration_secrets")
    .delete()
    .eq("talent_profile_id", talentProfileId)
    .eq("provider_key", providerKey);
  return !error;
}

// ---------------------------------------------------------------------------
// talent_integration_items — manual featured-media items selected for display
// ---------------------------------------------------------------------------

export type TalentIntegrationItemRow = {
  id: string;
  talent_integration_id: string;
  talent_profile_id: string;
  provider_key: string;
  external_item_id: string;
  item_kind: string;
  title: string | null;
  url: string | null;
  thumbnail_url: string | null;
  embed_url: string | null;
  captured_at: string | null;
  item_metadata: Record<string, unknown>;
  public_profile_enabled: boolean;
  personal_site_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateTalentIntegrationItemInput = {
  talentProfileId: string;
  talentIntegrationId: string;
  providerKey: string;
  externalItemId: string;
  itemKind: string;
  title?: string | null;
  url?: string | null;
  embedUrl?: string | null;
  publicProfileEnabled?: boolean;
  itemMetadata?: Record<string, unknown>;
};

export async function listTalentIntegrationItems(
  talentProfileId: string,
): Promise<TalentIntegrationItemRow[]> {
  const supabase = service();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("talent_integration_items")
    .select("*")
    .eq("talent_profile_id", talentProfileId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as TalentIntegrationItemRow[];
}

/** Public-surface read — only items the talent flagged for the public profile. */
export async function listPublicTalentIntegrationItems(
  talentProfileId: string,
): Promise<TalentIntegrationItemRow[]> {
  const supabase = service();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("talent_integration_items")
    .select("*")
    .eq("talent_profile_id", talentProfileId)
    .eq("public_profile_enabled", true)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as TalentIntegrationItemRow[];
}

export async function createTalentIntegrationItem(
  input: CreateTalentIntegrationItemInput,
): Promise<TalentIntegrationItemRow | null> {
  const supabase = service();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("talent_integration_items")
    .upsert(
      {
        talent_integration_id: input.talentIntegrationId,
        talent_profile_id: input.talentProfileId,
        provider_key: input.providerKey,
        external_item_id: input.externalItemId,
        item_kind: input.itemKind,
        title: input.title ?? null,
        url: input.url ?? null,
        embed_url: input.embedUrl ?? null,
        item_metadata: input.itemMetadata ?? {},
        public_profile_enabled: input.publicProfileEnabled ?? false,
      },
      { onConflict: "talent_integration_id,external_item_id" },
    )
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return data as TalentIntegrationItemRow;
}

/**
 * Owner-scoped update. The `.eq("talent_profile_id", ...)` clause is the
 * ownership guard — a talent can only mutate their own items even though the
 * service-role client bypasses RLS.
 */
export async function updateTalentIntegrationItem(
  talentProfileId: string,
  itemId: string,
  patch: { title?: string | null; publicProfileEnabled?: boolean },
): Promise<TalentIntegrationItemRow | null> {
  const supabase = service();
  if (!supabase) return null;
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.publicProfileEnabled !== undefined) {
    update.public_profile_enabled = patch.publicProfileEnabled;
  }
  if (Object.keys(update).length === 0) return null;
  const { data, error } = await supabase
    .from("talent_integration_items")
    .update(update)
    .eq("id", itemId)
    .eq("talent_profile_id", talentProfileId)
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return data as TalentIntegrationItemRow;
}

/** Owner-scoped delete (talent_profile_id clause enforces ownership). */
export async function deleteTalentIntegrationItem(
  talentProfileId: string,
  itemId: string,
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  const { error } = await supabase
    .from("talent_integration_items")
    .delete()
    .eq("id", itemId)
    .eq("talent_profile_id", talentProfileId);
  return !error;
}

export async function syncTalentIntegrationTrustBadge(
  row: TalentIntegrationRow,
  actorId?: string | null,
): Promise<boolean> {
  const supabase = service();
  const def = getTalentIntegrationDef(row.provider_key);
  if (!supabase || !def) return false;
  const verified = row.metadata_cache?.verification_status === "oauth_verified";
  if (!verified || row.status !== "connected" || !row.public_badge_enabled) {
    return false;
  }

  const badgeKind =
    def.category === "media" || def.category === "music"
      ? "media_authentic"
      : "social_account";
  const providerNote = `provider:${row.provider_key}`;

  const { data: existing } = await supabase
    .from("talent_profile_trust_badges")
    .select("id")
    .eq("talent_profile_id", row.talent_profile_id)
    .eq("badge_kind", badgeKind)
    .eq("scope", "platform")
    .ilike("notes", `%${providerNote}%`)
    .maybeSingle();

  const payload = {
    talent_profile_id: row.talent_profile_id,
    badge_kind: badgeKind,
    status: "verified",
    scope: "platform",
    scope_tenant_id: null,
    verified_at: row.last_verified_at ?? new Date().toISOString(),
    verified_by_user_id: actorId ?? row.updated_by_user_id ?? null,
    notes: `${def.label} account verified by Tulala connection (${providerNote}).`,
  };

  const { error } = existing
    ? await supabase
        .from("talent_profile_trust_badges")
        .update(payload)
        .eq("id", (existing as { id: string }).id)
    : await supabase.from("talent_profile_trust_badges").insert(payload);
  return !error;
}
