"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  extractImageMetadata,
  isSafeImageMime,
} from "@/lib/server/media-metadata";
import {
  resizeUploadForStorage,
  shouldResize,
  MAX_UPLOAD_BYTES,
} from "@/lib/server/media-resize";

type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

// ─── Upload and immediately register under a talent ───────────────────────────

export type RegisterMediaResult = ActionResult<{ id: string; publicUrl: string; sourceMediaAssetId: string | null; sortOrder: number }>;

export type UploadVariant = "gallery" | "card" | "hero" | "lightbox" | "polaroid" | "reel";

export async function actionUploadAndAssignMedia(
  formData: FormData,
  talentProfileId: string,
  variantKind: UploadVariant = "gallery",
  metadata: Record<string, unknown> = {},
  sourceMediaAssetId: string | null = null,
): Promise<RegisterMediaResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "No file provided." };
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) return { ok: false, error: "Image or video file only." };
  if (isImage && !isSafeImageMime(file.type)) {
    return { ok: false, error: "SVG and unknown image types are not supported." };
  }
  // Images cap at 8 MB (was 25 MB) — we now sharp-resize server-side
  // before storage, so the raw upload doesn't need to be huge.
  const maxBytes = isVideo ? 200 * 1024 * 1024 : MAX_UPLOAD_BYTES;
  if (file.size > maxBytes) return { ok: false, error: `File must be under ${Math.round(maxBytes / 1024 / 1024)} MB.` };

  const { data: rosterRow } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (!rosterRow) return { ok: false, error: "Talent not on this roster." };

  const inputBytes = await file.arrayBuffer();
  const meta = isImage
    ? await extractImageMetadata(file, inputBytes)
    : {
        width: null,
        height: null,
        fileSizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
        originalFilename: file.name || "upload",
      };

  // Resize images server-side. Videos and unsupported-for-resize image
  // types (SVG already rejected above; GIF would lose animation) pass
  // through unchanged. The resized version is what we serve.
  let uploadBytes: ArrayBuffer | Buffer = inputBytes;
  let uploadContentType = file.type;
  let storedExtOverride: string | null = null;
  let resizedMeta: { width: number; height: number; byteSize: number } | null = null;
  if (isImage && shouldResize(file.type)) {
    try {
      const resized = await resizeUploadForStorage(inputBytes, variantKind);
      uploadBytes = resized.buffer;
      uploadContentType = resized.mimeType;
      storedExtOverride = resized.ext;
      resizedMeta = { width: resized.width, height: resized.height, byteSize: resized.byteSize };
    } catch (e) {
      logServerError("media.actions.uploadAssign.resize", e);
      return { ok: false, error: "Could not process image. Try a different file." };
    }
  }

  const rawExt = (file.name.split(".").pop() ?? (isVideo ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "") || (isVideo ? "mp4" : "jpg");
  const ext = storedExtOverride ?? rawExt;
  const storagePath = `${talentProfileId}/${variantKind}/${randomUUID()}.${ext}`;

  const { error: upErr } = await admin.storage
    .from("media-public")
    .upload(storagePath, uploadBytes, { contentType: uploadContentType, upsert: false });

  if (upErr) {
    logServerError("media.actions.uploadAssign.storage", upErr);
    return { ok: false, error: "Upload failed. Try again." };
  }

  // Singletons (card / hero): exactly one active row at a time. We insert
  // the new row FIRST and only soft-delete previous ones if the insert
  // succeeds — reversing the original order so a failed insert can't leave
  // the talent with no profile/cover photo. Brief window (microseconds)
  // where two rows of the same singleton variant are active; queries that
  // expect one already handle the duplicate via order-by + limit.
  const isSingleton = variantKind === "card" || variantKind === "hero";

  const { data: maxRow } = await admin
    .from("media_assets")
    .select("sort_order")
    .eq("owner_talent_profile_id", talentProfileId)
    .eq("variant_kind", variantKind)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow as { sort_order: number } | null)?.sort_order ?? 0) + 1;

  const { data: inserted, error: insErr } = await admin
    .from("media_assets")
    .insert({
      tenant_id: tenantId,
      owner_talent_profile_id: talentProfileId,
      bucket_id: "media-public",
      storage_path: storagePath,
      variant_kind: variantKind,
      approval_state: "approved",
      sort_order: nextOrder,
      // Prefer post-resize dimensions when sharp ran — they describe the
      // bytes actually living in storage, which is what callers serving
      // the file need to honor (e.g. <Image width/height> hints).
      width: resizedMeta?.width ?? meta.width,
      height: resizedMeta?.height ?? meta.height,
      file_size_bytes: resizedMeta?.byteSize ?? meta.fileSizeBytes,
      mime_type: uploadContentType,
      original_filename: meta.originalFilename,
      metadata,
      source_media_asset_id: sourceMediaAssetId,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    logServerError("media.actions.uploadAssign.insert", insErr);
    admin.storage.from("media-public").remove([storagePath]).catch((err) =>
      logServerError("media.actions.uploadAssign.cleanup", err),
    );
    return { ok: false, error: "Could not save. Try again." };
  }

  // Insert succeeded — now safe to retire the previous singleton.
  if (isSingleton) {
    const now = new Date().toISOString();
    await admin
      .from("media_assets")
      .update({ deleted_at: now, updated_at: now })
      .eq("owner_talent_profile_id", talentProfileId)
      .eq("variant_kind", variantKind)
      .eq("tenant_id", tenantId)
      .neq("id", (inserted as { id: string }).id)
      .is("deleted_at", null);
  }

  const { data: urlData } = admin.storage.from("media-public").getPublicUrl(storagePath);

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return {
    ok: true,
    data: {
      id: (inserted as { id: string }).id,
      publicUrl: urlData.publicUrl,
      // Echo back so the caller can render Revert immediately on crops
      // without waiting for a reload.
      sourceMediaAssetId,
      // Return the server-allocated sort_order so the caller's optimistic
      // append matches the row's real position. Without this the local
      // state shows sortOrder=0 (caller default) until next reload, which
      // can fight drag-reorder if the user reorders right after a crop.
      sortOrder: nextOrder,
    },
  };
}

