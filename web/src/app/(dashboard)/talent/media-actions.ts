"use server";

import { revalidatePath } from "next/cache";
import { requireTalent } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { revalidateDirectoryListing } from "@/lib/revalidate-public";

function revalidateTalent() {
  revalidatePath("/talent", "layout");
}

export async function reorderGalleryMedia(orderedIds: string[]): Promise<{ error?: string }> {
  const auth = await requireTalent();
  if (!auth.ok) return { error: auth.error };

  const { supabase, user } = auth;
  const { data: profile } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) return { error: "Talent profile not found." };

  const updates = orderedIds.map((id, index) =>
    supabase
      .from("media_assets")
      .update({
        sort_order: (index + 1) * 10,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("owner_talent_profile_id", profile.id)
      .eq("variant_kind", "gallery"),
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    logServerError("talent/reorderGalleryMedia", failed.error);
    return { error: CLIENT_ERROR.update };
  }

  revalidateTalent();
  return {};
}

export async function setPrimaryGalleryMedia(mediaId: string): Promise<{ error?: string }> {
  const auth = await requireTalent();
  if (!auth.ok) return { error: auth.error };

  const { supabase, user } = auth;
  const { data: profile } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) return { error: "Talent profile not found." };

  const { data: galleryRows, error: listErr } = await supabase
    .from("media_assets")
    .select("id, metadata")
    .eq("owner_talent_profile_id", profile.id)
    .eq("variant_kind", "gallery")
    .is("deleted_at", null);

  if (listErr) {
    logServerError("talent/setPrimaryGalleryMedia/list", listErr);
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
      .eq("owner_talent_profile_id", profile.id);

    if (error) {
      logServerError("talent/setPrimaryGalleryMedia/update", error);
      return { error: CLIENT_ERROR.update };
    }
  }

  revalidateTalent();
  return {};
}

export async function softDeleteMediaAsset(mediaId: string): Promise<{ error?: string }> {
  const auth = await requireTalent();
  if (!auth.ok) return { error: auth.error };

  const { supabase, user } = auth;
  const { data: profile } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) return { error: "Talent profile not found." };

  const { data: row, error: fetchErr } = await supabase
    .from("media_assets")
    .select("id, bucket_id, storage_path")
    .eq("id", mediaId)
    .eq("owner_talent_profile_id", profile.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchErr || !row) return { error: "Media not found." };

  const { data: rpcResult, error: rpcErr } = await supabase.rpc("talent_soft_delete_own_media", {
    p_media_id: mediaId,
  });

  if (rpcErr) {
    logServerError("talent/softDeleteMediaAsset/rpc", rpcErr);
    const { error: delErr } = await supabase
      .from("media_assets")
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", mediaId)
      .eq("owner_talent_profile_id", profile.id);

    if (delErr) {
      logServerError("talent/softDeleteMediaAsset/db", delErr);
      return { error: CLIENT_ERROR.update };
    }
  } else {
    const payload = rpcResult as { ok?: boolean; error?: string } | null;
    if (!payload?.ok) {
      if (payload?.error === "not_found") return { error: "Media not found." };
      if (payload?.error === "forbidden") return { error: "Not authorized." };
      return { error: CLIENT_ERROR.update };
    }
  }

  const { error: removeErr } = await supabase.storage.from(row.bucket_id).remove([row.storage_path]);
  if (removeErr) {
    logServerError("talent/softDeleteMediaAsset/storage", removeErr);
  }

  revalidateTalent();
  revalidateDirectoryListing();
  return {};
}

export type RegisterMediaResult =
  | { ok: true; assetId: string }
  | { ok: false; error: string };

/**
 * Persist a gallery row after the client uploaded bytes to `media-public`.
 * Centralizes permission checks and metadata shape for future MCP exposure.
 */
