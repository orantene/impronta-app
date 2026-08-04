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

type VoiceRowsInput = {
  tenantId: string;
  inquiryId: string;
  threadType: "private" | "group";
  userId: string;
  storagePath: string;
  safeName: string;
  mimeType: string;
  byteSize: number;
  durationMs: number;
};

/**
 * Shared tail of both voice upload paths (legacy FormData + signed PUT):
 * attachment row → message row (message_kind='voice') → MESSAGE_SENT
 * engine event. Storage object must already exist at `storagePath`;
 * on failure the object is removed / the attachment soft-deleted so no
 * dangling halves remain. Not exported ("use server" modules may only
 * export async functions — this stays private machinery).
 */
async function insertVoiceRows(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  input: VoiceRowsInput,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const { tenantId, inquiryId, threadType, userId, storagePath } = input;

  const { data: attachRow, error: attachErr } = await tenantScopedQuery(
    admin,
    "inquiry_attachments",
    tenantId,
  )
    .insert({
      inquiry_id: inquiryId,
      uploaded_by: userId,
      storage_path: storagePath,
      filename: input.safeName,
      mime_type: input.mimeType,
      byte_size: input.byteSize,
      description: "Voice note",
      // attachment_kind CHECK only allows mood_board|contract|reference|other;
      // the voice identity lives on the MESSAGE (message_kind='voice').
      attachment_kind: "other",
      visibility: "shared",
    })
    .select("id")
    .single();

  if (attachErr || !attachRow) {
    // eslint-disable-next-line ratchet/no-untenanted-from -- storage BUCKET call — no tenant_id column exists on a bucket; the object path embeds tenantId
    await admin.storage.from("inquiry-files").remove([storagePath]);
    logServerError("voice-notes.insertVoiceRows/attachInsert", attachErr);
    return { ok: false, error: "Could not save voice attachment." };
  }

  const voiceMeta: VoiceNoteMeta = {
    attachmentId: attachRow.id as string,
    storagePath,
    durationMs: input.durationMs,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
  };

  const { data: msgRow, error: msgErr } = await tenantScopedQuery(
    admin,
    "inquiry_messages",
    tenantId,
  )
    .insert({
      inquiry_id: inquiryId,
      thread_type: threadType,
      sender_user_id: userId,
      body: "",
      message_kind: "voice",
      metadata: { voice: voiceMeta },
    })
    .select("id")
    .single();

  if (msgErr || !msgRow) {
    await tenantScopedQuery(admin, "inquiry_attachments", tenantId)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", attachRow.id as string);
    // eslint-disable-next-line ratchet/no-untenanted-from -- storage BUCKET call — no tenant_id column exists on a bucket; the object path embeds tenantId
    await admin.storage.from("inquiry-files").remove([storagePath]);
    logServerError("voice-notes.insertVoiceRows/msgInsert", msgErr);
    return { ok: false, error: "Could not send voice message." };
  }

  const messageId = msgRow.id as string;

  await emitStandardEngineEvent(supabase, {
    type: ENGINE_EVENT_TYPES.MESSAGE_SENT,
    inquiryId,
    actorUserId: userId,
    data: { threadType, messageId, messageKind: "voice" },
  });

  revalidatePath("/", "layout");
  return { ok: true, messageId };
}

const VOICE_EXTS = new Set(["webm", "ogg", "m4a"]);

/**
 * Signed-upload half 1: validate the sender (same validateActorPermission
 * gate as the text send) and mint a one-shot signed URL into the private
 * inquiry-files bucket. The legacy FormData path rejects recordings over
 * the 4 MB Server Action body cap — long recordings ride this instead.
 */
export async function createVoiceNoteUploadUrl(
  inquiryId: string,
  ext: string,
): Promise<
  | { ok: true; data: { uploadUrl: string; storagePath: string } }
  | { ok: false; error: string }
