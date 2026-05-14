"use server";

/**
 * Client-POV inquiry attachment server actions.
 *
 * Mirrors `uploadInquiryAttachment` (admin / staff path) and
 * `uploadInquiryAttachmentAsTalent` (talent path), but gates on
 * `inquiries.client_user_id = auth.uid()` — the primary client who
 * originated the inquiry. Files land in the same `inquiry-files` bucket
 * under the same path convention so the admin Files tab and existing
 * download flows pick them up automatically.
 *
 * Step 14 of the inquiry-funnel sprint (2026-05-14).
 *
 * Why service-role for storage:
 *   The `inquiry-files` bucket RLS only allows `is_staff_of_tenant`
 *   uploads. Extending storage RLS to clients would require encoding
 *   client-of-inquiry checks into the bucket policy (expensive +
 *   error-prone). Instead we validate the caller server-side and use
 *   the service-role client for the storage write only. The metadata
 *   row insert uses the regular auth-scoped client so the new
 *   `inquiry_attachments_client_insert` policy guards it.
 */

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

const VALID_KINDS = new Set([
  "mood_board",
  "contract",
  "reference",
  "other",
]);

export type ClientAttachmentActionResult =
  | { ok: true; data: { attachmentId: string; filename: string; byteSize: number; attachmentKind: string | null } }
  | { ok: false; error: string };

export type ClientAttachmentListResult =
  | {
      ok: true;
      data: Array<{
        id: string;
        filename: string;
        byteSize: number | null;
        mimeType: string | null;
        attachmentKind: string | null;
        uploadedBy: string | null;
        createdAt: string;
        isMine: boolean;
      }>;
    }
  | { ok: false; error: string };

export type ClientAttachmentRemoveResult =
  | { ok: true }
  | { ok: false; error: string };

/** Upload one file to an inquiry on behalf of the primary client. */
export async function uploadInquiryAttachmentAsClient(
  formData: FormData,
): Promise<ClientAttachmentActionResult> {
  try {
    const inquiryId = String(formData.get("inquiryId") ?? "").trim();
    const kindRaw = String(formData.get("attachmentKind") ?? "").trim();
    const attachmentKind = VALID_KINDS.has(kindRaw) ? kindRaw : null;
    const file = formData.get("file");

    if (!inquiryId) return { ok: false, error: "Missing inquiryId." };
    if (!(file instanceof File)) return { ok: false, error: "No file uploaded." };
    if (file.size === 0) return { ok: false, error: "File is empty." };
    if (file.size > 100 * 1024 * 1024) {
      return { ok: false, error: "File exceeds 100 MB cap." };
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable." };

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    // Verify this user is the inquiry's primary client. Without this
    // check anyone authenticated could upload to any inquiry id they
    // could guess.
    const { data: inq } = await supabase
      .from("inquiries")
      .select("id, tenant_id, client_user_id")
      .eq("id", inquiryId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found." };
    if ((inq.client_user_id as string | null) !== user.id) {
      return { ok: false, error: "Not authorized for this inquiry." };
    }
    const tenantId = inq.tenant_id as string;

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Storage unavailable." };

    // Build storage path — must match bucket's staff RLS path convention
    // so admin/staff reads keep working.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const objectId =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storagePath = `${tenantId}/${inquiryId}/${objectId}-${safeName}`;

    const { error: uploadErr } = await admin.storage
      .from("inquiry-files")
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadErr) {
      logServerError(
        "client-inquiry-attachments.uploadInquiryAttachmentAsClient/storage",
        uploadErr,
      );
      return { ok: false, error: `Upload failed: ${uploadErr.message}` };
    }

    // Metadata insert uses the auth-scoped client — RLS policy
    // `inquiry_attachments_client_insert` validates uploaded_by + client_user_id.
    const { data: row, error: insertErr } = await supabase
      .from("inquiry_attachments")
      .insert({
        tenant_id: tenantId,
        inquiry_id: inquiryId,
        uploaded_by: user.id,
        storage_path: storagePath,
        filename: file.name,
        mime_type: file.type || null,
        byte_size: file.size,
        attachment_kind: attachmentKind,
        // Client-uploaded files are visible across the thread (staff,
        // coordinator, talent all see briefs/mood boards). The talent
        // path defaults to 'participant' which doesn't exist in the
        // current visibility enum — using 'shared' is the legacy
        // hand-off-to-everyone tier.
        visibility: "shared",
      })
      .select("id, filename, byte_size, attachment_kind")
      .single();

    if (insertErr || !row) {
      // Compensating delete so we don't leave an orphan storage object.
      await admin.storage.from("inquiry-files").remove([storagePath]);
      logServerError(
        "client-inquiry-attachments.uploadInquiryAttachmentAsClient/insert",
        insertErr,
      );
      return { ok: false, error: "Could not save file metadata." };
    }

    revalidatePath("/", "layout");
    return {
      ok: true,
      data: {
        attachmentId: row.id as string,
        filename: row.filename as string,
        byteSize: Number(row.byte_size) || 0,
        attachmentKind: (row.attachment_kind as string | null) ?? null,
      },
    };
  } catch (err) {
    logServerError(
      "client-inquiry-attachments.uploadInquiryAttachmentAsClient",
      err,
    );
    return { ok: false, error: "Unexpected error." };
  }
}

/** List all (non-deleted) attachments visible to the calling client. */
export async function listInquiryAttachmentsAsClient(
  inquiryId: string,
): Promise<ClientAttachmentListResult> {
  try {
    if (!inquiryId) return { ok: false, error: "Missing inquiryId." };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable." };

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("inquiry_attachments")
      .select(
        "id, filename, mime_type, byte_size, attachment_kind, uploaded_by, created_at",
      )
      .eq("inquiry_id", inquiryId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      logServerError(
        "client-inquiry-attachments.listInquiryAttachmentsAsClient",
        error,
      );
      return { ok: false, error: "Could not load files." };
    }

    type Row = {
      id: string;
      filename: string;
      mime_type: string | null;
      byte_size: number | null;
      attachment_kind: string | null;
      uploaded_by: string | null;
      created_at: string;
    };
    const rows = (data ?? []) as Row[];
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        byteSize: r.byte_size,
        mimeType: r.mime_type,
        attachmentKind: r.attachment_kind,
        uploadedBy: r.uploaded_by,
        createdAt: r.created_at,
        isMine: r.uploaded_by === user.id,
      })),
    };
  } catch (err) {
    logServerError(
      "client-inquiry-attachments.listInquiryAttachmentsAsClient",
      err,
    );
    return { ok: false, error: "Unexpected error." };
  }
}

/** Soft-delete an attachment uploaded by the calling client. */
export async function removeInquiryAttachmentAsClient(
  attachmentId: string,
): Promise<ClientAttachmentRemoveResult> {
  try {
    if (!attachmentId) return { ok: false, error: "Missing attachmentId." };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable." };

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    // RLS `inquiry_attachments_uploader_softdel` will reject updates from
    // anyone other than the original uploader, but we also constrain by
    // uploaded_by here so the SQL surface is explicit + readable.
    const { error } = await supabase
      .from("inquiry_attachments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", attachmentId)
      .eq("uploaded_by", user.id);

    if (error) {
      logServerError(
        "client-inquiry-attachments.removeInquiryAttachmentAsClient",
        error,
      );
      return { ok: false, error: "Could not remove file." };
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError(
      "client-inquiry-attachments.removeInquiryAttachmentAsClient",
      err,
    );
    return { ok: false, error: "Unexpected error." };
  }
}