// ─── Assign existing storage path to a talent (bulk upload flow) ─────────────

export async function actionAssignMediaToTalent(
  storagePaths: string[],
  talentProfileId: string,
): Promise<ActionResult<{ count: number }>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: rosterRow } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (!rosterRow) return { ok: false, error: "Talent not on this roster." };

  const { data: maxRow } = await admin
    .from("media_assets")
    .select("sort_order")
    .eq("owner_talent_profile_id", talentProfileId)
    .eq("variant_kind", "gallery")
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextOrder = ((maxRow as { sort_order: number } | null)?.sort_order ?? 0) + 1;

  const rows = storagePaths.map((sp) => ({
    tenant_id: tenantId,
    owner_talent_profile_id: talentProfileId,
    bucket_id: "media-public",
    storage_path: sp,
    variant_kind: "gallery" as const,
    approval_state: "approved" as const,
    sort_order: nextOrder++,
  }));

  const { error } = await admin.from("media_assets").insert(rows);
  if (error) {
    logServerError("media.actions.assignToTalent", error);
    return { ok: false, error: "Could not assign. Try again." };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: { count: storagePaths.length } };
}

// ─── Soft-delete one or many media assets ────────────────────────────────────

export async function actionDeleteMediaAssets(
  ids: string[],
): Promise<ActionResult<{ count: number }>> {
  if (ids.length === 0) return { ok: true, data: { count: 0 } };

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const now = new Date().toISOString();
  const { error, count } = await admin
    .from("media_assets")
    .update({ deleted_at: now, updated_at: now })
    .in("id", ids)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);

  if (error) {
    logServerError("media.actions.delete", error);
    return { ok: false, error: "Delete failed. Try again." };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: { count: count ?? ids.length } };
}

// ─── Approve / reject media assets ───────────────────────────────────────────

export async function actionSetApprovalState(
  ids: string[],
  state: "approved" | "rejected",
): Promise<ActionResult<{ count: number }>> {
  if (ids.length === 0) return { ok: true, data: { count: 0 } };

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { error, count } = await admin
    .from("media_assets")
    .update({ approval_state: state, updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);

  if (error) {
    logServerError("media.actions.approval", error);
    return { ok: false, error: "Could not update. Try again." };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: { count: count ?? ids.length } };
}

// ─── Re-assign photos to a different talent ───────────────────────────────────

export async function actionReassignMediaToTalent(
  ids: string[],
  talentProfileId: string,
): Promise<ActionResult<{ count: number }>> {
  if (ids.length === 0) return { ok: true, data: { count: 0 } };

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: rosterRow } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (!rosterRow) return { ok: false, error: "Talent not on this roster." };

  const { error, count } = await admin
    .from("media_assets")
    .update({ owner_talent_profile_id: talentProfileId, updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);

  if (error) {
    logServerError("media.actions.reassign", error);
    return { ok: false, error: "Could not reassign. Try again." };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: { count: count ?? ids.length } };
}

// ─── Update per-image watermark override ─────────────────────────────────────

export async function actionSetMediaWatermarkOverride(
  id: string,
  override: Record<string, unknown> | null,
): Promise<ActionResult<null>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { error } = await admin
    .from("media_assets")
    .update({ watermark_override_json: override, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    logServerError("media.actions.watermarkOverride", error);
    return { ok: false, error: "Could not update. Try again." };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: null };
}

// ─── Promote a gallery photo to the talent's card (profile) photo ────────────
//
// Creates a new `card` variant row pointing to the same storage_path.
// Soft-deletes any existing card rows for this talent first so there's always
// exactly one card photo. The gallery row is left untouched.

export async function actionSetAsCardPhoto(
  mediaAssetId: string,
  talentProfileId: string,
): Promise<ActionResult<{ id: string; publicUrl: string }>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  // Verify roster membership
  const { data: rosterRow } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (!rosterRow) return { ok: false, error: "Talent not on this roster." };

  // Fetch the source gallery photo
  const { data: source } = await admin
    .from("media_assets")
    .select("bucket_id, storage_path")
    .eq("id", mediaAssetId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!source) return { ok: false, error: "Photo not found." };

  const now = new Date().toISOString();

  // Soft-delete existing card photos for this talent
  await admin
    .from("media_assets")
    .update({ deleted_at: now, updated_at: now })
    .eq("owner_talent_profile_id", talentProfileId)
    .eq("variant_kind", "card")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);

  // Insert new card row
  const { data: inserted, error } = await admin
    .from("media_assets")
    .insert({
      tenant_id: tenantId,
      owner_talent_profile_id: talentProfileId,
      bucket_id: (source as { bucket_id: string; storage_path: string }).bucket_id,
      storage_path: (source as { bucket_id: string; storage_path: string }).storage_path,
      variant_kind: "card",
      approval_state: "approved",
      sort_order: 0,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    logServerError("media.actions.setCardPhoto", error);
    return { ok: false, error: "Could not set card photo." };
  }

  const { data: urlData } = admin.storage
    .from((source as { bucket_id: string; storage_path: string }).bucket_id)
    .getPublicUrl((source as { bucket_id: string; storage_path: string }).storage_path);

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: { id: (inserted as { id: string }).id, publicUrl: urlData.publicUrl } };
}

