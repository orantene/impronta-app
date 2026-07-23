"use server";

/**
 * Review MEDIA server actions (STANDING v3 item 5) — a reviewer attaches photos
 * to their own client -> talent review.
 *
 * Authenticated reviewers ONLY (the guest token path never uploads). Modeled on
 * client-inquiry-attachments.ts:
 *   - the storage WRITE uses service-role (the media-public bucket's storage RLS
 *     doesn't encode "client-of-this-review"; we validate ownership in app code),
 *   - the metadata INSERT uses the auth-scoped client so the
 *     `talent_review_media_client_insert` RLS policy guards it.
 *
 * The review is resolved by its NATURAL KEY (booking_id, talent_profile_id,
 * client_user_id = auth.uid()), so the uploader is a clean post-submit step: the
 * caller already knows bookingId + talentProfileId, never the review's uuid.
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/** Accepted image mime types + the byte cap (15 MB). */
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);
const MAX_BYTES = 15 * 1024 * 1024;
/** Cap on photos per review, enforced app-side. */
const MAX_PER_REVIEW = 6;

export type ReviewMediaUploadResult =
  | { ok: true; data: { id: string; url: string } }
  | { ok: false; error: string };

/**
 * Attach one photo to the caller's own review for (bookingId, talentProfileId).
 * The review must already exist (submit the review first). Returns the new
 * media row id + its public URL.
 */
export async function uploadReviewMediaAction(
  formData: FormData,
): Promise<ReviewMediaUploadResult> {
  try {
    const bookingId = String(formData.get("bookingId") ?? "").trim();
    const talentProfileId = String(formData.get("talentProfileId") ?? "").trim();
    const file = formData.get("file");

    if (!bookingId || !talentProfileId) {
      return { ok: false, error: "Missing booking or talent." };
    }
    if (!(file instanceof File)) return { ok: false, error: "No file uploaded." };
    if (file.size === 0) return { ok: false, error: "That file is empty." };
    if (file.size > MAX_BYTES) {
      return { ok: false, error: "Each photo must be under 15 MB." };
    }
    const mime = file.type || "";
    if (!ALLOWED_MIME.has(mime)) {
      return { ok: false, error: "Please upload a JP, PNG, WEBP or GIF image." };
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable." };
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Please sign in to add photos." };

    // Resolve the caller's OWN review for this booking + talent (natural key).
    const { data: review, error: reviewErr } = await supabase
      .from("talent_reviews")
      .select("id, tenant_id")
      .eq("booking_id", bookingId)
      .eq("talent_profile_id", talentProfileId)
      .eq("client_user_id", user.id)
      .maybeSingle<{ id: string; tenant_id: string }>();
    if (reviewErr) {
      logServerError("reviews/media/upload/review", reviewErr);
      return { ok: false, error: "Could not find your review." };
    }
    if (!review) {
      return { ok: false, error: "Add your review first, then attach photos." };
    }

    // Enforce the per-review photo cap.
    const { count } = await supabase
      .from("talent_review_media")
      .select("id", { count: "exact", head: true })
      .eq("review_id", review.id)
      .is("deleted_at", null);
    if ((count ?? 0) >= MAX_PER_REVIEW) {
      return { ok: false, error: `You can attach up to ${MAX_PER_REVIEW} photos.` };
    }

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Storage unavailable." };

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const objectId =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storagePath = `review-media/${review.tenant_id}/${review.id}/${objectId}-${safeName}`;

    const { error: uploadErr } = await admin.storage
      .from("media-public")
      .upload(storagePath, file, {
        contentType: mime || "application/octet-stream",
        upsert: false,
      });
    if (uploadErr) {
      logServerError("reviews/media/upload/storage", uploadErr);
      return { ok: false, error: "Upload failed. Please try again." };
    }

    // Metadata insert via the auth-scoped client — RLS
    // talent_review_media_client_insert validates uploader + review ownership.
    const { data: row, error: insertErr } = await supabase
      .from("talent_review_media")
      .insert({
        review_id: review.id,
        tenant_id: review.tenant_id,
        uploader_user_id: user.id,
        bucket_id: "media-public",
        storage_path: storagePath,
        mime_type: mime || null,
        byte_size: file.size,
        sort_order: count ?? 0,
      })
      .select("id")
      .single<{ id: string }>();

    if (insertErr || !row) {
      // Compensating delete so we never leave an orphan storage object.
      await admin.storage.from("media-public").remove([storagePath]);
      logServerError("reviews/media/upload/insert", insertErr);
      return { ok: false, error: "Could not save the photo." };
    }

    const { data: pub } = admin.storage.from("media-public").getPublicUrl(storagePath);
    return { ok: true, data: { id: row.id, url: pub?.publicUrl ?? "" } };
  } catch (err) {
    logServerError("reviews/media/upload", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Soft-delete a review photo the caller uploaded. */
export async function removeReviewMediaAction(
  mediaId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const clean = (mediaId ?? "").trim();
    if (!clean) return { ok: false, error: "Missing photo." };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable." };
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Please sign in." };

    // The uploader_update RLS + the column-guard trigger restrict this to the
    // uploader's own row and to the deleted_at column only.
    const { error } = await supabase
      .from("talent_review_media")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", clean)
      .eq("uploader_user_id", user.id);
    if (error) {
      logServerError("reviews/media/remove", error);
      return { ok: false, error: "Could not remove the photo." };
    }
    return { ok: true };
  } catch (err) {
    logServerError("reviews/media/remove", err);
    return { ok: false, error: "Unexpected error." };
  }
}
