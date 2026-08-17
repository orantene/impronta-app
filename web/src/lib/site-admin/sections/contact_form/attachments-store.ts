/**
 * FORMS-3 — the I/O half of contact-form attachments.
 *
 * `attachments.ts` next door is the PURE policy (caps, allow-list, magic-byte
 * sniffing) and is safe to import from the renderer. This module does the
 * Supabase work and the HTTP shaping, so it stays server-only and out of the
 * public section bundle.
 *
 * Split out of `app/api/cms/forms/submit/route.ts` because that route is at
 * the 800-line eslint `max-lines` cap: the attachment lane is a coherent unit
 * with its own failure semantics, so it moves whole rather than the route
 * being granted an exemption.
 *
 * SECURITY RECAP (the full argument lives in `attachments.ts`): every write
 * here happens with the SERVICE ROLE, inside the same request that already
 * passed honeypot + rate-limit + captcha. No signed upload URL is ever handed
 * to an unauthenticated caller.
 */
import "server-only";

import { NextResponse } from "next/server";

import { logServerError } from "@/lib/server/safe-error";
import type { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  CONTACT_ATTACHMENT_BUCKET,
  CONTACT_ATTACHMENT_SNIFF_BYTES,
  contactAttachmentStorageKey,
  effectiveAttachmentMaxBytes,
  validateContactAttachments,
  type ContactAttachmentAccepted,
  type ContactAttachmentCandidate,
  type ContactAttachmentErrorCode,
} from "./attachments";
import type { ContactFormField } from "./schema";

type ServiceClient = NonNullable<ReturnType<typeof createServiceRoleClient>>;

/**
 * Read enough of each file to sniff it, pair it with its field's effective
 * cap, and run the pure gate.
 *
 * Also refuses two things the pure validator cannot see:
 *   - a file part naming a field the SECTION does not declare as `type:
 *     "file"` (a crafted multipart body can name any part it likes), and
 *   - any file at all on an inquiry-routing form, which produces no submission
 *     row for an attachment to belong to. The renderer doesn't draw the
 *     control there; a POST that carries one anyway is told so rather than
 *     having its file silently dropped.
 */
export async function screenContactAttachments(input: {
  files: ReadonlyMap<string, File>;
  fields: readonly ContactFormField[];
  routingMode: "internal" | "inquiry" | undefined;
}): Promise<
  | { ok: true; accepted: readonly ContactAttachmentAccepted[] }
  | { ok: false; code: ContactAttachmentErrorCode }
> {
  const { files, fields, routingMode } = input;
  if (files.size === 0) return { ok: true, accepted: [] };

  if (routingMode === "inquiry") return { ok: false, code: "not_accepted" };

  const fileFields = new Map(
    fields.filter((f) => f.type === "file").map((f) => [f.name, f]),
  );
  for (const fieldName of files.keys()) {
    if (!fileFields.has(fieldName)) return { ok: false, code: "not_accepted" };
  }

  const candidates: ContactAttachmentCandidate[] = [];
  for (const [fieldName, file] of files) {
    const head = new Uint8Array(
      await file.slice(0, CONTACT_ATTACHMENT_SNIFF_BYTES).arrayBuffer(),
    );
    candidates.push({
      fieldName,
      filename: file.name,
      byteSize: file.size,
      declaredMime: file.type,
      head,
      maxBytes: effectiveAttachmentMaxBytes(
        fileFields.get(fieldName)?.fileMaxSizeMb,
      ),
    });
  }

  const verdict = validateContactAttachments(candidates);
  if (!verdict.ok) return { ok: false, code: verdict.code };
  return { ok: true, accepted: verdict.accepted };
}

/**
 * Service-role write of the validated files, then their rows.
 *
 * DELETE-ON-FAILURE, mirroring the register path PR #1165 added to the guest
 * inquiry lane: if a row cannot be written, the objects are removed. An object
 * with no row is invisible to every UI — and in THIS bucket invisible to the
 * reaper too, since it only manages media-public/media-originals — so it would
 * leak forever.
 *
 * Returns false on ANY failure; the caller turns that into an honest
 * "we saved your message but not your file" response rather than a bare
 * success.
 */
export async function storeContactAttachments(args: {
  admin: ServiceClient;
  tenantId: string;
  submissionId: string;
  accepted: readonly ContactAttachmentAccepted[];
  files: ReadonlyMap<string, File>;
}): Promise<boolean> {
  const { admin, tenantId, submissionId, accepted, files } = args;
  const writtenPaths: string[] = [];

  const rollback = async () => {
    if (writtenPaths.length === 0) return;
    const { error } = await admin.storage
      .from(CONTACT_ATTACHMENT_BUCKET)
      .remove(writtenPaths);
    if (error) logServerError("cms-forms/attachments/rollback", error);
  };

  try {
    const rows: Array<Record<string, unknown>> = [];
    for (const item of accepted) {
      const file = files.get(item.fieldName);
      if (!file) {
        await rollback();
        return false;
      }
      const attachmentId = crypto.randomUUID();
      const storagePath = contactAttachmentStorageKey({
        tenantId,
        submissionId,
        attachmentId,
        ext: item.ext,
      });
      const { error: uploadError } = await admin.storage
        .from(CONTACT_ATTACHMENT_BUCKET)
        .upload(storagePath, file, {
          // The SNIFFED type, never `file.type`. The browser-declared value is
          // attacker-controlled, and it is what a later signed download would
          // be served with.
          contentType: item.mime,
          upsert: false,
        });
      if (uploadError) {
        logServerError("cms-forms/attachments/upload", uploadError);
        await rollback();
        return false;
      }
      writtenPaths.push(storagePath);
      rows.push({
        id: attachmentId,
        submission_id: submissionId,
        tenant_id: tenantId,
        field_name: item.fieldName,
        original_filename: item.filename,
        mime_type: item.mime,
        byte_size: item.byteSize,
        bucket_id: CONTACT_ATTACHMENT_BUCKET,
        storage_path: storagePath,
      });
    }

    const { error: insertError } = await admin
      .from("cms_form_submission_attachments")
      .insert(rows);
    if (insertError) {
      logServerError("cms-forms/attachments/insert", insertError);
      await rollback();
      return false;
    }
    return true;
  } catch (err) {
    logServerError("cms-forms/attachments", err);
    await rollback();
    return false;
  }
}

/**
 * Honest attachment failure.
 *
 * A native HTML form POST renders whatever the endpoint returns, so the
 * route's existing `NextResponse.json({ ok:false })` paths show the visitor a
 * raw JSON blob. Attachment failures instead redirect back to the page the
 * form lives on carrying a stable code, which `contact_form/Component.tsx`
 * turns into a localized sentence — the same mechanism as the existing
 * `?__tulala_form=ok` success banner. Programmatic callers still get JSON.
 */
export function respondAttachmentError(
  req: Request,
  code: ContactAttachmentErrorCode,
  status: number,
): NextResponse {
  const accept = req.headers.get("accept") ?? "";
  const referer = req.headers.get("referer");
  if (!accept.includes("application/json") && referer) {
    try {
      const url = new URL(referer);
      url.searchParams.delete("__tulala_form");
      url.searchParams.set("__tulala_form_err", code);
      return NextResponse.redirect(url.toString(), 303);
    } catch {
      // Unparseable referer — fall through to JSON.
    }
  }
  return NextResponse.json({ ok: false, error: code }, { status });
}