// ─── Set a media asset as the talent's hero (cover) photo ────────────────────
//
// Promotes an existing media asset to variant_kind="hero" in-place.
// Soft-deletes any existing hero for this talent first (singleton).
// Mirrors the talent-side `setTalentHero` action so the admin Media page can
// use this without depending on the roster route.

export async function actionSetAsHeroPhoto(
  mediaAssetId: string,
  talentProfileId: string,
): Promise<ActionResult<null>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: rosterRow } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (!rosterRow) return { ok: false, error: "Talent not on this roster." };

  const now = new Date().toISOString();

  await admin
    .from("media_assets")
    .update({ deleted_at: now, updated_at: now })
    .eq("owner_talent_profile_id", talentProfileId)
    .eq("variant_kind", "hero")
    .eq("tenant_id", tenantId)
    .neq("id", mediaAssetId)
    .is("deleted_at", null);

  const { error } = await admin
    .from("media_assets")
    .update({ variant_kind: "hero", sort_order: 0, updated_at: now })
    .eq("id", mediaAssetId)
    .eq("tenant_id", tenantId)
    .eq("owner_talent_profile_id", talentProfileId);

  if (error) {
    logServerError("media.actions.setHeroPhoto", error);
    return { ok: false, error: "Could not set cover photo." };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: null };
}

// ─── Revert a cropped photo to its original ──────────────────────────────────
//
// When a photo is a crop derivative (source_media_asset_id is set), this
// soft-deletes the crop and returns the source asset id so the UI can navigate
// back to the original. If the photo has no source link, returns null.

export async function actionRevertCropToSource(
  croppedMediaAssetId: string,
): Promise<ActionResult<{ sourceMediaAssetId: string | null }>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: crop } = await admin
    .from("media_assets")
    .select("source_media_asset_id")
    .eq("id", croppedMediaAssetId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!crop) return { ok: false, error: "Photo not found." };
  const sourceId = (crop as { source_media_asset_id: string | null }).source_media_asset_id;
  if (!sourceId) return { ok: false, error: "This photo has no original on record." };

  const now = new Date().toISOString();
  const { error } = await admin
    .from("media_assets")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", croppedMediaAssetId)
    .eq("tenant_id", tenantId);

  if (error) {
    logServerError("media.actions.revertCrop", error);
    return { ok: false, error: "Could not revert. Try again." };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: { sourceMediaAssetId: sourceId } };
}

// ─── Reorder media assets for a talent ───────────────────────────────────────
//
// Receives an ordered array of asset IDs and writes sort_order 1…N. Used by
// the drag-to-reorder UI in the media gallery.

export async function actionReorderMediaAssets(
  orderedIds: string[],
): Promise<ActionResult<{ count: number }>> {
  if (orderedIds.length === 0) return { ok: true, data: { count: 0 } };

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const now = new Date().toISOString();
  const updates = orderedIds.map((id, i) =>
    admin
      .from("media_assets")
      .update({ sort_order: i + 1, updated_at: now })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null),
  );

  const results = await Promise.all(updates);
  const failed = results.filter((r) => r.error).length;
  if (failed > 0) {
    logServerError("media.actions.reorder", `${failed} updates failed`);
    return { ok: false, error: "Some reorder updates failed." };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: { count: orderedIds.length } };
}

// ─── Upload file to storage only — no DB row (staging flow) ─────────────────
//
// Step 1 of the two-step upload: file lands in storage immediately so the
// admin can see thumbnails while deciding which talent each photo belongs to.
// Step 2 is actionBulkAssignStagedMedia which creates all DB rows at once.

export type StagedMediaMeta = {
  width: number | null;
  height: number | null;
  fileSizeBytes: number;
  mimeType: string;
  originalFilename: string;
};

export type StagingUploadResult = ActionResult<{
  storagePath: string;
  publicUrl: string;
  meta: StagedMediaMeta;
}>;

