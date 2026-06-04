"use server";

/**
 * Voice-note server actions (Deep-plan W11).
 *
 * A sender (client, talent, coordinator or staff) records audio in the
 * composer; it uploads to the private `inquiry-files` bucket, an
 * `inquiry_attachments` row is written (visibility='shared' so everyone on
 * the thread can fetch it), and an `inquiry_messages` row is inserted with
 * `message_kind='voice'` and `metadata.voice = VoiceNoteMeta`. The same
 * MESSAGE_SENT engine event the normal text send emits is fired so timelines,
 * notifications and read-state behave identically.
 *
 * Authorization mirrors the text send path: `validateActorPermission(...,
 * "send_message")` is the single security gate that already understands all
 * roles (staff, coordinator, client, talent). The storage write + row inserts
 * then self-elevate to the service-role client exactly like
 * `uploadInquiryAttachmentAsClient` and `sendMessage` do — RLS on the bucket
 * is staff-only and RLS on `inquiry_messages` filters pure clients, so we
 * validate server-side and elevate only the mechanical writes.
 *
 * Playback needs a signed URL because `inquiry-files` is private; that URL is
 * generated server-side in getVoicePlaybackUrl after re-authorizing the
 * caller can see the inquiry. The service-role key is never exposed to the
 * client.
 *
 * NOTE: a "use server" module may export ONLY async functions. The shared
 * VoiceNoteMeta type lives in src/lib/messages/voice-types.ts.
 */

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { validateActorPermission } from "@/lib/inquiry/inquiry-permissions";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import {
  ENGINE_EVENT_TYPES,
  emitStandardEngineEvent,
} from "@/lib/inquiry/inquiry-events";
import type { VoiceNoteMeta } from "@/lib/messages/voice-types";

const MAX_BYTES = 100 * 1024 * 1024; // matches inquiry-files bucket cap
const MAX_DURATION_MS = 10 * 60 * 1000; // 10 min sanity ceiling
const SIGNED_URL_TTL_SECONDS = 60 * 5; // short-lived playback URL

function parseThreadType(raw: string): "private" | "group" | null {
  return raw === "private" || raw === "group" ? raw : null;
}

/**
 * Upload one recorded audio blob to an inquiry and send it as a voice message.
 * Works for client, talent, coordinator and staff senders.
 */
