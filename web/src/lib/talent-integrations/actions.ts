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
  createTalentIntegrationItem,
  deleteTalentIntegrationItem,
  deleteTalentIntegrationSecrets,
  getTalentIntegration,
  listTalentIntegrations,
  listTalentIntegrationItems,
  setTalentIntegrationControls,
  updateTalentIntegrationItem,
  upsertTalentIntegration,
  type TalentIntegrationItemRow,
  type TalentIntegrationRow,
} from "./repository";
import {
  MEDIA_EMBED_PROVIDER_KEYS,
  parseMediaUrl,
  safeEmbedUrl,
} from "./media-embed";

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
  profileUrl: z
    .string()
    .url()
    .max(500)
    .refine((v) => /^https?:\/\//i.test(v), "Must be an http(s) URL"),
  accountLabel: z.string().trim().max(120).optional(),
  controls: controlsSchema.optional(),
});

const disconnectSchema = z.object({
  providerKey: providerKeySchema,
});

const addMediaItemSchema = z.object({
  url: z.string().trim().min(1).max(500),
  title: z.string().trim().max(160).optional(),
  publicProfileEnabled: z.boolean().optional(),
});

const updateMediaItemSchema = z.object({
  itemId: z.string().uuid(),
  title: z.string().trim().max(160).optional(),
  publicProfileEnabled: z.boolean().optional(),
});

const removeMediaItemSchema = z.object({
  itemId: z.string().uuid(),
});

export type TalentFeaturedMediaItem = {
  id: string;
  provider: string;
  itemKind: string;
  title: string | null;
  url: string | null;
  embedUrl: string | null;
  publicProfileEnabled: boolean;
};

function toFeaturedMediaItem(
  row: TalentIntegrationItemRow,
): TalentFeaturedMediaItem {
  return {
    id: row.id,
    provider: row.provider_key,
    itemKind: row.item_kind,
    title: row.title,
    url: row.url,
    embedUrl: row.embed_url,
    publicProfileEnabled: row.public_profile_enabled,
  };
}

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

export async function disconnectTalentIntegrationAction(
  input: z.input<typeof disconnectSchema>,
): Promise<
  | { ok: true; provider: TalentConnectionProviderState | null }
  | { ok: false; error: string }