export async function actionUploadToStagingStorage(
  formData: FormData,
): Promise<StagingUploadResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "No file provided." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "Images only." };
  if (!isSafeImageMime(file.type)) {
    return { ok: false, error: "SVG and unknown image types are not supported." };
  }
  // 8 MB cap (down from 25 MB) — sharp re-encodes server-side now, so
  // raw uploads don't need to be huge. See media-resize.ts.
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "File must be under 8 MB." };

  const inputBytes = await file.arrayBuffer();
  const meta = await extractImageMetadata(file, inputBytes);

  // Staging uploads land as "gallery" by default — most are assigned to
  // a talent gallery in step 2. Use gallery sizing.
  let uploadBytes: ArrayBuffer | Buffer = inputBytes;
  let uploadContentType = file.type;
  let storedExt = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  let resizedMeta: { width: number; height: number; byteSize: number } | null = null;
  if (shouldResize(file.type)) {
    try {
      const resized = await resizeUploadForStorage(inputBytes, "gallery");
      uploadBytes = resized.buffer;
      uploadContentType = resized.mimeType;
      storedExt = resized.ext;
      resizedMeta = { width: resized.width, height: resized.height, byteSize: resized.byteSize };
    } catch (e) {
      logServerError("media.actions.stagingUpload.resize", e);
      return { ok: false, error: "Could not process image. Try a different file." };
    }
  }

  const storagePath = `${tenantId}/staging/${randomUUID()}.${storedExt}`;

  const { error: upErr } = await admin.storage
    .from("media-public")
    .upload(storagePath, uploadBytes, { contentType: uploadContentType, upsert: false });

  if (upErr) {
    logServerError("media.actions.stagingUpload", upErr);
    return { ok: false, error: "Upload failed. Try again." };
  }

  const { data: urlData } = admin.storage.from("media-public").getPublicUrl(storagePath);
  return {
    ok: true,
    data: {
      storagePath,
      publicUrl: urlData.publicUrl,
      meta: {
        // Return post-resize dims so step 2's media_assets row matches
        // what's actually in storage.
        width: resizedMeta?.width ?? meta.width,
        height: resizedMeta?.height ?? meta.height,
        fileSizeBytes: resizedMeta?.byteSize ?? meta.fileSizeBytes,
        mimeType: uploadContentType,
        originalFilename: meta.originalFilename,
      },
    },
  };
}

// ─── Cleanup orphaned staging objects (cancel path) ──────────────────────────

export async function actionCleanupStagedObjects(
  storagePaths: string[],
): Promise<ActionResult<{ count: number }>> {
  if (storagePaths.length === 0) return { ok: true, data: { count: 0 } };

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  // Only allow paths within this tenant's staging prefix — never let a caller
  // request deletion of arbitrary storage paths.
  const safePaths = storagePaths.filter((sp) => sp.startsWith(`${tenantId}/staging/`));
  if (safePaths.length === 0) return { ok: true, data: { count: 0 } };

  const { error } = await admin.storage.from("media-public").remove(safePaths);
  if (error) {
    logServerError("media.actions.cleanupStaged", error);
    return { ok: false, error: "Could not clean up." };
  }
  return { ok: true, data: { count: safePaths.length } };
}

// ─── Bulk-assign staged storage paths to talents ─────────────────────────────
//
// Step 2: receives the full assignment list [{storagePath, talentProfileId}],
// validates roster membership for every unique talent, then inserts all DB
// rows in one shot (grouped sort_order per talent).

export type BulkAssignAssignment = {
  storagePath: string;
  talentProfileId: string;
  meta?: StagedMediaMeta;
};

export async function actionBulkAssignStagedMedia(
  assignments: BulkAssignAssignment[],
): Promise<ActionResult<{ count: number }>> {
  if (assignments.length === 0) return { ok: true, data: { count: 0 } };

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const uniqueTalentIds = [...new Set(assignments.map((a) => a.talentProfileId))];

  const { data: rosterRows } = await admin
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .in("talent_profile_id", uniqueTalentIds)
    .neq("status", "removed");

  const validIds = new Set((rosterRows ?? []).map((r) => r.talent_profile_id as string));
  if (!uniqueTalentIds.every((id) => validIds.has(id))) {
    return { ok: false, error: "One or more talents not on this roster." };
  }

  // Allocate sort_order via an atomic RPC so concurrent batches can't collide.
  // Falls back to a best-effort max-select pattern if the RPC isn't available.
  const sortOrders: Record<string, number> = {};
  await Promise.all(
    uniqueTalentIds.map(async (talentId) => {
      const countForTalent = assignments.filter(
        (a) => a.talentProfileId === talentId,
      ).length;
      const rpc = await admin.rpc("allocate_media_gallery_sort_order", {
        p_talent_profile_id: talentId,
        p_count: countForTalent,
      });
      if (rpc.error || typeof rpc.data !== "number") {
        // Fallback: read current max and start there. Note this is not
        // race-free without the RPC, but it's better than nothing.
        const { data: maxRow } = await admin
          .from("media_assets")
          .select("sort_order")
          .eq("owner_talent_profile_id", talentId)
          .eq("variant_kind", "gallery")
          .is("deleted_at", null)
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle();
        sortOrders[talentId] = ((maxRow as { sort_order: number } | null)?.sort_order ?? 0) + 1;
      } else {
        sortOrders[talentId] = rpc.data;
      }
    }),
  );

  const rows = assignments.map((a) => {
    const meta = a.meta;
    return {
      tenant_id: tenantId,
      owner_talent_profile_id: a.talentProfileId,
      bucket_id: "media-public",
      storage_path: a.storagePath,
      variant_kind: "gallery" as const,
      approval_state: "approved" as const,
      sort_order: sortOrders[a.talentProfileId]++,
      width: meta?.width ?? null,
      height: meta?.height ?? null,
      file_size_bytes: meta?.fileSizeBytes ?? null,
      mime_type: meta?.mimeType ?? null,
      original_filename: meta?.originalFilename ?? null,
    };
  });

  const { error } = await admin.from("media_assets").insert(rows);
  if (error) {
    logServerError("media.actions.bulkAssignStaged", error);
    return { ok: false, error: "Could not save. Try again." };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: { count: rows.length } };
}