export async function uploadAndSendVoiceNote(
  formData: FormData,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  try {
    const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
    const threadType = parseThreadType(
      String(formData.get("thread_type") ?? "").trim(),
    );
    const durationRaw = Number(formData.get("duration_ms"));
    const durationMs =
      Number.isFinite(durationRaw) && durationRaw > 0
        ? Math.min(Math.round(durationRaw), MAX_DURATION_MS)
        : 0;
    const file = formData.get("file");

    if (!inquiryId) return { ok: false, error: "Missing inquiry_id." };
    if (!threadType) return { ok: false, error: "Invalid thread_type." };
    if (!(file instanceof File)) return { ok: false, error: "No audio uploaded." };
    if (file.size === 0) return { ok: false, error: "Recording is empty." };
    if (file.size > MAX_BYTES) {
      return { ok: false, error: "Recording exceeds 100 MB cap." };
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable." };

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    // Resolve the inquiry's tenant (also confirms it exists).
    const { data: inq } = await supabase
      .from("inquiries")
      .select("id, tenant_id")
      .eq("id", inquiryId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found." };
    const tenantId = inq.tenant_id as string;

    // Single security gate — understands staff / coordinator / client /
    // talent. Identical to the text send path.
    const perm = await validateActorPermission(
      supabase,
      inquiryId,
      user.id,
      "send_message",
    );
    if (!perm.ok) return { ok: false, error: "Not authorized for this inquiry." };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Storage unavailable." };

    // Storage path matches the staff RLS path convention so the Files tab
    // and existing download flows keep working.
    const mimeType = file.type || "audio/webm";
    const safeName = (file.name || "voice-note.webm")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 80);
    const objectId =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storagePath = `${tenantId}/${inquiryId}/${objectId}-${safeName}`;

    const { error: uploadErr } = await admin.storage
      .from("inquiry-files")
      .upload(storagePath, file, { contentType: mimeType, upsert: false });
    if (uploadErr) {
      logServerError("voice-notes.uploadAndSendVoiceNote/storage", uploadErr);
      return { ok: false, error: `Upload failed: ${uploadErr.message}` };
    }

    // Attachment metadata row — visibility='shared' so all thread parties can
    // resolve a signed URL. Service-role insert (mirrors the engine write
    // path; RLS on inquiry_attachments filters pure clients/talents).
    const { data: attachRow, error: attachErr } = await tenantScopedQuery(
      admin,
      "inquiry_attachments",
      tenantId,
    )
      .insert({
        inquiry_id: inquiryId,
        uploaded_by: user.id,
        storage_path: storagePath,
        filename: safeName,
        mime_type: mimeType,
        byte_size: file.size,
        description: "Voice note",
        // attachment_kind is constrained to mood_board|contract|reference|other
        // (migration 20260514024722); 'voice' is NOT a valid value and would
        // fail the CHECK. The voice identity lives on the MESSAGE
        // (message_kind='voice' + metadata.voice), which is what the bubble
        // detects via readVoiceMetaFromMessageMetadata — so no migration is
        // needed. We tag the attachment 'other' to satisfy the constraint.
        attachment_kind: "other",
        visibility: "shared",
      })
      .select("id")
      .single();

    if (attachErr || !attachRow) {
      await admin.storage.from("inquiry-files").remove([storagePath]);
      logServerError("voice-notes.uploadAndSendVoiceNote/attachInsert", attachErr);
      return { ok: false, error: "Could not save voice attachment." };
    }

    const voiceMeta: VoiceNoteMeta = {
      attachmentId: attachRow.id as string,
      storagePath,
      durationMs,
      mimeType,
      byteSize: file.size,
    };

    // Message row — message_kind='voice', empty body, voice meta on metadata.
    // Service-role insert mirrors sendMessage's self-elevation after the
    // permission gate.
    const { data: msgRow, error: msgErr } = await tenantScopedQuery(
      admin,
      "inquiry_messages",
      tenantId,
    )
      .insert({
        inquiry_id: inquiryId,
        thread_type: threadType,
        sender_user_id: user.id,
        body: "",
        message_kind: "voice",
        metadata: { voice: voiceMeta },
      })
      .select("id")
      .single();

    if (msgErr || !msgRow) {
      // Compensating cleanup: soft-delete the attachment + remove the object
      // so we don't leave a dangling voice file with no message.
      await tenantScopedQuery(admin, "inquiry_attachments", tenantId)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", attachRow.id as string);
      await admin.storage.from("inquiry-files").remove([storagePath]);
      logServerError("voice-notes.uploadAndSendVoiceNote/msgInsert", msgErr);
      return { ok: false, error: "Could not send voice message." };
    }

    const messageId = msgRow.id as string;

    // Same engine event the normal text send emits (timelines / read-state).
    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.MESSAGE_SENT,
      inquiryId,
      actorUserId: user.id,
      data: { threadType, messageId, messageKind: "voice" },
    });

    revalidatePath("/", "layout");
    return { ok: true, messageId };
  } catch (err) {
    logServerError("voice-notes.uploadAndSendVoiceNote", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Return a short-lived signed URL for a voice attachment's audio object.
 * Authorizes the caller can see the inquiry before signing.
 */
export async function getVoicePlaybackUrl(
  attachmentId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const id = String(attachmentId ?? "").trim();
    if (!id) return { ok: false, error: "Missing attachmentId." };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable." };

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Storage unavailable." };

    // Read the attachment (service-role so the row is visible regardless of
    // which role is asking) — then authorize against the inquiry below.
    const { data: attach } = await admin
      .from("inquiry_attachments")
      .select("id, inquiry_id, storage_path, visibility, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (!attach || attach.deleted_at) {
      return { ok: false, error: "Voice note not found." };
    }

    // Authorize: anyone allowed to send a message on this inquiry (i.e. a
    // participant or staff) is allowed to listen to a shared voice note.
    const perm = await validateActorPermission(
      supabase,
      attach.inquiry_id as string,
      user.id,
      "send_message",
    );
    if (!perm.ok) return { ok: false, error: "Not authorized." };

    const { data: signed, error: signErr } = await admin.storage
      .from("inquiry-files")
      .createSignedUrl(attach.storage_path as string, SIGNED_URL_TTL_SECONDS);

    if (signErr || !signed?.signedUrl) {
      logServerError("voice-notes.getVoicePlaybackUrl/sign", signErr);
      return { ok: false, error: "Could not prepare playback." };
    }

    return { ok: true, url: signed.signedUrl };
  } catch (err) {
    logServerError("voice-notes.getVoicePlaybackUrl", err);
    return { ok: false, error: "Unexpected error." };
  }
}
