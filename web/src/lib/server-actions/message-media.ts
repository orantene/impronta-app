"use server";

/**
 * Signed reads for media attached to a conversation message.
 *
 * Inbound WhatsApp photos and documents are uploaded by the channel worker to
 * the private `inquiry-files` bucket, and the storage path is recorded in
 * `inquiry_messages.card_payload.media`. The bucket is staff-gated, so the
 * thread cannot link to it directly.
 *
 * The client hands over a MESSAGE id, never a storage path: the path is read
 * back from the tenant-scoped row, so there is no way to talk this action into
 * signing an arbitrary object. Same shape as `getVoicePlaybackUrl`, and the
 * service-role key stays on the server.
 */

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

const BUCKET = "inquiry-files";
const SIGNED_URL_TTL_SECONDS = 60 * 10;

export type MessageMediaUrl =
  | { ok: true; url: string; mime: string }
  | { ok: false; reason: "not_allowed" | "not_found" | "unavailable" };

function readMediaPayload(
  payload: unknown,
): { path: string; mime: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const media = (payload as { media?: unknown }).media;
  if (!media || typeof media !== "object") return null;
  const path = (media as { url?: unknown }).url;
  const mime = (media as { mime?: unknown }).mime;
  if (typeof path !== "string" || path.trim() === "") return null;
  // A worker-written path is always `{tenantId}/whatsapp/...`. Anything with a
  // traversal segment or an absolute form is not one of ours.
  if (path.startsWith("/") || path.includes("..")) return null;
  return { path, mime: typeof mime === "string" && mime ? mime : "application/octet-stream" };
}

export async function getMessageMediaUrl(messageId: string): Promise<MessageMediaUrl> {
  try {
    const id = String(messageId ?? "").trim();
    if (!id) return { ok: false, reason: "not_found" };

    const guard = await requireWorkspaceStaffAction();
    if (!guard.ok) return { ok: false, reason: "not_allowed" };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };

    const { data, error } = await tenantScopedQuery(admin, "inquiry_messages", guard.tenantId)
      .select("id, card_payload")
      .eq("id", id)
      .maybeSingle();
    if (error) return { ok: false, reason: "unavailable" };
    const media = readMediaPayload((data as { card_payload?: unknown } | null)?.card_payload);
    if (!media) return { ok: false, reason: "not_found" };
    // The path's first segment is the tenant that owns the object; the row was
    // already tenant-scoped, so a mismatch means a hand-edited payload.
    if (!media.path.startsWith(`${guard.tenantId}/`)) return { ok: false, reason: "not_allowed" };

    // eslint-disable-next-line ratchet/no-untenanted-from -- storage BUCKET signed-URL; bucket calls have no tenant table
    const { data: signed, error: signError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(media.path, SIGNED_URL_TTL_SECONDS);
    if (signError || !signed?.signedUrl) {
      logServerError("channels.whatsapp.mediaSign", signError);
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, url: signed.signedUrl, mime: media.mime };
  } catch (err) {
    logServerError("channels.whatsapp.mediaUrl", err);
    return { ok: false, reason: "unavailable" };
  }
}
