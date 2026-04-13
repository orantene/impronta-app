"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import {
  STAFF_MEDIA_METADATA_KEYS,
  type StaffMediaApprovalState,
} from "@/lib/admin-media-contract";
import { revalidateDirectoryListing } from "@/lib/revalidate-public";

function revalidateAfterStaffMedia(talentProfileId?: string) {
  revalidatePath("/admin", "layout");
  revalidatePath("/talent", "layout");
  revalidateDirectoryListing();
  if (talentProfileId) {
    revalidatePath(`/admin/talent/${talentProfileId}/media`);
  }
}

export type StaffRegisterMediaResult =
  | { ok: true; assetId: string }
  | { ok: false; error: string };

/** Soft-delete a media row and remove the storage object (staff). */
export async function staffSoftDeleteMediaAsset(
  talentProfileId: string,
  mediaId: string,
): Promise<{ error?: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  const { supabase } = auth;
  const { data: row, error: fetchErr } = await supabase
    .from("media_assets")
    .select("id, bucket_id, storage_path")
    .eq("id", mediaId)
    .eq("owner_talent_profile_id", talentProfileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchErr || !row) {
    if (fetchErr) logServerError("admin/staffSoftDeleteMedia/fetch", fetchErr);
    return { error: CLIENT_ERROR.generic };
  }

  const { error: updErr } = await supabase
    .from("media_assets")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", mediaId)
    .eq("owner_talent_profile_id", talentProfileId);

  if (updErr) {
    logServerError("admin/staffSoftDeleteMedia/update", updErr);
    return { error: CLIENT_ERROR.update };
  }

  const { error: removeErr } = await supabase.storage.from(row.bucket_id).remove([row.storage_path]);
  if (removeErr) logServerError("admin/staffSoftDeleteMedia/storage", removeErr);

  revalidateAfterStaffMedia(talentProfileId);
  return {};
}

