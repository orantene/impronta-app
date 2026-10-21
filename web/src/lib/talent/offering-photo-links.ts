/**
 * TUL-1632: replace a service's photo links without ever leaving it with none.
 *
 * `setOfferingImages` used to delete every link and then insert the new ones, so an insert that
 * failed (a dropped connection, a constraint, a timeout) lost ALL of the service's photos.
 * This writes the wanted links first (an upsert, which also rewrites `sort_order` for photos that
 * stay) and only then removes the links that are no longer wanted. A failure at either step
 * leaves the old photos in place, or the old plus the new ones, never an empty gallery.
 *
 * The caller has already checked that the offering is hers and that every wanted id is one of
 * her live media assets (the ids come from that query's own result, so they are valid UUIDs).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReplaceLinksResult =
  | { ok: true }
  | { ok: false; stage: "write" | "clear"; error: unknown };

export async function replaceOfferingPhotoLinks(
  admin: unknown,
  offeringId: string,
  wanted: readonly string[],
): Promise<ReplaceLinksResult> {
  const table = () => (admin as SupabaseClient).from("talent_offering_media");

  if (wanted.length > 0) {
    const { error } = await table().upsert(
      wanted.map((mediaAssetId, i) => ({ offering_id: offeringId, media_asset_id: mediaAssetId, sort_order: i })),
      { onConflict: "offering_id,media_asset_id" },
    );
    if (error) return { ok: false, stage: "write", error };
  }

  const stale = table().delete().eq("offering_id", offeringId);
  const { error: clearError } =
    wanted.length > 0 ? await stale.not("media_asset_id", "in", `(${wanted.join(",")})`) : await stale;
  if (clearError) return { ok: false, stage: "clear", error: clearError };
  return { ok: true };
}