// ─── Load roster talent list for assign/reassign dropdown ────────────────────

export type RosterTalentOption = { id: string; name: string; thumbUrl: string | null };

export async function actionLoadRosterTalents(): Promise<ActionResult<RosterTalentOption[]>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data, error } = await admin
    .from("agency_talent_roster")
    .select(`
      talent_profiles!talent_profile_id (
        id,
        display_name,
        first_name,
        last_name
      )
    `)
    .eq("tenant_id", tenantId)
    .neq("status", "removed")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    logServerError("media.actions.loadRosterTalents", error);
    return { ok: false, error: "Could not load roster." };
  }

  type TalentProfileJoin = {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  };
  type RosterTalentJoin = {
    talent_profiles: TalentProfileJoin | TalentProfileJoin[] | null;
  };

  const talents: RosterTalentOption[] = ((data ?? []) as unknown as RosterTalentJoin[])
    .map((r) =>
      Array.isArray(r.talent_profiles) ? (r.talent_profiles[0] ?? null) : r.talent_profiles,
    )
    .filter((profile): profile is TalentProfileJoin => Boolean(profile))
    .map((p) => ({
      id: p.id,
      name: p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed",
      thumbUrl: null,
    }));

  return { ok: true, data: talents };
}

// ─── Talent identity documents (private bucket) ──────────────────────────────
// Uploads a single file to `media-originals` (private bucket). Returns the
// storage path so the drawer can persist the metadata list back to the
// `talent_profiles.documents_data` JSONB column. The file itself is NOT made
// public — only signed URLs from the admin can read it.

export type DocumentUploadResult = ActionResult<{
  storagePath: string;
  bucketId: string;
  sizeBytes: number;
  mimeType: string;
}>;

export async function actionUploadTalentDocument(
  formData: FormData,
  talentProfileId: string,
): Promise<DocumentUploadResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "No file provided." };
  // 50MB cap — generous for PDF contracts but blocks runaway uploads.
  if (file.size > 50 * 1024 * 1024) return { ok: false, error: "File must be under 50 MB." };

  // Roster guard.
  const { data: rosterRow } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (!rosterRow) return { ok: false, error: "Talent not on this roster." };

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const storagePath = `${talentProfileId}/documents/${randomUUID()}.${ext}`;

  const bytes = await file.arrayBuffer();
  const { error: upErr } = await admin.storage
    .from("media-originals")
    .upload(storagePath, bytes, { contentType: file.type || "application/octet-stream", upsert: false });

  if (upErr) {
    logServerError("media.actions.uploadTalentDocument", upErr);
    return { ok: false, error: "Upload failed. Try again." };
  }

  return {
    ok: true,
    data: {
      storagePath,
      bucketId: "media-originals",
      sizeBytes: file.size,
      mimeType: file.type || "application/octet-stream",
    },
  };
}

/** Generate a short-lived signed URL for a talent document (5 minutes). */
export async function actionGetTalentDocumentSignedUrl(
  bucketId: string,
  storagePath: string,
  talentProfileId: string,
): Promise<ActionResult<{ url: string }>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  // Roster guard.
  const { data: rosterRow } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (!rosterRow) return { ok: false, error: "Talent not on this roster." };

  const { data, error } = await admin.storage.from(bucketId).createSignedUrl(storagePath, 300);
  if (error || !data) {
    logServerError("media.actions.getDocumentSignedUrl", error);
    return { ok: false, error: "Could not generate download link." };
  }
  return { ok: true, data: { url: data.signedUrl } };
}

/** Delete a document: removes from storage AND filters it from
 *  talent_profiles.documents_data in one call so callers can't orphan
 *  either side. Pass the documentId that matches the entry in documents_data. */