export async function registerGalleryMediaAsset(input: {
  publicPath: string;
  originalStoragePath?: string | null;
  width: number;
  height: number;
  profileCode: string;
  cropMode: string;
}): Promise<RegisterMediaResult> {
  const auth = await requireTalent();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { supabase, user } = auth;
  const { data: profile, error: pErr } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pErr || !profile) return { ok: false, error: "Talent profile not found." };

  const { count: galleryCount, error: countErr } = await supabase
    .from("media_assets")
    .select("id", { count: "exact", head: true })
    .eq("owner_talent_profile_id", profile.id)
    .eq("variant_kind", "gallery")
    .is("deleted_at", null);

  if (countErr) {
    logServerError("talent/registerGallery/count", countErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  const { data: sortRows, error: sortErr } = await supabase
    .from("media_assets")
    .select("sort_order")
    .eq("owner_talent_profile_id", profile.id)
    .eq("variant_kind", "gallery")
    .is("deleted_at", null);

  if (sortErr) {
    logServerError("talent/registerGallery/sort", sortErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  const maxSort = Math.max(
    0,
    ...((sortRows ?? []) as { sort_order: number }[]).map((r) => r.sort_order),
  );
  const nextSort = maxSort + 10;
  const isFirst = (galleryCount ?? 0) === 0;

  const metadata: Record<string, unknown> = {
    profile_code: input.profileCode,
    slot: "portfolio",
    crop_mode: input.cropMode,
  };
  if (input.originalStoragePath) metadata.original_storage_path = input.originalStoragePath;
  if (isFirst) metadata.is_primary = true;

  const { data: inserted, error: insErr } = await supabase
    .from("media_assets")
    .insert({
      owner_talent_profile_id: profile.id,
      uploaded_by_user_id: user.id,
      bucket_id: "media-public",
      storage_path: input.publicPath,
      variant_kind: "gallery",
      sort_order: nextSort,
      approval_state: "pending",
      width: input.width,
      height: input.height,
      metadata,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    logServerError("talent/registerGallery/insert", insErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidateTalent();
  revalidateDirectoryListing();
  return { ok: true, assetId: inserted.id };
}

/**
 * Replace profile photo (card) or banner after storage upload.
 */
export async function registerSlotMediaAsset(input: {
  slot: "avatar" | "banner";
  publicPath: string;
  originalStoragePath?: string | null;
  width: number;
  height: number;
  profileCode: string;
}): Promise<RegisterMediaResult> {
  const auth = await requireTalent();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { supabase, user } = auth;
  const { data: profile, error: pErr } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pErr || !profile) return { ok: false, error: "Talent profile not found." };

  const variantKind = input.slot === "avatar" ? "card" : "banner";

  const { data: previous, error: prevErr } = await supabase
    .from("media_assets")
    .select("id")
    .eq("owner_talent_profile_id", profile.id)
    .eq("variant_kind", variantKind)
    .is("deleted_at", null)
    .maybeSingle();

  if (prevErr) {
    logServerError("talent/registerSlot/prev", prevErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  if (previous?.id) {
    const del = await softDeleteMediaAsset(previous.id);
    if (del.error) return { ok: false, error: del.error };
  }

  const slotLabel = input.slot === "avatar" ? "avatar" : "banner";
  const metadata: Record<string, unknown> = {
    profile_code: input.profileCode,
    slot: slotLabel,
    crop_mode: slotLabel,
  };
  if (input.originalStoragePath) metadata.original_storage_path = input.originalStoragePath;

  const { data: inserted, error: insErr } = await supabase
    .from("media_assets")
    .insert({
      owner_talent_profile_id: profile.id,
      uploaded_by_user_id: user.id,
      bucket_id: "media-public",
      storage_path: input.publicPath,
      variant_kind: variantKind,
      sort_order: 0,
      approval_state: "pending",
      width: input.width,
      height: input.height,
      metadata,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    logServerError("talent/registerSlot/insert", insErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidateTalent();
  revalidateDirectoryListing();
  return { ok: true, assetId: inserted.id };
}
