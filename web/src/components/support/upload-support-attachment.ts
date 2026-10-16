"use client";

import {
  finalizeSupportAttachmentMessageAction,
  mintSupportAttachmentUploadAction,
} from "@/lib/support/attachment-actions";
import type { SupportSendFailure } from "./support-send-error";

export type SupportUploadResult = { ok: true } | ({ ok: false } & SupportSendFailure);

export async function uploadSupportAttachment(ticketId: string, file: File): Promise<SupportUploadResult> {
  const mint = await mintSupportAttachmentUploadAction({
    ticketId,
    fileName: file.name,
    contentType: file.type,
    byteSize: file.size,
  });
  if (!mint.ok) return { ok: false };
  try {
    const put = await fetch(mint.signedUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!put.ok) return { ok: false };
  } catch {
    return { ok: false };
  }
  const done = await finalizeSupportAttachmentMessageAction({
    ticketId,
    attachmentId: mint.attachmentId,
    caption: file.name,
  });
  if (done.ok) return { ok: true };
  const failure = done as { code?: string; retryAfterSec?: number };
  return { ok: false, code: failure.code, retryAfterSec: failure.retryAfterSec };
}