export async function actionDeleteTalentDocument(
  bucketId: string,
  storagePath: string,
  talentProfileId: string,
  documentId?: string,
): Promise<ActionResult<null>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  // Roster guard.
  const { data: rosterRow } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (!rosterRow) return { ok: false, error: "Talent not on this roster." };

  const { error: storageErr } = await admin.storage.from(bucketId).remove([storagePath]);
  if (storageErr) {
    logServerError("media.actions.deleteTalentDocument.storage", storageErr);
    return { ok: false, error: "Could not delete file from storage." };
  }

  // Remove the matching entry from documents_data so the DB stays in sync
  // with storage. If documentId is omitted we fall back to matching by storagePath.
  if (documentId || storagePath) {
    const { data: profile } = await admin
      .from("talent_profiles")
      .select("documents_data")
      .eq("id", talentProfileId)
      .maybeSingle();
    if (profile) {
      const existing = Array.isArray(profile.documents_data) ? profile.documents_data as Array<Record<string, unknown>> : [];
      const filtered = existing.filter(d =>
        documentId ? d.id !== documentId : d.storagePath !== storagePath,
      );
      await admin
        .from("talent_profiles")
        .update({ documents_data: filtered })
        .eq("id", talentProfileId);
    }
  }

  return { ok: true, data: null };
}

// ─── Load full media set for a single talent (drawer hydration) ──────────────

export type TalentMediaItem = {
  id: string;
  url: string;
  variantKind: string;
  sortOrder: number;
  metadata: Record<string, unknown>;
  /** Parent asset id when this row is a crop / baked-watermark derivative.
   *  Drives "Revert to original" in the lightbox. */
  sourceMediaAssetId: string | null;
};

export type TalentMediaBundle = {
  /** Gallery photos — sorted by sort_order. */
  gallery: TalentMediaItem[];
  /** Hero image (4:5 portrait) — at most one (singleton). */
  hero: TalentMediaItem | null;
  /** Card / headshot — at most one (singleton). */
  card: TalentMediaItem | null;
  /** Polaroids keyed by their slot id (e.g. "front", "side", "smile"). */
  polaroids: Record<string, TalentMediaItem>;
  /** Hello reel — at most one video (singleton). */
  reel: TalentMediaItem | null;
};

/** Per-variant gallery loader kept for backwards-compat (the drawer's
 *  gallery section calls this). For full hydration use actionLoadTalentMediaBundle. */
export type TalentGalleryItem = { id: string; url: string; sortOrder: number };

export async function actionLoadTalentGallery(
  talentProfileId: string,
): Promise<ActionResult<TalentGalleryItem[]>> {
  const bundle = await actionLoadTalentMediaBundle(talentProfileId);
  if (!bundle.ok) return bundle;
  return { ok: true, data: bundle.data.gallery.map((g) => ({ id: g.id, url: g.url, sortOrder: g.sortOrder })) };
}

export async function actionLoadTalentMediaBundle(
  talentProfileId: string,
): Promise<ActionResult<TalentMediaBundle>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: rosterRow } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (!rosterRow) return { ok: false, error: "Talent not on this roster." };

  const { data, error } = await admin
    .from("media_assets")
    .select("id, bucket_id, storage_path, variant_kind, sort_order, metadata, source_media_asset_id, created_at")
    .eq("owner_talent_profile_id", talentProfileId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (error) {
    logServerError("media.actions.loadTalentMediaBundle", error);
    return { ok: false, error: "Could not load media." };
  }

  type Row = {
    id: string;
    bucket_id: string;
    storage_path: string;
    variant_kind: string;
    sort_order: number | null;
    metadata: Record<string, unknown> | null;
    source_media_asset_id: string | null;
    created_at: string;
  };

  const bundle: TalentMediaBundle = { gallery: [], hero: null, card: null, polaroids: {}, reel: null };

  for (const r of (data as Row[] | null ?? [])) {
    const item: TalentMediaItem = {
      id: r.id,
      url: admin.storage.from(r.bucket_id).getPublicUrl(r.storage_path).data.publicUrl,
      variantKind: r.variant_kind,
      sortOrder: r.sort_order ?? 0,
      metadata: r.metadata ?? {},
      sourceMediaAssetId: r.source_media_asset_id,
    };
    if (r.variant_kind === "polaroid") {
      const slot = (item.metadata.polaroidSlot ?? item.metadata.slot ?? r.id) as string;
      bundle.polaroids[slot] = item;
    } else if (r.variant_kind === "hero") {
      if (!bundle.hero) bundle.hero = item;
    } else if (r.variant_kind === "card") {
      if (!bundle.card) bundle.card = item;
    } else if (r.variant_kind === "reel") {
      if (!bundle.reel) bundle.reel = item;
    } else if (r.variant_kind === "gallery") {
      bundle.gallery.push(item);
    }
  }

  return { ok: true, data: bundle };
}

// ─── Media count (used by drive import progress polling) ─────────────────────

export async function actionGetMediaCount(): Promise<ActionResult<{ count: number }>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { count, error } = await admin
    .from("media_assets")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", auth.tenantId)
    .is("deleted_at", null);

  if (error) return { ok: false, error: "Could not count." };
  return { ok: true, data: { count: count ?? 0 } };
}

// ─── Google Drive import ──────────────────────────────────────────────────────

export type DriveImportResult = ActionResult<{ assets: Array<{ id: string; publicUrl: string }> }>;

/** Phase 1 — list files without downloading. Returns file IDs and count.
 *  Walks Drive pagination so we never silently truncate at pageSize. */
