/**
 * Inquiry attachment helpers (load / upload / soft-delete).
 *
 * Extracted from `_pipeline-actions.ts` so that god-file can pay back the
 * #2971 size-ratchet residue. No `"use server"` here — the parent module
 * exposes async wrappers so SWC server-actions codegen stays intact and
 * existing import paths stay byte-stable.
 */

import { revalidatePath } from "next/cache";
import { requireWorkspaceStaffAction, requireInquiryManagerAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";

import type {
  PipelineActionResult,
  InquiryAttachment,
} from "./_pipeline-types";

/**
 * Load (non-deleted) attachments for an inquiry. Tenant scope is enforced
 * by RLS + the `tenant_id` filter so the read can never cross tenants.
 */
export async function loadInquiryAttachments(
  _tenantSlug: string,
  inquiryId: string,
): Promise<PipelineActionResult<InquiryAttachment[]>> {
  try {
    const auth = await requireInquiryManagerAction(inquiryId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    const { data, error } = await supabase
      .from("inquiry_attachments")
      .select("id, filename, mime_type, byte_size, description, visibility, uploaded_by, created_at, attachment_kind")
      .eq("tenant_id", tenantId)
      .eq("inquiry_id", inquiryId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      logServerError("admin._pipeline-actions.loadInquiryAttachments", error);
      return { ok: false, error: "Could not load files." };
    }

    type Row = {
      id: string; filename: string; mime_type: string | null;
      byte_size: number | null; description: string | null;
      visibility: "staff" | "shared"; uploaded_by: string | null; created_at: string;
      attachment_kind: string | null;
    };
    const rows = (data ?? []) as Row[];
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        mimeType: r.mime_type,
        byteSize: r.byte_size,
        description: r.description,
        visibility: r.visibility,
        uploadedBy: r.uploaded_by,
        createdAt: r.created_at,
        attachmentKind: r.attachment_kind,
      })),
    };
  } catch (err) {
    logServerError("admin._pipeline-actions.loadInquiryAttachments", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Upload a file to the inquiry-files bucket and create the matching
 * `inquiry_attachments` row. Path convention follows the storage RLS:
 *   {tenant_id}/{inquiry_id}/{uuid}-{filename}
 *
 * Accepts a FormData with `file` (File) + `inquiryId` (string) +
 * optional `description` (string). Tenant ownership of the inquiry is
 * verified before the upload to avoid orphan storage objects.
 *
 * Returns the new attachment id on success.
 */
export async function uploadInquiryAttachment(
  formData: FormData,
): Promise<PipelineActionResult<{ attachmentId: string }>> {
  await requireNotImpersonating();
  try {
    const inquiryId = String(formData.get("inquiryId") ?? "");
    const description = String(formData.get("description") ?? "").trim() || null;
    // Step 14 — staff can also tag uploads with attachment_kind. Default
    // is NULL when the caller doesn't supply one so legacy uploads stay
    // untagged.
    const kindRaw = String(formData.get("attachmentKind") ?? "").trim();
    const attachmentKind =
      kindRaw === "mood_board" || kindRaw === "contract" ||
      kindRaw === "reference" || kindRaw === "other"
        ? kindRaw
        : null;
    const file = formData.get("file");
    if (!inquiryId) return { ok: false, error: "Missing inquiryId." };
    if (!(file instanceof File)) return { ok: false, error: "No file uploaded." };
    if (file.size === 0) return { ok: false, error: "File is empty." };
    if (file.size > 100 * 1024 * 1024) return { ok: false, error: "File exceeds 100 MB cap." };

    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user, tenantId } = auth;

    const { data: inq, error: inqErr } = await supabase
      .from("inquiries")
      .select("id")
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (inqErr) {
      logServerError("admin._pipeline-actions.uploadInquiryAttachment/inquiry", inqErr);
      return { ok: false, error: "Could not verify inquiry." };
    }
    if (!inq) return { ok: false, error: "Inquiry not found in this workspace." };

    // Build storage path — matches the bucket RLS pattern.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const objectId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const storagePath = `${tenantId}/${inquiryId}/${objectId}-${safeName}`;

    const { error: uploadErr } = await supabase
      .storage
      .from("inquiry-files")
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadErr) {
      logServerError("admin._pipeline-actions.uploadInquiryAttachment/storage", uploadErr);
      return { ok: false, error: `Upload failed: ${uploadErr.message}` };
    }

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
        description,
        visibility: "staff",
        attachment_kind: attachmentKind,
      })
      .select("id")
      .single();

    if (insertErr || !row) {
      // Compensating delete — pull the orphan storage object so the bucket
      // doesn't accumulate files with no metadata row.
      await supabase.storage.from("inquiry-files").remove([storagePath]);
      logServerError("admin._pipeline-actions.uploadInquiryAttachment/insert", insertErr);
      return { ok: false, error: "Could not save file metadata." };
    }

    revalidatePath(`/${auth.tenantSlug}`, "layout");
    return { ok: true, data: { attachmentId: row.id as string } };
  } catch (err) {
    logServerError("admin._pipeline-actions.uploadInquiryAttachment", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Soft-delete an attachment (sets deleted_at). The storage object stays
 * in the bucket — purging is a separate batch job.
 */
export async function deleteInquiryAttachment(
  _tenantSlug: string,
  attachmentId: string,
): Promise<PipelineActionResult> {
  await requireNotImpersonating();
  try {
    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    const { error } = await supabase
      .from("inquiry_attachments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", attachmentId)
      .eq("tenant_id", tenantId);

    if (error) {
      logServerError("admin._pipeline-actions.deleteInquiryAttachment", error);
      return { ok: false, error: "Could not delete file." };
    }

    revalidatePath(`/${auth.tenantSlug}`, "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.deleteInquiryAttachment", err);
    return { ok: false, error: "Unexpected error." };
  }
}
