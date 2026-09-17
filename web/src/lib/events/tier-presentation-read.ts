/**
 * Read tier presentation for a set of variants, image resolved to a URL.
 *
 * SEPARATE QUERY ON PURPOSE. `talent_offering_variants.presentation` lands in
 * migration 20261231248000 and code must tolerate the column being absent
 * for one deploy. PostgREST answers a select naming a missing column with an
 * error, not null, and the callers' main variant read must not lose its
 * tiers over presentation. So this reads `id, presentation` on its own; on
 * any error it logs and every tier reads as `{}` (the honest "no
 * presentation yet"), and the main read is untouched.
 *
 * The image resolves the way the event cover does for the ticket page / PDF:
 * `media_assets.public_url` by id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { normalizeTierPresentation, type TierPresentation } from "./tier-presentation";

export type ResolvedTierPresentation = TierPresentation & { imageUrl: string | null };

export async function readTierPresentations(
  client: SupabaseClient,
  variantIds: ReadonlyArray<string>,
  ctx = "events.tierPresentation",
): Promise<Map<string, ResolvedTierPresentation>> {
  const out = new Map<string, ResolvedTierPresentation>();
  if (variantIds.length === 0) return out;
  const { data: rows, error } = await client.from("talent_offering_variants").select("id, presentation").in("id", [...variantIds]);
  if (error) {
    // Absent column (pre-migration deploy) or any other refusal: no presentation, not no tiers.
    logServerError(`${ctx}/read`, error);
    return out;
  }
  for (const r of rows ?? []) out.set(r.id as string, { ...normalizeTierPresentation(r.presentation), imageUrl: null });

  const mediaIds = [...new Set([...out.values()].map((p) => p.imageMediaId).filter((id): id is string => id !== null))];
  if (mediaIds.length === 0) return out;
  const { data: media, error: mErr } = await client.from("media_assets").select("id, public_url").in("id", mediaIds);
  if (mErr) {
    logServerError(`${ctx}/media`, mErr);
    return out;
  }
  const urlById = new Map((media ?? []).map((m) => [(m.id as string).toLowerCase(), (m.public_url as string | null) ?? null]));
  for (const p of out.values()) if (p.imageMediaId) p.imageUrl = urlById.get(p.imageMediaId) ?? null;
  return out;
}
