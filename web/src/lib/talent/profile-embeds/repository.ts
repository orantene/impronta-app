import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { talentPlanGrantsCapability } from "@/lib/access/talent-membership";

import {
  isProfileEmbedProvider,
  profileEmbedIframeSrc,
  type ProfileEmbedProvider,
} from "./embed-url";
import type { PublicTalentEmbed, PublicTalentPressItem } from "./types";

/**
 * Data access for the Pro/Portfolio profile extras: social/video embeds and the
 * press band. Reads go through the service-role client (the same shape as
 * `listPublicTalentIntegrationItems`) because the public profile renders
 * anonymously; the Pro-or-Max entitlement is therefore re-checked HERE in TS,
 * not only in RLS, so a downgraded talent stops publishing immediately.
 */

export type TalentProfileEmbedRow = {
  id: string;
  talent_profile_id: string;
  provider: string;
  external_id: string;
  url: string;
  title: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TalentPressItemRow = {
  id: string;
  talent_profile_id: string;
  outlet: string;
  title: string;
  url: string;
  published_on: string | null;
  quote: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type { PublicTalentEmbed, PublicTalentPressItem } from "./types";

function service() {
  return createServiceRoleClient();
}

/** The single entitlement predicate for both surfaces. Pro OR Portfolio. */
export function talentPlanAllowsProfileExtras(
  planKey: string | null | undefined,
): boolean {
  return talentPlanGrantsCapability(planKey, "profile.enhanced");
}

// ─── Owner reads (drawer) ────────────────────────────────────────────────────

export async function listTalentProfileEmbeds(
  talentProfileId: string,
): Promise<TalentProfileEmbedRow[]> {
  const supabase = service();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("talent_profile_embeds")
    .select("*")
    .eq("talent_profile_id", talentProfileId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as TalentProfileEmbedRow[];
}

export async function listTalentPressItems(
  talentProfileId: string,
): Promise<TalentPressItemRow[]> {
  const supabase = service();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("talent_press_items")
    .select("*")
    .eq("talent_profile_id", talentProfileId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as TalentPressItemRow[];
}

// ─── Public reads (profile render) ───────────────────────────────────────────

/**
 * Embeds for the public profile. Returns [] unless the talent is on Pro or
 * Portfolio. Every returned `src` is rebuilt from { provider, external_id }
 * through the allow-list — a row whose provider or id no longer validates is
 * dropped rather than rendered.
 */
export async function loadPublicTalentEmbeds(
  talentProfileId: string,
  planKey: string | null | undefined,
): Promise<PublicTalentEmbed[]> {
  if (!talentPlanAllowsProfileExtras(planKey)) return [];
  const rows = await listTalentProfileEmbeds(talentProfileId);
  const out: PublicTalentEmbed[] = [];
  for (const row of rows) {
    if (!isProfileEmbedProvider(row.provider)) continue;
    const src = profileEmbedIframeSrc(row.provider, row.external_id);
    if (!src) continue;
    out.push({
      id: row.id,
      provider: row.provider,
      src,
      title: row.title,
    });
  }
  return out;
}

/** Press clippings for the public profile. Pro/Portfolio only. */
export async function loadPublicTalentPress(
  talentProfileId: string,
  planKey: string | null | undefined,
): Promise<PublicTalentPressItem[]> {
  if (!talentPlanAllowsProfileExtras(planKey)) return [];
  const rows = await listTalentPressItems(talentProfileId);
  return rows
    .filter((row) => /^https?:\/\//i.test(row.url))
    .map((row) => ({
      id: row.id,
      outlet: row.outlet,
      title: row.title,
      url: row.url,
      publishedOn: row.published_on,
      quote: row.quote,
    }));
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export async function insertTalentProfileEmbed(input: {
  talentProfileId: string;
  provider: ProfileEmbedProvider;
  externalId: string;
  url: string;
  title: string | null;
  sortOrder: number;
}): Promise<TalentProfileEmbedRow | null> {
  const supabase = service();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("talent_profile_embeds")
    .insert({
      talent_profile_id: input.talentProfileId,
      provider: input.provider,
      external_id: input.externalId,
      url: input.url,
      title: input.title,
      sort_order: input.sortOrder,
    })
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return data as TalentProfileEmbedRow;
}

export async function updateTalentProfileEmbed(input: {
  talentProfileId: string;
  id: string;
  title?: string | null;
  sortOrder?: number;
}): Promise<TalentProfileEmbedRow | null> {
  const supabase = service();
  if (!supabase) return null;
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (Object.keys(patch).length === 0) return null;
  const { data, error } = await supabase
    .from("talent_profile_embeds")
    .update(patch)
    .eq("id", input.id)
    // Ownership predicate — never trust the id alone.
    .eq("talent_profile_id", input.talentProfileId)
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return data as TalentProfileEmbedRow;
}

export async function deleteTalentProfileEmbed(
  talentProfileId: string,
  id: string,
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  const { error } = await supabase
    .from("talent_profile_embeds")
    .delete()
    .eq("id", id)
    .eq("talent_profile_id", talentProfileId);
  return !error;
}

export async function insertTalentPressItem(input: {
  talentProfileId: string;
  outlet: string;
  title: string;
  url: string;
  publishedOn: string | null;
  quote: string | null;
  sortOrder: number;
}): Promise<TalentPressItemRow | null> {
  const supabase = service();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("talent_press_items")
    .insert({
      talent_profile_id: input.talentProfileId,
      outlet: input.outlet,
      title: input.title,
      url: input.url,
      published_on: input.publishedOn,
      quote: input.quote,
      sort_order: input.sortOrder,
    })
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return data as TalentPressItemRow;
}

export async function updateTalentPressItem(input: {
  talentProfileId: string;
  id: string;
  outlet?: string;
  title?: string;
  url?: string;
  publishedOn?: string | null;
  quote?: string | null;
  sortOrder?: number;
}): Promise<TalentPressItemRow | null> {
  const supabase = service();
  if (!supabase) return null;
  const patch: Record<string, unknown> = {};
  if (input.outlet !== undefined) patch.outlet = input.outlet;
  if (input.title !== undefined) patch.title = input.title;
  if (input.url !== undefined) patch.url = input.url;
  if (input.publishedOn !== undefined) patch.published_on = input.publishedOn;
  if (input.quote !== undefined) patch.quote = input.quote;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (Object.keys(patch).length === 0) return null;
  const { data, error } = await supabase
    .from("talent_press_items")
    .update(patch)
    .eq("id", input.id)
    .eq("talent_profile_id", input.talentProfileId)
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return data as TalentPressItemRow;
}

export async function deleteTalentPressItem(
  talentProfileId: string,
  id: string,
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  const { error } = await supabase
    .from("talent_press_items")
    .delete()
    .eq("id", id)
    .eq("talent_profile_id", talentProfileId);
  return !error;
}

/** Apply a caller-supplied order to rows the caller already owns. */
export async function reorderTalentRows(
  table: "talent_profile_embeds" | "talent_press_items",
  talentProfileId: string,
  orderedIds: string[],
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;
  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error } = await supabase
      .from(table)
      .update({ sort_order: index })
      .eq("id", orderedIds[index])
      .eq("talent_profile_id", talentProfileId);
    if (error) return false;
  }
  return true;
}
