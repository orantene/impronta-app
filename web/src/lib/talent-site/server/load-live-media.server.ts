import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  resolveLiveMediaUrls,
  type LiveMediaUrls,
  type MediaPickRow,
} from "../media-pick";

const BUCKET = "media-public";

/** Approved public media rows for live hero/about/inset binding. */
export async function loadTalentLiveMedia(
  talentProfileId: string,
): Promise<LiveMediaUrls | null> {
  const id = talentProfileId?.trim();
  if (!id) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin
      .from("media_assets")
      .select("storage_path, variant_kind, sort_order")
      .eq("owner_talent_profile_id", id)
      .in("variant_kind", ["public_watermarked", "gallery", "card", "hero"])
      .eq("approval_state", "approved")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .limit(24);
    if (error) {
      logServerError("talentSite.liveMedia.load", error);
      return null;
    }
    const rows: MediaPickRow[] = (data ?? []).map((row) => {
      const r = row as {
        storage_path: string;
        variant_kind: string;
        sort_order: number | null;
      };
      return {
        url: admin.storage.from(BUCKET).getPublicUrl(r.storage_path).data.publicUrl,
        variantKind: r.variant_kind,
        sortOrder: r.sort_order,
      };
    });
    if (rows.length === 0) return null;
    return resolveLiveMediaUrls(rows);
  } catch (err) {
    logServerError("talentSite.liveMedia.load", err);
    return null;
  }
}