> {
  try {
    const cleanId = String(inquiryId ?? "").trim();
    if (!cleanId) return { ok: false, error: "Missing inquiry_id." };
    const safeExt = VOICE_EXTS.has(ext) ? ext : "webm";

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable." };
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    // eslint-disable-next-line ratchet/no-untenanted-from -- tenant DISCOVERY lookup (RLS-bound); the permission gate below is the guard
    const { data: inq } = await supabase
      .from("inquiries")
      .select("id, tenant_id")
      .eq("id", cleanId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found." };
    const tenantId = inq.tenant_id as string;

    const perm = await validateActorPermission(supabase, cleanId, user.id, "send_message");
    if (!perm.ok) return { ok: false, error: "Not authorized for this inquiry." };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Storage unavailable." };

    const objectId =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storagePath = `${tenantId}/${cleanId}/${objectId}-voice-note.${safeExt}`;

    // eslint-disable-next-line ratchet/no-untenanted-from -- storage BUCKET signed-URL mint — bucket calls have no tenant table; path embeds tenantId
    const { data, error } = await admin.storage
      .from("inquiry-files")
      .createSignedUploadUrl(storagePath);
    if (error || !data) {
      logServerError("voice-notes.createVoiceNoteUploadUrl", error);
      return { ok: false, error: "Could not start upload. Try again." };
    }
    return {
      ok: true,
      data: { uploadUrl: data.signedUrl, storagePath: data.path ?? storagePath },
    };
  } catch (err) {
    logServerError("voice-notes.createVoiceNoteUploadUrl", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Signed-upload half 2: after the browser PUT, re-validate the sender,
 * stat the stored object (server-verified byte size), and write the same
 * attachment + voice-message rows the legacy path writes.
 */
export async function finalizeVoiceNote(input: {
  inquiryId: string;
  threadType: string;
  durationMs: number;
  storagePath: string;
  mimeType?: string | null;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  try {
    const inquiryId = String(input.inquiryId ?? "").trim();
    const threadType = parseThreadType(String(input.threadType ?? "").trim());
    if (!inquiryId) return { ok: false, error: "Missing inquiry_id." };
    if (!threadType) return { ok: false, error: "Invalid thread_type." };
    const durationMs =
      Number.isFinite(input.durationMs) && input.durationMs > 0
        ? Math.min(Math.round(input.durationMs), MAX_DURATION_MS)
        : 0;

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable." };
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    // eslint-disable-next-line ratchet/no-untenanted-from -- tenant DISCOVERY lookup (RLS-bound); the permission gate below is the guard
    const { data: inq } = await supabase
      .from("inquiries")
      .select("id, tenant_id")
      .eq("id", inquiryId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found." };
    const tenantId = inq.tenant_id as string;

    if (!input.storagePath.startsWith(`${tenantId}/${inquiryId}/`)) {
      return { ok: false, error: "Upload path doesn't match this inquiry." };
    }

    const perm = await validateActorPermission(supabase, inquiryId, user.id, "send_message");
    if (!perm.ok) return { ok: false, error: "Not authorized for this inquiry." };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Storage unavailable." };

    const slash = input.storagePath.lastIndexOf("/");
    // eslint-disable-next-line ratchet/no-untenanted-from -- storage BUCKET stat via list — bucket calls have no tenant table; path prefix was guarded above
    const { data: listed, error: listErr } = await admin.storage
      .from("inquiry-files")
      .list(input.storagePath.slice(0, slash), {
        limit: 1,
        search: input.storagePath.slice(slash + 1),
      });
    const meta = (listed?.[0] as { metadata?: { size?: number; mimetype?: string } } | undefined)
      ?.metadata;
    if (listErr || !meta || typeof meta.size !== "number" || meta.size === 0) {
      logServerError("voice-notes.finalizeVoiceNote/stat", listErr);
      return { ok: false, error: "Could not verify upload. Try again." };
    }
    if (meta.size > MAX_BYTES) {
      // eslint-disable-next-line ratchet/no-untenanted-from -- storage BUCKET remove — bucket calls have no tenant table
      await admin.storage.from("inquiry-files").remove([input.storagePath]);
      return { ok: false, error: "Recording exceeds 100 MB cap." };
    }

    const safeName = input.storagePath.slice(slash + 1);
    return await insertVoiceRows(admin, supabase, {
      tenantId,
      inquiryId,
      threadType,
      userId: user.id,
      storagePath: input.storagePath,
      safeName,
      mimeType: input.mimeType || meta.mimetype || "audio/webm",
      byteSize: meta.size,
      durationMs,
    });
  } catch (err) {
    logServerError("voice-notes.finalizeVoiceNote", err);
    return { ok: false, error: "Unexpected error." };
  }
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
    // eslint-disable-next-line ratchet/no-untenanted-from -- tenant DISCOVERY lookup (RLS-bound); the validateActorPermission gate below is the guard
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

    // eslint-disable-next-line ratchet/no-untenanted-from -- storage BUCKET upload — bucket calls have no tenant table; path embeds tenantId
    const { error: uploadErr } = await admin.storage
      .from("inquiry-files")
      .upload(storagePath, file, { contentType: mimeType, upsert: false });
    if (uploadErr) {
      logServerError("voice-notes.uploadAndSendVoiceNote/storage", uploadErr);
      return { ok: false, error: `Upload failed: ${uploadErr.message}` };
    }

    // Attachment row → voice message row → engine event, shared with the
    // signed-upload path (insertVoiceRows) so the two transports can't
    // drift apart.
    return await insertVoiceRows(admin, supabase, {
      tenantId,
      inquiryId,
      threadType,
      userId: user.id,
      storagePath,
      safeName,
      mimeType,
      byteSize: file.size,
      durationMs,
    });
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
    // eslint-disable-next-line ratchet/no-untenanted-from -- id-keyed attachment lookup; the caller is then authorized against the inquiry via validateActorPermission below
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

    // eslint-disable-next-line ratchet/no-untenanted-from -- storage BUCKET signed-URL — bucket calls have no tenant table
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
