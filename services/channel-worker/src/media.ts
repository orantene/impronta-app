import { createHash } from "node:crypto";

import { db } from "./db.js";

/**
 * Inbound WhatsApp media lands in the private `inquiry-files` bucket, the same
 * one inquiry attachments and voice notes use. Tenant id stays the first path
 * segment because that bucket's RLS reads it (`_inquiry_files_tenant_from_path`),
 * and the bucket sits outside MANAGED_BUCKETS so the media reaper can't take it.
 */
const BUCKET = "inquiry-files";

/** A photo from a phone camera is ~2-4 MB. Past this we keep the caption only. */
export const MEDIA_BYTE_CAP = 5 * 1024 * 1024;

export type StoredMedia = { url: string; mime: string };

export type DownloadedMedia = {
  mimetype?: string | null;
  data?: string | null;
  filename?: string | null;
};

export function extensionForMime(mime: string): string {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  const known: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "video/mp4": "mp4",
  };
  if (known[base]) return known[base];
  const tail = base.split("/")[1] ?? "";
  const cleaned = tail.replace(/[^a-z0-9]/g, "").slice(0, 8);
  return cleaned || "bin";
}

/** Byte length of base64 without allocating the buffer. */
export function decodedByteLength(base64: string): number {
  const len = base64.length;
  if (len === 0) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

/**
 * Deterministic object name keyed by the provider ref, so re-running a
 * backfill overwrites its own object instead of littering the bucket.
 */
export function mediaObjectPath(tenantId: string, providerRef: string, mime: string): string {
  const hash = createHash("sha256").update(providerRef).digest("hex").slice(0, 32);
  return `${tenantId}/whatsapp/${hash}.${extensionForMime(mime)}`;
}

export async function storeMedia(
  tenantId: string,
  providerRef: string,
  media: DownloadedMedia | null,
): Promise<StoredMedia | null> {
  const data = media?.data ?? "";
  if (!data) return null;
  if (decodedByteLength(data) > MEDIA_BYTE_CAP) return null;
  const mime = (media?.mimetype ?? "").trim() || "application/octet-stream";
  const path = mediaObjectPath(tenantId, providerRef, mime);
  try {
    const { error } = await db()
      .storage.from(BUCKET)
      .upload(path, Buffer.from(data, "base64"), { contentType: mime, upsert: true });
    if (error) {
      console.warn("[channel-worker] media upload failed", providerRef, error.message);
      return null;
    }
    return { url: path, mime };
  } catch (err) {
    console.warn("[channel-worker] media upload threw", providerRef, err);
    return null;
  }
}
