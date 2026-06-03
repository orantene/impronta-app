"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import {
  defaultTalentIntegrationControls,
  getTalentIntegrationCatalogList,
  getTalentIntegrationDef,
  isTalentIntegrationProviderKey,
  type TalentIntegrationControls,
} from "./catalog";
import {
  listTalentIntegrations,
  setTalentIntegrationControls,
  upsertTalentIntegration,
  type TalentIntegrationRow,
} from "./repository";

export type TalentConnectionProviderState = {
  key: string;
  label: string;
  category: string;
  connectionMethods: string[];
  capabilities: string[];
  consentSummary: string;
  setupCopy: string[];
  profileUrlHint: string | null;
  row: {
    status: TalentIntegrationRow["status"];
    providerAccountLabel: string | null;
    providerAccountId: string | null;
    connectionMethod: string;
    lastSyncAt: string | null;
    lastVerifiedAt: string | null;
    lastError: string | null;
    controls: TalentIntegrationControls;
  } | null;
};

const controlsSchema = z.object({
  publicBadgeEnabled: z.boolean().optional(),
  agencyVisible: z.boolean().optional(),
  publicProfileEnabled: z.boolean().optional(),
  personalSiteEnabled: z.boolean().optional(),
  autoRefreshEnabled: z.boolean().optional(),
  calendarAvailabilityEnabled: z.boolean().optional(),
  calendarWriteEnabled: z.boolean().optional(),
});

const providerKeySchema = z.string().refine(isTalentIntegrationProviderKey, {
  message: "Unsupported provider.",
});

const saveControlsSchema = z.object({
  providerKey: providerKeySchema,
  controls: controlsSchema,
});

const connectManualSchema = z.object({
  providerKey: providerKeySchema,
  profileUrl: z.string().url().max(500),
  accountLabel: z.string().trim().max(120).optional(),
  controls: controlsSchema.optional(),
});

function providerState(
  rows: TalentIntegrationRow[],
): TalentConnectionProviderState[] {
  const byKey = new Map(rows.map((row) => [row.provider_key, row]));
  return getTalentIntegrationCatalogList().map((def) => {
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
            controls: {
              publicBadgeEnabled: row.public_badge_enabled,
              agencyVisible: row.agency_visible,
              publicProfileEnabled: row.public_profile_enabled,
              personalSiteEnabled: row.personal_site_enabled,
              autoRefreshEnabled: row.auto_refresh_enabled,
              calendarAvailabilityEnabled: row.calendar_availability_enabled,
              calendarWriteEnabled: row.calendar_write_enabled,
            },
          }
        : null,
    };
  });
}

export async function fetchTalentConnectionSettingsAction(): Promise<
  | { ok: true; providers: TalentConnectionProviderState[] }
  | { ok: false; error: string; providers: TalentConnectionProviderState[] }
> {
  const guard = await requireTalentSelf();
  if (!guard.ok) {
    return {
      ok: false,
      error: guard.error,
      providers: providerState([]),
    };
  }

  try {
    const rows = await listTalentIntegrations(guard.talentProfile.id);
    return { ok: true, providers: providerState(rows) };
  } catch (error) {
    logServerError("talentIntegrations.fetchSettings", error);
    return { ok: false, error: CLIENT_ERROR.generic, providers: providerState([]) };
  }
}

export async function saveTalentIntegrationControlsAction(
  input: z.input<typeof saveControlsSchema>,
): Promise<
  | { ok: true; provider: TalentConnectionProviderState | null }
  | { ok: false; error: string }
> {
  const guard = await requireTalentSelf();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = saveControlsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  try {
    const row = await setTalentIntegrationControls(
      guard.talentProfile.id,
      parsed.data.providerKey,
      parsed.data.controls,
      guard.session.user.id,
    );
    if (!row) return { ok: false, error: CLIENT_ERROR.generic };
    revalidatePath("/[tenantSlug]/talent/settings", "page");
    revalidatePath("/[tenantSlug]/talent/public-page", "page");
    return { ok: true, provider: providerState([row])[0] ?? null };
  } catch (error) {
    logServerError("talentIntegrations.saveControls", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

export async function connectManualTalentIntegrationAction(
  input: z.input<typeof connectManualSchema>,
): Promise<
  | { ok: true; provider: TalentConnectionProviderState | null }
  | { ok: false; error: string }
> {
  const guard = await requireTalentSelf();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = connectManualSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  const def = getTalentIntegrationDef(parsed.data.providerKey);
  if (!def?.connectionMethods.includes("manual")) {
    return { ok: false, error: "This provider does not support manual links." };
  }

  const label =
    parsed.data.accountLabel?.trim() ||
    parsed.data.profileUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const controls = {
    ...defaultTalentIntegrationControls(parsed.data.providerKey),
    ...(parsed.data.controls ?? {}),
  };

  try {
    const row = await upsertTalentIntegration({
      talentProfileId: guard.talentProfile.id,
      providerKey: parsed.data.providerKey,
      providerAccountLabel: label,
      connectionMethod: "manual",
      status: "connected",
      controls,
      scopes: def.requestedScopes,
      settingsJson: { profileUrl: parsed.data.profileUrl },
      metadataCache: { verification_status: "manual_unverified" },
      actorId: guard.session.user.id,
      lastVerifiedAt: null,
      lastError: null,
    });
    if (!row) return { ok: false, error: CLIENT_ERROR.generic };
    revalidatePath("/[tenantSlug]/talent/settings", "page");
    revalidatePath("/[tenantSlug]/talent/public-page", "page");
    return { ok: true, provider: providerState([row])[0] ?? null };
  } catch (error) {
    logServerError("talentIntegrations.connectManual", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}
