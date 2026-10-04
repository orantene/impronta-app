"use client";

/**
 * Upload a stashed Nail Studio look PNG onto the guest's inquiry as a
 * moodboard attachment (same signed-upload path as the inquiry drawer).
 * Best-effort: text send must not fail if the image upload does.
 */

import { uploadInquirySubmitAttachments } from "@/lib/client/signed-upload";

import {
  lookImageDataUrlToFile,
  takePendingLookImage,
} from "./pending-look-image";

export async function attachPendingLookImage(input: {
  tenantSlug: string;
  inquiryId: string;
}): Promise<{ ok: boolean }> {
  const dataUrl = takePendingLookImage();
  if (!dataUrl) return { ok: true };
  const file = lookImageDataUrlToFile(dataUrl, "nail-studio-look.png");
  if (!file) return { ok: false };
  const results = await uploadInquirySubmitAttachments({
    tenantSlug: input.tenantSlug,
    inquiryId: input.inquiryId,
    files: [file],
  });
  return { ok: results[0]?.ok === true };
}