/** Register a new gallery asset after staff uploads to `media-public` (auto-approved). */
export async function staffRegisterGalleryMediaAsset(
  talentProfileId: string,
  input: {
    publicPath: string;
    originalStoragePath?: string | null;
    width: number;
    height: number;
    profileCode: string;
    cropMode: string;
    sortOrder?: number;
    setPrimary?: boolean;
  },
): Promise<StaffRegisterMediaResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { supabase, user } = auth;
  const { data: profile, error: pErr } = await supabase
    .from("talent_profiles")
    .select("id, profile_code")
    .eq("id", talentProfileId)
    .maybeSingle();

  if (pErr || !profile) return { ok: false, error: "Talent profile not found." };
  if (profile.profile_code !== input.profileCode) {
    return { ok: false, error: "Profile code mismatch." };
  }

  const { count: galleryCount, error: countErr } = await supabase
    .from("media_assets")
    .select("id", { count: "exact", head: true })
    .eq("owner_talent_profile_id", talentProfileId)
    .eq("variant_kind", "gallery")
    .is("deleted_at", null);

  if (countErr) {
    logServerError("admin/staffRegisterGallery/count", countErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  let nextSort = input.sortOrder;
  if (nextSort == null || !Number.isFinite(nextSort)) {
    const { data: sortRows, error: sortErr } = await supabase
      .from("media_assets")
      .select("sort_order")
      .eq("owner_talent_profile_id", talentProfileId)
      .eq("variant_kind", "gallery")
      .is("deleted_at", null);

    if (sortErr) {
      logServerError("admin/staffRegisterGallery/sort", sortErr);
      return { ok: false, error: CLIENT_ERROR.generic };
    }
    const maxSort = Math.max(
      0,
      ...((sortRows ?? []) as { sort_order: number }[]).map((r) => r.sort_order),
    );
    nextSort = maxSort + 10;
  }

  const isFirst = (galleryCount ?? 0) === 0;
  const metadata: Record<string, unknown> = {
    profile_code: input.profileCode,
    slot: "portfolio",
    crop_mode: input.cropMode,
    staff_upload: true,
  };
  if (input.originalStoragePath) metadata.original_storage_path = input.originalStoragePath;
  if (isFirst) metadata.is_primary = true;

  const { data: inserted, error: insErr } = await supabase
    .from("media_assets")
    .insert({
      owner_talent_profile_id: talentProfileId,
      uploaded_by_user_id: user.id,
      bucket_id: "media-public",
      storage_path: input.publicPath,
      variant_kind: "gallery",
      sort_order: nextSort,
      approval_state: "approved",
      width: input.width,
      height: input.height,
      metadata,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    logServerError("admin/staffRegisterGallery/insert", insErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  if (input.setPrimary) {
    const pr = await staffSetPrimaryGalleryMediaForTalent(talentProfileId, inserted.id);
    if (pr.error) return { ok: false, error: pr.error };
  }

  revalidateAfterStaffMedia(talentProfileId);
  return { ok: true, assetId: inserted.id };
}

/** Replace profile photo (card) or banner after staff uploads to storage. New asset is auto-approved. */
export async function staffRegisterSlotMediaAsset(
  talentProfileId: string,
  input: {
    slot: "avatar" | "banner";
    publicPath: string;
    originalStoragePath?: string | null;
    width: number;
    height: number;
    profileCode: string;
  },
): Promise<StaffRegisterMediaResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { supabase, user } = auth;
  const { data: profile, error: pErr } = await supabase
    .from("talent_profiles")
    .select("id, profile_code")
    .eq("id", talentProfileId)
    .maybeSingle();

  if (pErr || !profile) return { ok: false, error: "Talent profile not found." };
  if (profile.profile_code !== input.profileCode) {
    return { ok: false, error: "Profile code mismatch." };
  }

  const variantKind = input.slot === "avatar" ? "card" : "banner";

  const { data: previous, error: prevErr } = await supabase
    .from("media_assets")
    .select("id")
    .eq("owner_talent_profile_id", talentProfileId)
    .eq("variant_kind", variantKind)
    .is("deleted_at", null)
    .maybeSingle();

  if (prevErr) {
    logServerError("admin/staffRegisterSlot/prev", prevErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  if (previous?.id) {
    const del = await staffSoftDeleteMediaAsset(talentProfileId, previous.id);
    if (del.error) return { ok: false, error: del.error };
  }

  const slotLabel = input.slot === "avatar" ? "avatar" : "banner";
  const metadata: Record<string, unknown> = {
    profile_code: input.profileCode,
    slot: slotLabel,
    crop_mode: slotLabel,
    staff_upload: true,
  };
  if (input.originalStoragePath) metadata.original_storage_path = input.originalStoragePath;

  const { data: inserted, error: insErr } = await supabase
    .from("media_assets")
    .insert({
      owner_talent_profile_id: talentProfileId,
      uploaded_by_user_id: user.id,
      bucket_id: "media-public",
      storage_path: input.publicPath,
      variant_kind: variantKind,
      sort_order: 0,
      approval_state: "approved",
      width: input.width,
      height: input.height,
      metadata,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    logServerError("admin/staffRegisterSlot/insert", insErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidateAfterStaffMedia(talentProfileId);
  return { ok: true, assetId: inserted.id };
}

/** Reorder gallery items for a talent profile (staff). Mirrors talent `reorderGalleryMedia`. */
export async function staffReorderGalleryMediaForTalent(
  talentProfileId: string,
  orderedIds: string[],
): Promise<{ error?: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  const { supabase } = auth;
  const updates = orderedIds.map((id, index) =>
    supabase
      .from("media_assets")
      .update({
        sort_order: (index + 1) * 10,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("owner_talent_profile_id", talentProfileId)
      .eq("variant_kind", "gallery"),
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    logServerError("admin/staffReorderGalleryMedia", failed.error);
    return { error: CLIENT_ERROR.update };
  }

  revalidateAfterStaffMedia(talentProfileId);
  return {};
}

/** Set primary gallery image for a talent profile (staff). Mirrors talent `setPrimaryGalleryMedia`. */
export async function staffSetPrimaryGalleryMediaForTalent(
  talentProfileId: string,
  mediaId: string,
): Promise<{ error?: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  const { supabase } = auth;
  const { data: galleryRows, error: listErr } = await supabase
    .from("media_assets")
    .select("id, metadata")
    .eq("owner_talent_profile_id", talentProfileId)
    .eq("variant_kind", "gallery")
    .is("deleted_at", null);

  if (listErr) {
    logServerError("admin/staffSetPrimaryGallery/list", listErr);
    return { error: CLIENT_ERROR.generic };
  }

  for (const row of galleryRows ?? []) {
    const meta = {
      ...(typeof row.metadata === "object" && row.metadata !== null
        ? (row.metadata as Record<string, unknown>)
        : {}),
      is_primary: row.id === mediaId,
    };
    const { error } = await supabase
      .from("media_assets")
      .update({ metadata: meta, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("owner_talent_profile_id", talentProfileId);

    if (error) {
      logServerError("admin/staffSetPrimaryGallery/update", error);
      return { error: CLIENT_ERROR.update };
    }
  }

  revalidateAfterStaffMedia(talentProfileId);
  return {};
}

/** Update approval state for a single asset (staff review pipeline). */
export async function staffSetMediaApprovalState(
  talentProfileId: string,
  mediaId: string,
  approvalState: StaffMediaApprovalState,
): Promise<{ error?: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  const { supabase, user } = auth;

  const { data: existing, error: fetchErr } = await supabase
    .from("media_assets")
    .select("metadata")
    .eq("id", mediaId)
    .eq("owner_talent_profile_id", talentProfileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchErr || !existing) {
    if (fetchErr) logServerError("admin/staffSetMediaApprovalState/fetch", fetchErr);
    return { error: CLIENT_ERROR.generic };
  }

  const meta = {
    ...(typeof existing.metadata === "object" && existing.metadata !== null
      ? (existing.metadata as Record<string, unknown>)
      : {}),
    [STAFF_MEDIA_METADATA_KEYS.lastReviewedAt]: new Date().toISOString(),
    [STAFF_MEDIA_METADATA_KEYS.reviewedByUserId]: user.id,
  };

  const { error } = await supabase
    .from("media_assets")
    .update({
      approval_state: approvalState,
      metadata: meta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mediaId)
    .eq("owner_talent_profile_id", talentProfileId);

  if (error) {
    logServerError("admin/staffSetMediaApprovalState", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidateAfterStaffMedia(talentProfileId);
  return {};
}
