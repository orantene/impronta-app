"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireClient } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import {
  defaultClientIntegrationControls,
  getClientIntegrationCatalogList,
  getClientIntegrationDef,
  isClientIntegrationProviderKey,
  type ClientIntegrationControls,
} from "./catalog";
import {
  deleteClientIntegrationSecrets,
  listClientIntegrations,
  setClientIntegrationControls,
  upsertClientIntegration,
  type ClientIntegrationRow,
} from "./repository";

export type ClientConnectionProviderState = {
  key: string;
  label: string;
  category: string;
  connectionMethods: string[];
  capabilities: string[];
  consentSummary: string;
  setupCopy: string[];
  profileUrlHint: string | null;
  row: {
    status: ClientIntegrationRow["status"];
    providerAccountLabel: string | null;
    providerAccountId: string | null;
    connectionMethod: string;
    lastSyncAt: string | null;
    lastVerifiedAt: string | null;
    lastError: string | null;
    verificationStatus: string | null;
    controls: ClientIntegrationControls;
  } | null;
};

const tenantSlugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/i, "Invalid tenant.");

const controlsSchema = z.object({
  trustSignalEnabled: z.boolean().optional(),
  agencyVisible: z.boolean().optional(),
  talentVisible: z.boolean().optional(),
  publicProfileEnabled: z.boolean().optional(),
  autoRefreshEnabled: z.boolean().optional(),
});

const providerKeySchema = z.string().refine(isClientIntegrationProviderKey, {
  message: "Unsupported provider.",
});

const saveControlsSchema = z.object({
  tenantSlug: tenantSlugSchema,
  providerKey: providerKeySchema,
  controls: controlsSchema,
});

const connectManualSchema = z.object({
  tenantSlug: tenantSlugSchema,
  providerKey: providerKeySchema,
  profileUrl: z.string().url().max(500),
  accountLabel: z.string().trim().max(120).optional(),
  controls: controlsSchema.optional(),
});

const disconnectSchema = z.object({
  tenantSlug: tenantSlugSchema,
  providerKey: providerKeySchema,
});

function verificationStatus(row: ClientIntegrationRow): string | null {
  const status = row.metadata_cache?.verification_status;
  return typeof status === "string" ? status : null;
}

function providerState(
  rows: ClientIntegrationRow[],
): ClientConnectionProviderState[] {
  const byKey = new Map(rows.map((row) => [row.provider_key, row]));
  return getClientIntegrationCatalogList().map((def) => {
    const row = byKey.get(def.key) ?? null;
    return {
      key: def.key,
      label: def.label,
      category: def.category,
      connectionMethods: def.connectionMethods,
      capabilities: def.capabilities,
      consentSummary: def.consentSummary,
      setupCopy: def.setupCopy,
      profileUrlHint: def.fieldHints?.profileUrl ?? null,
      row: row
        ? {
            status: row.status,
            providerAccountLabel: row.provider_account_label,
            providerAccountId: row.provider_account_id,
            connectionMethod: row.connection_method,
            lastSyncAt: row.last_sync_at,
            lastVerifiedAt: row.last_verified_at,
            lastError: row.last_error,
            verificationStatus: verificationStatus(row),
            controls: {
              trustSignalEnabled: row.trust_signal_enabled,
              agencyVisible: row.agency_visible,
              talentVisible: row.talent_visible,
              publicProfileEnabled: row.public_profile_enabled,
              autoRefreshEnabled: row.auto_refresh_enabled,
            },
          }
        : null,
    };
  });
}

export async function fetchClientConnectionSettingsAction(): Promise<
  | { ok: true; providers: ClientConnectionProviderState[] }
  | { ok: false; error: string; providers: ClientConnectionProviderState[] }
> {
  const guard = await requireClient();
  if (!guard.ok) {
    return {
      ok: false,
      error: guard.error,
      providers: providerState([]),
    };
  }

  try {
    const rows = await listClientIntegrations(guard.user.id);
    return { ok: true, providers: providerState(rows) };
  } catch (error) {
    logServerError("clientIntegrations.fetchSettings", error);
    return { ok: false, error: CLIENT_ERROR.generic, providers: providerState([]) };
  }
}

export async function saveClientIntegrationControlsAction(
  input: z.input<typeof saveControlsSchema>,
): Promise<
  | { ok: true; provider: ClientConnectionProviderState | null }
  | { ok: false; error: string }
> {
  const guard = await requireClient();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = saveControlsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  try {
    const row = await setClientIntegrationControls(
      guard.user.id,
      parsed.data.providerKey,
      parsed.data.controls,
      guard.user.id,
    );
    if (!row) return { ok: false, error: CLIENT_ERROR.generic };
    revalidatePath(`/${parsed.data.tenantSlug}/client/settings`);
    return { ok: true, provider: providerState([row])[0] ?? null };
  } catch (error) {
    logServerError("clientIntegrations.saveControls", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

export async function connectManualClientIntegrationAction(
  input: z.input<typeof connectManualSchema>,
): Promise<
  | { ok: true; provider: ClientConnectionProviderState | null }
  | { ok: false; error: string }
> {
  const guard = await requireClient();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = connectManualSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  const def = getClientIntegrationDef(parsed.data.providerKey);
  if (!def?.connectionMethods.includes("manual")) {
    return { ok: false, error: "This provider does not support manual links." };
  }

  const label =
    parsed.data.accountLabel?.trim() ||
    parsed.data.profileUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const controls = {
    ...defaultClientIntegrationControls(parsed.data.providerKey),
    ...(parsed.data.controls ?? {}),
  };

  try {
    await deleteClientIntegrationSecrets(guard.user.id, parsed.data.providerKey);
    const row = await upsertClientIntegration({
      userId: guard.user.id,
      providerKey: parsed.data.providerKey,
      providerAccountLabel: label,
      connectionMethod: "manual",
      status: "connected",
      controls,
      scopes: def.requestedScopes,
      settingsJson: { profileUrl: parsed.data.profileUrl },
      metadataCache: { verification_status: "manual_unverified" },
      actorId: guard.user.id,
      lastVerifiedAt: null,
      lastError: null,
    });
    if (!row) return { ok: false, error: CLIENT_ERROR.generic };
    revalidatePath(`/${parsed.data.tenantSlug}/client/settings`);
    return { ok: true, provider: providerState([row])[0] ?? null };
  } catch (error) {
    logServerError("clientIntegrations.connectManual", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

export async function disconnectClientIntegrationAction(
  input: z.input<typeof disconnectSchema>,
): Promise<
  | { ok: true; provider: ClientConnectionProviderState | null }
  | { ok: false; error: string }
> {
  const guard = await requireClient();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = disconnectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  try {
    const row = await upsertClientIntegration({
      userId: guard.user.id,
      providerKey: parsed.data.providerKey,
      status: "disabled",
      controls: {
        trustSignalEnabled: false,
        agencyVisible: false,
        talentVisible: false,
        publicProfileEnabled: false,
        autoRefreshEnabled: false,
      },
      actorId: guard.user.id,
      lastError: null,
    });
    if (!row) return { ok: false, error: CLIENT_ERROR.generic };
    revalidatePath(`/${parsed.data.tenantSlug}/client/settings`);
    return { ok: true, provider: providerState([row])[0] ?? null };
  } catch (error) {
    logServerError("clientIntegrations.disconnect", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}