export async function actionListDriveFolder(
  driveUrl: string,
): Promise<ActionResult<{ fileIds: string[]; count: number; truncated: boolean }>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = parseDriveUrl(driveUrl);
  if (!parsed) return { ok: false, error: "Paste a Google Drive file or folder share link." };

  if (parsed.kind === "file") {
    return { ok: true, data: { fileIds: [parsed.fileId], count: 1, truncated: false } };
  }

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) return { ok: false, error: "Google Drive API key not configured." };

  const fileIds: string[] = [];
  let pageToken: string | undefined;
  const MAX_PAGES = 10; // hard cap so a hostile folder can't run us forever
  let pages = 0;
  while (pages < MAX_PAGES) {
    pages += 1;
    const q = encodeURIComponent(`'${parsed.folderId}' in parents and mimeType contains 'image/'`);
    const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType),nextPageToken&pageSize=200${tokenParam}&key=${encodeURIComponent(apiKey)}`;
    let listRes: Response;
    try {
      listRes = await fetch(listUrl);
    } catch {
      return { ok: false, error: "Could not reach Google Drive API." };
    }
    if (!listRes.ok) {
      return { ok: false, error: "Could not list folder — make sure it is shared as 'Anyone with the link'." };
    }
    const listData = (await listRes.json()) as {
      files?: Array<{ id: string; mimeType: string }>;
      nextPageToken?: string;
    };
    for (const f of listData.files ?? []) {
      if (f.mimeType.startsWith("image/")) fileIds.push(f.id);
    }
    pageToken = listData.nextPageToken;
    if (!pageToken) break;
  }
  if (fileIds.length === 0) return { ok: false, error: "No images found in this folder." };

  const truncated = pages >= MAX_PAGES && Boolean(pageToken);
  return { ok: true, data: { fileIds, count: fileIds.length, truncated } };
}

function parseDriveUrl(url: string): { kind: "file"; fileId: string } | { kind: "folder"; folderId: string } | null {
  try {
    const u = new URL(url.trim());
    const fileMatch = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch) return { kind: "file", fileId: fileMatch[1]! };
    const folderMatch = u.pathname.match(/\/folders\/([^/?]+)/);
    if (folderMatch) return { kind: "folder", folderId: folderMatch[1]! };
    const id = u.searchParams.get("id");
    if (id) return { kind: "file", fileId: id };
    return null;
  } catch {
    return null;
  }
}

async function downloadDriveFile(fileId: string): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  const url = `https://drive.usercontent.google.com/u/0/uc?id=${encodeURIComponent(fileId)}&export=download`;
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return null;
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength < 1000) return null; // likely an error HTML page
  return { buffer, contentType };
}

/** Phase 2 — import a single Drive file by its ID. Returns the created asset. */
export async function actionImportSingleDriveFile(
  fileId: string,
  talentProfileId: string,
  sortOrder: number,
): Promise<ActionResult<{ id: string; publicUrl: string }>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: rosterRow } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (!rosterRow) return { ok: false, error: "Talent not on this roster." };

  const downloaded = await downloadDriveFile(fileId);
  if (!downloaded) return { ok: false, error: "Could not download — make sure the file is shared as \"Anyone with the link\"." };

  // Apply the same sharp resize the direct-upload path uses, so Drive
  // imports don't bypass egress hygiene. Drive files are bounded by
  // Drive's own quotas (no extra cap here); the resize cuts the served
  // bytes regardless.
  let storedBuffer: ArrayBuffer | Buffer = downloaded.buffer;
  let storedContentType = downloaded.contentType;
  let storedExt = downloaded.contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  let storedWidth: number | null = null;
  let storedHeight: number | null = null;
  let storedByteSize = downloaded.buffer.byteLength;
  if (shouldResize(downloaded.contentType)) {
    try {
      const resized = await resizeUploadForStorage(downloaded.buffer, "gallery");
      storedBuffer = resized.buffer;
      storedContentType = resized.mimeType;
      storedExt = resized.ext;
      storedWidth = resized.width;
      storedHeight = resized.height;
      storedByteSize = resized.byteSize;
    } catch (e) {
      logServerError("media.actions.importSingle.resize", e);
      return { ok: false, error: "Could not process image from Drive." };
    }
  } else {
    // Best-effort metadata for pass-through formats.
    try {
      const sharpMod = (await import("sharp")).default;
      const m = await sharpMod(Buffer.from(downloaded.buffer)).metadata();
      storedWidth = typeof m.width === "number" ? m.width : null;
      storedHeight = typeof m.height === "number" ? m.height : null;
    } catch {
      /* metadata is best-effort */
    }
  }

  const storagePath = `${talentProfileId}/gallery/${randomUUID()}.${storedExt}`;

  const { error: upErr } = await admin.storage
    .from("media-public")
    .upload(storagePath, storedBuffer, { contentType: storedContentType, upsert: false });
  if (upErr) return { ok: false, error: "Upload failed." };

  const { data: inserted, error: insErr } = await admin
    .from("media_assets")
    .insert({
      tenant_id: tenantId,
      owner_talent_profile_id: talentProfileId,
      bucket_id: "media-public",
      storage_path: storagePath,
      variant_kind: "gallery",
      approval_state: "approved",
      sort_order: sortOrder,
      width: storedWidth,
      height: storedHeight,
      file_size_bytes: storedByteSize,
      mime_type: storedContentType,
      original_filename: `drive-${fileId}`,
      metadata: { source: "google_drive", drive_file_id: fileId },
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    logServerError("media.actions.importSingle.insert", insErr);
    admin.storage.from("media-public").remove([storagePath]).catch((err) =>
      logServerError("media.actions.importSingle.cleanup", err),
    );
    return { ok: false, error: "Could not register file." };
  }

  const { data: urlData } = admin.storage.from("media-public").getPublicUrl(storagePath);
  return { ok: true, data: { id: (inserted as { id: string }).id, publicUrl: urlData.publicUrl } };
}