> {
  const guard = await requireTalentSelf();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = disconnectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  try {
    await deleteTalentIntegrationSecrets(guard.talentProfile.id, parsed.data.providerKey);
    const row = await upsertTalentIntegration({
      talentProfileId: guard.talentProfile.id,
      providerKey: parsed.data.providerKey,
      status: "disabled",
      controls: {
        publicBadgeEnabled: false,
        agencyVisible: false,
        publicProfileEnabled: false,
        personalSiteEnabled: false,
        autoRefreshEnabled: false,
        calendarAvailabilityEnabled: false,
        calendarWriteEnabled: false,
      },
      actorId: guard.session.user.id,
      lastError: null,
    });
    if (!row) return { ok: false, error: CLIENT_ERROR.generic };
    revalidatePath("/[tenantSlug]/talent/settings", "page");
    revalidatePath("/[tenantSlug]/talent/public-page", "page");
    return { ok: true, provider: providerState([row])[0] ?? null };
  } catch (error) {
    logServerError("talentIntegrations.disconnect", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

// ---------------------------------------------------------------------------
// Manual featured-media items
//
// A talent pastes a media URL; we parse it server-side to a recognized
// { provider, externalId }, reject anything that is not a recognized provider
// content URL, then store it in talent_integration_items gated by a per-item
// "show on public profile" toggle that DEFAULTS OFF.
//
// Manual items are SHOWCASE ONLY — they never set a verified trust badge.
// ---------------------------------------------------------------------------

export async function fetchTalentFeaturedMediaAction(): Promise<
  | { ok: true; items: TalentFeaturedMediaItem[] }
  | { ok: false; error: string; items: TalentFeaturedMediaItem[] }
> {
  const guard = await requireTalentSelf();
  if (!guard.ok) return { ok: false, error: guard.error, items: [] };
  try {
    const rows = await listTalentIntegrationItems(guard.talentProfile.id);
    return { ok: true, items: rows.map(toFeaturedMediaItem) };
  } catch (error) {
    logServerError("talentIntegrations.fetchFeaturedMedia", error);
    return { ok: false, error: CLIENT_ERROR.generic, items: [] };
  }
}

export async function addTalentFeaturedMediaAction(
  input: z.input<typeof addMediaItemSchema>,
): Promise<
  | { ok: true; item: TalentFeaturedMediaItem }
  | { ok: false; error: string }
> {
  const guard = await requireTalentSelf();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = addMediaItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  const media = parseMediaUrl(parsed.data.url);
  if (!media) {
    return {
      ok: false,
      error:
        "Paste a public YouTube, Vimeo, Spotify, or SoundCloud link. Other links aren't supported yet.",
    };
  }

  const embedUrl = safeEmbedUrl(media.provider, media.externalId);
  if (!embedUrl) {
    return { ok: false, error: "That link can't be embedded safely." };
  }

  const providerKey = MEDIA_EMBED_PROVIDER_KEYS[media.provider];

  try {
    // Ensure a parent connection row exists for this provider so the item FK
    // resolves. Manual featured media is showcase-only — never verified.
    const existing = await getTalentIntegration(guard.talentProfile.id, providerKey);
    const parent =
      existing ??
      (await upsertTalentIntegration({
        talentProfileId: guard.talentProfile.id,
        providerKey,
        connectionMethod: "embed",
        status: "connected",
        metadataCache: { verification_status: "manual_unverified" },
        actorId: guard.session.user.id,
      }));
    if (!parent) return { ok: false, error: CLIENT_ERROR.generic };

    const row = await createTalentIntegrationItem({
      talentProfileId: guard.talentProfile.id,
      talentIntegrationId: parent.id,
      providerKey,
      externalItemId: media.externalId,
      itemKind: media.itemKind,
      title: parsed.data.title?.trim() || null,
      url: media.canonicalUrl,
      embedUrl,
      publicProfileEnabled: parsed.data.publicProfileEnabled ?? false,
      itemMetadata: { source: "manual", verification_status: "manual_unverified" },
    });
    if (!row) return { ok: false, error: CLIENT_ERROR.generic };
    revalidatePath("/[tenantSlug]/talent/settings", "page");
    revalidatePath("/t/[profileCode]", "page");
    return { ok: true, item: toFeaturedMediaItem(row) };
  } catch (error) {
    logServerError("talentIntegrations.addFeaturedMedia", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

export async function updateTalentFeaturedMediaAction(
  input: z.input<typeof updateMediaItemSchema>,
): Promise<
  | { ok: true; item: TalentFeaturedMediaItem }
  | { ok: false; error: string }
> {
  const guard = await requireTalentSelf();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = updateMediaItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  if (
    parsed.data.title === undefined &&
    parsed.data.publicProfileEnabled === undefined
  ) {
    return { ok: false, error: "Nothing to update." };
  }

  try {
    const row = await updateTalentIntegrationItem(
      guard.talentProfile.id,
      parsed.data.itemId,
      {
        title:
          parsed.data.title !== undefined
            ? parsed.data.title.trim() || null
            : undefined,
        publicProfileEnabled: parsed.data.publicProfileEnabled,
      },
    );
    if (!row) return { ok: false, error: CLIENT_ERROR.generic };
    revalidatePath("/[tenantSlug]/talent/settings", "page");
    revalidatePath("/t/[profileCode]", "page");
    return { ok: true, item: toFeaturedMediaItem(row) };
  } catch (error) {
    logServerError("talentIntegrations.updateFeaturedMedia", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

export async function removeTalentFeaturedMediaAction(
  input: z.input<typeof removeMediaItemSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireTalentSelf();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = removeMediaItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  try {
    const ok = await deleteTalentIntegrationItem(
      guard.talentProfile.id,
      parsed.data.itemId,
    );
    if (!ok) return { ok: false, error: CLIENT_ERROR.generic };
    revalidatePath("/[tenantSlug]/talent/settings", "page");
    revalidatePath("/t/[profileCode]", "page");
    return { ok: true };
  } catch (error) {
    logServerError("talentIntegrations.removeFeaturedMedia", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}
