"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import {
  assertTalentCanManageProfileExtras,
  planDeniedMessage,
  requireTalentSelf,
} from "@/lib/server/talent-self-guard";
import { pgUuidSchema } from "@/lib/site-admin/validators";

import {
  normalizePressUrl,
  parseProfileEmbedUrl,
  PROFILE_EMBED_PROVIDER_LABELS,
  type ProfileEmbedProvider,
} from "./embed-url";
import {
  deleteTalentPressItem,
  deleteTalentProfileEmbed,
  insertTalentPressItem,
  insertTalentProfileEmbed,
  listTalentPressItems,
  listTalentProfileEmbeds,
  reorderTalentRows,
  updateTalentPressItem,
  updateTalentProfileEmbed,
  type TalentPressItemRow,
  type TalentProfileEmbedRow,
} from "./repository";

/**
 * Talent self-service for the Pro/Portfolio profile extras.
 *
 * THREE GATES on every write, in order:
 *   1. `requireTalentSelf()` — authenticated AND owns a talent profile.
 *   2. `assertTalentCanManageProfileExtras(planKey)` — Pro or Portfolio, read
 *      from the talent plan catalog (`profile.enhanced`).
 *   3. RLS on the table itself (`is_talent_profile_owner` AND
 *      `talent_profile_has_pro_or_max`), plus an explicit
 *      `.eq("talent_profile_id", …)` ownership predicate on every mutation so a
 *      forged row id cannot reach another talent's content.
 *
 * URLs are NEVER stored as pasted. `parseProfileEmbedUrl` mints the
 * { provider, externalId, canonicalUrl } triple from a fixed allow-list, and
 * `normalizePressUrl` rejects any non-http(s) scheme before a press link can
 * become an <a href>.
 */

const MAX_EMBEDS = 12;
const MAX_PRESS_ITEMS = 20;

const addEmbedSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  title: z.string().trim().max(160).optional(),
});

const updateEmbedSchema = z.object({
  id: pgUuidSchema(),
  title: z.string().trim().max(160).nullable().optional(),
});

const idSchema = z.object({ id: pgUuidSchema() });

const reorderSchema = z.object({
  orderedIds: z.array(pgUuidSchema()).max(100),
});

const addPressSchema = z.object({
  outlet: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().min(1).max(2000),
  publishedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
    .nullable()
    .optional(),
  quote: z.string().trim().max(500).nullable().optional(),
});

const updatePressSchema = addPressSchema.partial().extend({
  id: pgUuidSchema(),
});

export type TalentProfileEmbed = {
  id: string;
  provider: string;
  providerLabel: string;
  externalId: string;
  url: string;
  title: string | null;
  sortOrder: number;
};

export type TalentPressItem = {
  id: string;
  outlet: string;
  title: string;
  url: string;
  publishedOn: string | null;
  quote: string | null;
  sortOrder: number;
};

function toEmbed(row: TalentProfileEmbedRow): TalentProfileEmbed {
  return {
    id: row.id,
    provider: row.provider,
    providerLabel:
      PROFILE_EMBED_PROVIDER_LABELS[row.provider as ProfileEmbedProvider] ??
      row.provider,
    externalId: row.external_id,
    url: row.url,
    title: row.title,
    sortOrder: row.sort_order,
  };
}

function toPress(row: TalentPressItemRow): TalentPressItem {
  return {
    id: row.id,
    outlet: row.outlet,
    title: row.title,
    url: row.url,
    publishedOn: row.published_on,
    quote: row.quote,
    sortOrder: row.sort_order,
  };
}

function revalidateSurfaces() {
  revalidatePath("/t/[profileCode]", "page");
  revalidatePath("/talent/public-page", "page");
}

type Scope = {
  talentProfileId: string;
  canManage: boolean;
};

async function scope(): Promise<
  { ok: true; scope: Scope } | { ok: false; error: string }
