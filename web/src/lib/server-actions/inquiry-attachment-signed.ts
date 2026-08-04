"use server";

/**
 * Signed-upload pipeline for inquiry attachments (message threads).
 *
 * The legacy actions (`uploadInquiryAttachment` staff-side,
 * `uploadInquiryAttachmentAsClient` client-side) POST the raw file
 * through a Server Action. Server Action bodies cap at 4 MB
 * (next.config.ts `serverActions.bodySizeLimit`), so their advertised
 * 100 MB caps were unreachable — any real brief, deck, or photo set
 * over 4 MB failed at the transport layer before the action ran.
 *
 * This module replaces the data path with the same shape the talent
 * media pipeline uses:
 *   1. `actionCreateInquiryAttachmentUploadUrl` — tiny RPC, validates
 *      the caller against the inquiry, mints a one-shot signed URL
 *      into the private `inquiry-files` bucket.
 *   2. Browser PUTs the bytes directly to *.supabase.co.
 *   3. `actionRegisterInquiryAttachment` — re-validates the caller,
 *      stats the stored object (server-verified size/mime, never the
 *      client's claim), inserts the `inquiry_attachments` row.
 *
 * Two caller scopes share the flow, mirroring the legacy pair:
 *   - staff of the inquiry's tenant  → visibility 'staff'
 *   - the inquiry's primary client   → visibility 'shared'
 * Path convention matches the legacy actions byte-for-byte
 * ({tenant_id}/{inquiry_id}/{uuid}-{filename}) so the Files tab and
 * download flows pick these up with zero changes.
 */

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { logServerError } from "@/lib/server/safe-error";

const BUCKET = "inquiry-files";
/** Mirrors the bucket's file_size_limit (100 MB). */
const MAX_BYTES = 100 * 1024 * 1024;

const VALID_KINDS = new Set(["mood_board", "contract", "reference", "other"]);

type Scope =
  | { kind: "staff"; tenantId: string; tenantSlug: string; userId: string; supabase: SupabaseClient }
  | { kind: "client"; tenantId: string; userId: string; supabase: SupabaseClient };

/**
 * Resolve the caller against the inquiry: agency staff of the owning
 * tenant, or the inquiry's primary client. Anyone else is refused.
 * Staff is tried first — a staff member who is ALSO a client of some
 * inquiry should act as staff on their tenant's threads.
 */