export async function actionImportFromGoogleDrive(
  driveUrl: string,
  talentProfileId: string,
  /** When provided, skip re-listing the folder and use these IDs directly.
   *  This is the canonical path from the UI — Check returns fileIds, Import
   *  threads them straight through so the two never disagree on count. */
  preResolvedFileIds?: string[],
): Promise<DriveImportResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: rosterRow } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (!rosterRow) return { ok: false, error: "Talent not on this roster." };

  let fileIds: string[];
  if (preResolvedFileIds && preResolvedFileIds.length > 0) {
    fileIds = preResolvedFileIds;
  } else {
    const list = await actionListDriveFolder(driveUrl);
    if (!list.ok) return { ok: false, error: list.error };
    fileIds = list.data.fileIds;
  }
  if (fileIds.length === 0) return { ok: false, error: "Nothing to import." };

  const { data: maxRow } = await admin
    .from("media_assets")
    .select("sort_order")
    .eq("owner_talent_profile_id", talentProfileId)
    .eq("variant_kind", "gallery")
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextOrder = ((maxRow as { sort_order: number } | null)?.sort_order ?? 0) + 1;

  const results: Array<{ id: string; publicUrl: string }> = [];
  const errors: string[] = [];

  for (const fileId of fileIds) {
    const downloaded = await downloadDriveFile(fileId);
    if (!downloaded) {
      errors.push(`Could not download file ${fileId} — make sure it's shared as "Anyone with the link."`);
      continue;
    }

    // Same resize as actionImportSingleDriveFile — see comments there.
    let storedBuffer: ArrayBuffer | Buffer = downloaded.buffer;
    let storedContentType = downloaded.contentType;
    let storedExt = downloaded.contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    let driveMetaWidth: number | null = null;
    let driveMetaHeight: number | null = null;
    let storedByteSize = downloaded.buffer.byteLength;
    if (shouldResize(downloaded.contentType)) {
      try {
        const resized = await resizeUploadForStorage(downloaded.buffer, "gallery");
        storedBuffer = resized.buffer;
        storedContentType = resized.mimeType;
        storedExt = resized.ext;
        driveMetaWidth = resized.width;
        driveMetaHeight = resized.height;
        storedByteSize = resized.byteSize;
      } catch (e) {
        logServerError("media.actions.importBulk.resize", e);
        errors.push(`Could not process one file.`);
        continue;
      }
    } else {
      try {
        const sharpMod = (await import("sharp")).default;
        const m = await sharpMod(Buffer.from(downloaded.buffer)).metadata();
        driveMetaWidth = typeof m.width === "number" ? m.width : null;
        driveMetaHeight = typeof m.height === "number" ? m.height : null;
      } catch {
        /* metadata is best-effort */
      }
    }

    const storagePath = `${talentProfileId}/gallery/${randomUUID()}.${storedExt}`;

    const { error: upErr } = await admin.storage
      .from("media-public")
      .upload(storagePath, storedBuffer, { contentType: storedContentType, upsert: false });

    if (upErr) {
      errors.push(`Upload failed for one file.`);
      continue;
    }

    const { data: inserted, error: insErr } = await admin
      .from("media_assets")
      .insert({
        tenant_id: tenantId,
        owner_talent_profile_id: talentProfileId,
        bucket_id: "media-public",
        storage_path: storagePath,
        variant_kind: "gallery",
        approval_state: "approved",
        sort_order: nextOrder++,
        width: driveMetaWidth,
        height: driveMetaHeight,
        file_size_bytes: storedByteSize,
        mime_type: storedContentType,
        original_filename: `drive-${fileId}`,
        metadata: { source: "google_drive", drive_file_id: fileId },
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      logServerError("media.actions.importBulk.insert", insErr);
      admin.storage.from("media-public").remove([storagePath]).catch((err) =>
        logServerError("media.actions.importBulk.cleanup", err),
      );
      errors.push(`Could not register one file.`);
      continue;
    }

    const { data: urlData } = admin.storage.from("media-public").getPublicUrl(storagePath);
    results.push({ id: (inserted as { id: string }).id, publicUrl: urlData.publicUrl });
  }

  if (results.length === 0) {
    return { ok: false, error: errors[0] ?? "Import failed." };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: { assets: results } };
}
