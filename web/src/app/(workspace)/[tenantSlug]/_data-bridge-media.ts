import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

/**
 * _data-bridge-media.ts — server-side loader for the workspace Media page.
 *
 * Returns every `media_assets` row owned by a talent that belongs to this
 * tenant's roster. Approved + pending originals only. RLS handles tenant
 * isolation via talent_profile_id → agency_talent_roster scoping.
 *
 * Each row carries the public-bucket URL so the Media gallery can render
 * the photo directly. Per-image watermark override (if any) is included
 * so the editor drawer can pre-fill.
 */

export type WorkspaceMediaPhoto = {
  id: string;
  talentProfileId: string;
  talentName: string;
  /** Public URL resolved from bucket + storage_path. */
  url: string;
  thumbUrl: string;
  variantKind: string;
  approvalState: "approved" | "pending" | "rejected";
  /** True when a per-image override exists (distinct from workspace-default WM). */
  hasOverride: boolean;
  watermarkOverride: unknown | null;
  createdAt: string;
};

type MediaRow = {
  id: string;
  owner_talent_profile_id: string;
  bucket_id: string;
  storage_path: string;
  variant_kind: string;
  approval_state: string;
  watermark_override_json: unknown | null;
  source_media_asset_id: string | null;
  created_at: string;
  talent_profiles: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    tenant_id: string | null;
  } | null;
};

export async function loadWorkspaceMediaPhotos(
  tenantId: string,
): Promise<WorkspaceMediaPhoto[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    // Join media_assets -> talent_profiles, filter to current tenant via
    // agency_talent_roster membership. We pull card + gallery variants
    // (the canonical taxonomy after the portfolio→gallery migration).
    const { data, error } = await supabase
      .from("media_assets")
      .select(`
        id,
        owner_talent_profile_id,
        bucket_id,
        storage_path,
        variant_kind,
        approval_state,
        watermark_override_json,
        source_media_asset_id,
        created_at,
        talent_profiles!owner_talent_profile_id (
          id,
          display_name,
          first_name,
          last_name,
          agency_talent_roster!inner (
            tenant_id,
            status
          )
        )
      `)
      .in("variant_kind", ["card", "gallery"])
      .is("deleted_at", null)
      .eq("talent_profiles.agency_talent_roster.tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      logServerError("data-bridge.media.list", error);
      return [];
    }

    const rows = (data ?? []) as unknown as MediaRow[];

    // Resolve public URLs in parallel. For media-public bucket we use the
    // public URL directly; for media-originals we'd need a signed URL but
    // the Media page only shows public-bucket entries anyway.
    const photos: WorkspaceMediaPhoto[] = rows
      .filter((r) => !!r.talent_profiles)
      .map((r) => {
        const tp = r.talent_profiles!;
        const display =
          tp.display_name ||
          [tp.first_name, tp.last_name].filter(Boolean).join(" ") ||
          "Unnamed";

        // Public bucket URL
        const { data: urlData } = supabase.storage
          .from(r.bucket_id)
          .getPublicUrl(r.storage_path);
        const publicUrl = urlData?.publicUrl ?? "";

        return {
          id: r.id,
          talentProfileId: r.owner_talent_profile_id,
          talentName: display,
          url: publicUrl,
          thumbUrl: publicUrl,
          variantKind: r.variant_kind,
          approvalState: r.approval_state as WorkspaceMediaPhoto["approvalState"],
          hasOverride: r.watermark_override_json !== null,
          watermarkOverride: r.watermark_override_json,
          createdAt: r.created_at,
        };
      });

    return photos;
  } catch (err) {
    logServerError("data-bridge.media.unknown", err);
    return [];
  }
}
