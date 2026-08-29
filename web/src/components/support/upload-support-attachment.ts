"use client";

import {
  finalizeSupportAttachmentMessageAction,
  mintSupportAttachmentUploadAction,
} from "@/lib/support/attachment-actions";

export async function uploadSupportAttachment(ticketId: string, file: File): Promise<boolean> {
  const mint = await mintSupportAttachmentUploadAction({
    ticketId,
    fileName: file.name,
    contentType: file.type,
    byteSize: file.size,
  });
  if (!mint.ok) return false;
  try {
    const put = await fetch(mint.signedUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!put.ok) return false;
  } catch {
    return false;
  }
  const done = await finalizeSupportAttachmentMessageAction({
    ticketId,
    attachmentId: mint.attachmentId,
    caption: file.name,
  });
  return done.ok;
}