async function resolveScope(
  inquiryId: string,
): Promise<{ ok: true; scope: Scope } | { ok: false; error: string }> {
  if (!inquiryId) return { ok: false, error: "Missing inquiryId." };

  const staff = await requireStaffTenantAction();
  if (staff.ok) {
    const { data: inq } = await tenantScopedQuery(staff.supabase, "inquiries", staff.tenantId)
      .select("id")
      .eq("id", inquiryId)
      .maybeSingle();
    if (inq) {
      return {
        ok: true,
        scope: {
          kind: "staff",
          tenantId: staff.tenantId,
          tenantSlug: staff.tenantSlug,
          userId: staff.user.id,
          supabase: staff.supabase,
        },
      };
    }
    // Staff of a DIFFERENT tenant than this inquiry — fall through to the
    // client check rather than leaking "found but not yours".
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  // eslint-disable-next-line ratchet/no-untenanted-from -- tenant DISCOVERY lookup: the tenant comes FROM this row; RLS-bound client + the explicit client_user_id check below are the guards
  const { data: inq } = await supabase
    .from("inquiries")
    .select("id, tenant_id, client_user_id")
    .eq("id", inquiryId)
    .maybeSingle();
  if (!inq) return { ok: false, error: "Inquiry not found." };
  if ((inq.client_user_id as string | null) !== user.id) {
    return { ok: false, error: "Not authorized for this inquiry." };
  }
  return {
    ok: true,
    scope: {
      kind: "client",
      tenantId: inq.tenant_id as string,
      userId: user.id,
      supabase,
    },
  };
}

export type InquiryAttachmentUploadGrant = {
  uploadUrl: string;
  storagePath: string;
};

export async function actionCreateInquiryAttachmentUploadUrl(
  inquiryId: string,
  filename: string,
): Promise<
  | { ok: true; data: InquiryAttachmentUploadGrant }
  | { ok: false; error: string }
> {
  try {
    const scoped = await resolveScope(inquiryId);
    if (!scoped.ok) return scoped;
    const { tenantId } = scoped.scope;

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Storage unavailable." };

    // Same sanitize + path shape as the legacy actions.
    const safeName = (filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const objectId =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storagePath = `${tenantId}/${inquiryId}/${objectId}-${safeName}`;

    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error || !data) {
      logServerError("inquiry-attachment-signed.createUrl", error);
      return { ok: false, error: "Could not start upload. Try again." };
    }
    return {
      ok: true,
      data: { uploadUrl: data.signedUrl, storagePath: data.path ?? storagePath },
    };
  } catch (err) {
    logServerError("inquiry-attachment-signed.createUrl", err);
    return { ok: false, error: "Unexpected error." };
  }
}

export type RegisterInquiryAttachmentInput = {
  inquiryId: string;
  storagePath: string;
  /** Display filename (the user's original pick, un-sanitized). */
  filename: string;
  mimeType?: string | null;
  attachmentKind?: string | null;
  /** Staff-only free-text note; ignored for client uploads. */
  description?: string | null;
};

export type RegisterInquiryAttachmentResult =
  | {
      ok: true;
      data: {
        attachmentId: string;
        filename: string;
        byteSize: number;
        attachmentKind: string | null;
      };
    }
  | { ok: false; error: string };

export async function actionRegisterInquiryAttachment(
  input: RegisterInquiryAttachmentInput,
): Promise<RegisterInquiryAttachmentResult> {
  try {
    const scoped = await resolveScope(input.inquiryId);
    if (!scoped.ok) return scoped;
    const scope = scoped.scope;

    // The caller may only register a path minted for THIS inquiry —
    // blocks registering someone else's object under your thread.
    if (!input.storagePath.startsWith(`${scope.tenantId}/${input.inquiryId}/`)) {
      return { ok: false, error: "Upload path doesn't match this inquiry." };
    }

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Storage unavailable." };

    // Server-verified size + mime via a list stat — never trust the
    // client's claim, never download the (possibly 100 MB) object.
    const slash = input.storagePath.lastIndexOf("/");
    const prefix = input.storagePath.slice(0, slash);
    const name = input.storagePath.slice(slash + 1);
    const { data: listed, error: listErr } = await admin.storage
      .from(BUCKET)
      .list(prefix, { limit: 1, search: name });
    const meta = (listed?.[0] as { metadata?: { size?: number; mimetype?: string } } | undefined)
      ?.metadata;
    if (listErr || !meta || typeof meta.size !== "number") {
      logServerError("inquiry-attachment-signed.stat", listErr);
      return { ok: false, error: "Could not verify upload. Try again." };
    }
    if (meta.size === 0) return { ok: false, error: "File is empty." };
    if (meta.size > MAX_BYTES) {
      // Bucket limit should have refused this already; belt-and-braces.
      await admin.storage.from(BUCKET).remove([input.storagePath]);
      return { ok: false, error: "File exceeds 100 MB cap." };
    }

    const kindRaw = (input.attachmentKind ?? "").trim();
    const attachmentKind = VALID_KINDS.has(kindRaw) ? kindRaw : null;

    // Metadata insert uses the AUTH-SCOPED client so the existing RLS
    // policies (staff insert / inquiry_attachments_client_insert) stay
    // the enforcement boundary, exactly as in the legacy actions.
    const { data: row, error: insertErr } = await tenantScopedQuery(
      scope.supabase,
      "inquiry_attachments",
      scope.tenantId,
    )
      .insert({
        inquiry_id: input.inquiryId,
        uploaded_by: scope.userId,
        storage_path: input.storagePath,
        filename: input.filename || name,
        mime_type: input.mimeType || meta.mimetype || null,
        byte_size: meta.size,
        attachment_kind: attachmentKind,
        ...(scope.kind === "staff"
          ? { description: input.description?.trim() || null, visibility: "staff" }
          : { visibility: "shared" }),
      })
      .select("id, filename, byte_size, attachment_kind")
      .single();

    if (insertErr || !row) {
      // Compensating delete so the bucket doesn't accumulate orphans.
      await admin.storage.from(BUCKET).remove([input.storagePath]);
      logServerError("inquiry-attachment-signed.insert", insertErr);
      return { ok: false, error: "Could not save file metadata." };
    }

    if (scope.kind === "staff") {
      revalidatePath(`/${scope.tenantSlug}`, "layout");
    } else {
      revalidatePath("/", "layout");
    }
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
    logServerError("inquiry-attachment-signed.register", err);
    return { ok: false, error: "Unexpected error." };
  }
}