> {
  const guard = await requireTalentSelf();
  if (!guard.ok) return { ok: false, error: guard.error };
  return {
    ok: true,
    scope: {
      talentProfileId: guard.talentProfile.id,
      canManage: assertTalentCanManageProfileExtras(guard.planKey),
    },
  };
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function fetchTalentProfileExtrasAction(): Promise<
  | {
      ok: true;
      canManage: boolean;
      embeds: TalentProfileEmbed[];
      press: TalentPressItem[];
    }
  | {
      ok: false;
      error: string;
      canManage: false;
      embeds: TalentProfileEmbed[];
      press: TalentPressItem[];
    }
> {
  const s = await scope();
  if (!s.ok) {
    return { ok: false, error: s.error, canManage: false, embeds: [], press: [] };
  }
  try {
    // Owner READ is intentionally NOT tier-gated: a downgraded talent must
    // still see (and be able to delete) content they created on Pro.
    const [embedRows, pressRows] = await Promise.all([
      listTalentProfileEmbeds(s.scope.talentProfileId),
      listTalentPressItems(s.scope.talentProfileId),
    ]);
    return {
      ok: true,
      canManage: s.scope.canManage,
      embeds: embedRows.map(toEmbed),
      press: pressRows.map(toPress),
    };
  } catch (error) {
    logServerError("talentProfileExtras.fetch", error);
    return {
      ok: false,
      error: CLIENT_ERROR.generic,
      canManage: false,
      embeds: [],
      press: [],
    };
  }
}

// ─── Embeds ──────────────────────────────────────────────────────────────────

export async function addTalentProfileEmbedAction(
  input: z.input<typeof addEmbedSchema>,
): Promise<{ ok: true; embed: TalentProfileEmbed } | { ok: false; error: string }> {
  const s = await scope();
  if (!s.ok) return { ok: false, error: s.error };
  if (!s.scope.canManage) {
    return { ok: false, error: planDeniedMessage("profile_extras") };
  }

  const parsed = addEmbedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const embed = parseProfileEmbedUrl(parsed.data.url);
  if (!embed) {
    return {
      ok: false,
      error:
        "Paste a public Instagram post or reel, TikTok video, YouTube, Vimeo, Spotify, or SoundCloud link. Other links aren't supported.",
    };
  }

  try {
    const existing = await listTalentProfileEmbeds(s.scope.talentProfileId);
    if (existing.length >= MAX_EMBEDS) {
      return { ok: false, error: `You can show up to ${MAX_EMBEDS} embeds.` };
    }
    if (
      existing.some(
        (row) =>
          row.provider === embed.provider && row.external_id === embed.externalId,
      )
    ) {
      return { ok: false, error: "That item is already on your profile." };
    }

    const row = await insertTalentProfileEmbed({
      talentProfileId: s.scope.talentProfileId,
      provider: embed.provider,
      externalId: embed.externalId,
      url: embed.canonicalUrl,
      title: parsed.data.title?.trim() || null,
      sortOrder: existing.length,
    });
    if (!row) return { ok: false, error: CLIENT_ERROR.generic };
    revalidateSurfaces();
    return { ok: true, embed: toEmbed(row) };
  } catch (error) {
    logServerError("talentProfileExtras.addEmbed", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

export async function updateTalentProfileEmbedAction(
  input: z.input<typeof updateEmbedSchema>,
): Promise<{ ok: true; embed: TalentProfileEmbed } | { ok: false; error: string }> {
  const s = await scope();
  if (!s.ok) return { ok: false, error: s.error };
  if (!s.scope.canManage) {
    return { ok: false, error: planDeniedMessage("profile_extras") };
  }
  const parsed = updateEmbedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  try {
    const row = await updateTalentProfileEmbed({
      talentProfileId: s.scope.talentProfileId,
      id: parsed.data.id,
      title: parsed.data.title === undefined ? undefined : parsed.data.title || null,
    });
    if (!row) return { ok: false, error: CLIENT_ERROR.generic };
    revalidateSurfaces();
    return { ok: true, embed: toEmbed(row) };
  } catch (error) {
    logServerError("talentProfileExtras.updateEmbed", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

export async function removeTalentProfileEmbedAction(
  input: z.input<typeof idSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await scope();
  if (!s.ok) return { ok: false, error: s.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    // Delete is allowed at ANY plan: a downgrade must never trap content on a
    // public profile the talent can no longer manage.
    const done = await deleteTalentProfileEmbed(
      s.scope.talentProfileId,
      parsed.data.id,
    );
    if (!done) return { ok: false, error: CLIENT_ERROR.generic };
    revalidateSurfaces();
    return { ok: true };
  } catch (error) {
    logServerError("talentProfileExtras.removeEmbed", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

export async function reorderTalentProfileEmbedsAction(
  input: z.input<typeof reorderSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await scope();
  if (!s.ok) return { ok: false, error: s.error };
  if (!s.scope.canManage) {
    return { ok: false, error: planDeniedMessage("profile_extras") };
  }
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    const done = await reorderTalentRows(
      "talent_profile_embeds",
      s.scope.talentProfileId,
      parsed.data.orderedIds,
    );
    if (!done) return { ok: false, error: CLIENT_ERROR.generic };
    revalidateSurfaces();
    return { ok: true };
  } catch (error) {
    logServerError("talentProfileExtras.reorderEmbeds", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

// ─── Press ───────────────────────────────────────────────────────────────────

export async function addTalentPressItemAction(
  input: z.input<typeof addPressSchema>,
): Promise<{ ok: true; item: TalentPressItem } | { ok: false; error: string }> {
  const s = await scope();
  if (!s.ok) return { ok: false, error: s.error };
  if (!s.scope.canManage) {
    return { ok: false, error: planDeniedMessage("profile_extras") };
  }
  const parsed = addPressSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const url = normalizePressUrl(parsed.data.url);
  if (!url) {
    return { ok: false, error: "Enter a valid http(s) link to the article." };
  }
  try {
    const existing = await listTalentPressItems(s.scope.talentProfileId);
    if (existing.length >= MAX_PRESS_ITEMS) {
      return { ok: false, error: `You can show up to ${MAX_PRESS_ITEMS} press items.` };
    }
    const row = await insertTalentPressItem({
      talentProfileId: s.scope.talentProfileId,
      outlet: parsed.data.outlet,
      title: parsed.data.title,
      url,
      publishedOn: parsed.data.publishedOn ?? null,
      quote: parsed.data.quote?.trim() || null,
      sortOrder: existing.length,
    });
    if (!row) return { ok: false, error: CLIENT_ERROR.generic };
    revalidateSurfaces();
    return { ok: true, item: toPress(row) };
  } catch (error) {
    logServerError("talentProfileExtras.addPress", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

export async function updateTalentPressItemAction(
  input: z.input<typeof updatePressSchema>,
): Promise<{ ok: true; item: TalentPressItem } | { ok: false; error: string }> {
  const s = await scope();
  if (!s.ok) return { ok: false, error: s.error };
  if (!s.scope.canManage) {
    return { ok: false, error: planDeniedMessage("profile_extras") };
  }
  const parsed = updatePressSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  let url: string | undefined;
  if (parsed.data.url !== undefined) {
    const normalized = normalizePressUrl(parsed.data.url);
    if (!normalized) {
      return { ok: false, error: "Enter a valid http(s) link to the article." };
    }
    url = normalized;
  }
  try {
    const row = await updateTalentPressItem({
      talentProfileId: s.scope.talentProfileId,
      id: parsed.data.id,
      outlet: parsed.data.outlet,
      title: parsed.data.title,
      url,
      publishedOn:
        parsed.data.publishedOn === undefined ? undefined : parsed.data.publishedOn,
      quote:
        parsed.data.quote === undefined ? undefined : parsed.data.quote || null,
    });
    if (!row) return { ok: false, error: CLIENT_ERROR.generic };
    revalidateSurfaces();
    return { ok: true, item: toPress(row) };
  } catch (error) {
    logServerError("talentProfileExtras.updatePress", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

export async function removeTalentPressItemAction(
  input: z.input<typeof idSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await scope();
  if (!s.ok) return { ok: false, error: s.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    const done = await deleteTalentPressItem(s.scope.talentProfileId, parsed.data.id);
    if (!done) return { ok: false, error: CLIENT_ERROR.generic };
    revalidateSurfaces();
    return { ok: true };
  } catch (error) {
    logServerError("talentProfileExtras.removePress", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

export async function reorderTalentPressItemsAction(
  input: z.input<typeof reorderSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await scope();
  if (!s.ok) return { ok: false, error: s.error };
  if (!s.scope.canManage) {
    return { ok: false, error: planDeniedMessage("profile_extras") };
  }
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    const done = await reorderTalentRows(
      "talent_press_items",
      s.scope.talentProfileId,
      parsed.data.orderedIds,
    );
    if (!done) return { ok: false, error: CLIENT_ERROR.generic };
    revalidateSurfaces();
    return { ok: true };
  } catch (error) {
    logServerError("talentProfileExtras.reorderPress", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}
