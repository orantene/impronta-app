"use server";

import { z } from "zod";

import { requireSession } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { assertTicketAccess } from "./support-access";
import { supportEngine } from "./support-engine";
import { supportFrom } from "./support-from";

const BUCKET = "support-attachments";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const uuid = z.string().uuid();

type Fail = { ok: false; error: string };

export async function mintSupportAttachmentUploadAction(raw: {
  ticketId: string;
  fileName: string;
  contentType: string;
  byteSize: number;
}): Promise<{ ok: true; attachmentId: string; signedUrl: string; path: string } | Fail> {
  const parsed = z
    .object({
      ticketId: uuid,
      fileName: z.string().trim().min(1).max(200),
      contentType: z.string().trim().min(1).max(80),
      byteSize: z.number().int().positive().max(MAX_BYTES),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await requireSession();
  if (!session.ok) return session;
  const access = await assertTicketAccess(parsed.data.ticketId, session.user.id);
  if (!access.ok) return access;

  const ext = ALLOWED[parsed.data.contentType];
  if (!ext) return { ok: false, error: "That image type is not allowed." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };

  const path = `${parsed.data.ticketId}/${crypto.randomUUID()}.${ext}`;
  const signed = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (signed.error || !signed.data) {
    logServerError("support.attachment.sign", signed.error);
    return { ok: false, error: "Attachment storage is not ready." };
  }

  const { data: inserted, error } = await supportFrom(admin, "support_attachments")
    .insert({
      ticket_id: parsed.data.ticketId,
      tenant_id: access.ticket.tenantId,
      storage_path: path,
      content_type: parsed.data.contentType,
      byte_size: parsed.data.byteSize,
      created_by: session.user.id,
    })
    .select("id")
    .single();
  if (error || !inserted?.id) {
    logServerError("support.attachment.insert", error);
    return { ok: false, error: "Could not start upload." };
  }

  return {
    ok: true,
    attachmentId: String(inserted.id),
    signedUrl: signed.data.signedUrl,
    path,
  };
}

export async function finalizeSupportAttachmentMessageAction(raw: {
  ticketId: string;
  attachmentId: string;
  caption?: string;
}): Promise<{ ok: true } | Fail> {
  const parsed = z
    .object({
      ticketId: uuid,
      attachmentId: uuid,
      caption: z.string().trim().max(200).optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await requireSession();
  if (!session.ok) return session;
  const access = await assertTicketAccess(parsed.data.ticketId, session.user.id);
  if (!access.ok) return access;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const { data: row } = await supportFrom(admin, "support_attachments")
    .select("id, ticket_id")
    .eq("id", parsed.data.attachmentId)
    .eq("ticket_id", parsed.data.ticketId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Attachment not found." };

  const name = parsed.data.caption?.trim() || "Image";
  const appended = await supportEngine.appendMessage({
    ticketId: parsed.data.ticketId,
    authorKind: access.ticket.requesterUserId === session.user.id ? "requester" : "agent",
    authorUserId: session.user.id,
    messageKind: "card",
    skipNotify: false,
    body: name,
    cardPayload: { kind: "attachment", attachmentId: parsed.data.attachmentId, name },
  });
  if (!appended.ok) return appended;

  const { error } = await supportFrom(admin, "support_attachments")
    .update({ message_id: appended.data.message.id })
    .eq("id", parsed.data.attachmentId);
  if (error) {
    logServerError("support.attachment.link", error);
    return { ok: false, error: "Could not link the image." };
  }
  return { ok: true };
}

export async function getSupportAttachmentUrlAction(raw: {
  attachmentId: string;
}): Promise<{ ok: true; url: string; name: string } | Fail> {
  const parsed = z.object({ attachmentId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await requireSession();
  if (!session.ok) return session;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const { data: row } = await supportFrom(admin, "support_attachments")
    .select("id, ticket_id, storage_path")
    .eq("id", parsed.data.attachmentId)
    .maybeSingle();
  if (!row?.ticket_id || !row.storage_path) return { ok: false, error: "Attachment not found." };

  const access = await assertTicketAccess(String(row.ticket_id), session.user.id);
  if (!access.ok) return access;

  const signed = await admin.storage.from(BUCKET).createSignedUrl(String(row.storage_path), 60 * 10);
  if (signed.error || !signed.data?.signedUrl) {
    logServerError("support.attachment.read", signed.error);
    return { ok: false, error: "Attachment unavailable." };
  }
  const name = String(row.storage_path).split("/").pop() ?? "Image";
  return { ok: true, url: signed.data.signedUrl, name };
}
