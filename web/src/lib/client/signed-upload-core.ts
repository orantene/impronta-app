/**
 * signed-upload-core — shared vocabulary + transport primitives for the
 * client-side signed-upload lanes.
 *
 * Extracted from `signed-upload.ts` when that file crossed the 800-line
 * max-lines budget (it now hosts eight lanes). Nothing here changed
 * behaviour: these are the same types and helpers, moved so the lane
 * modules can share them without a cycle. `signed-upload.ts` re-exports
 * the public names, so every existing import keeps working.
 */

import type { CompressResult } from "@/lib/client/image-compress";

export type SignedUploadPhase = "compressing" | "uploading" | "registering";

export type SignedUploadProgress = {
  phase: SignedUploadPhase;
  /** Bytes already on the wire. Only populated for the "uploading"
   *  phase when the runtime exposes upload progress. */
  bytesSent?: number;
  /** Total bytes being uploaded (post-compression). */
  bytesTotal?: number;
  /** Compression info — set on every phase once compression has run. */
  compression?: CompressResult;
};

export type FailureResult = {
  ok: false;
  /** Caller may retry through the legacy server-upload path. */
  fallbackToLegacy: boolean;
  error: string;
};

export type CmsMediaItem = {
  id: string;
  variantKind: string;
  /** MEDIA-1 — image (default) | video | document. */
  assetKind?: "image" | "video" | "document" | null;
  storagePath: string;
  publicUrl: string;
  createdAt: string;
  width: number | null;
  height: number | null;
  alt?: string | null;
};

/** SVG is text and never rides a signed PUT — see uploadCmsSvg. */
export const SVG_MIME = "image/svg+xml";
/** Mirrors SVG_LIBRARY_MAX_BYTES / SVG_LOGO_MAX_CHARS on the server. */
export const SVG_LIBRARY_MAX_BYTES = 256 * 1024;

export async function putToSignedUrl(
  uploadUrl: string,
  blob: Blob,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": blob.type || "application/octet-stream" },
      body: blob,
    });
    if (!res.ok) {
      return { ok: false, error: `signed PUT failed: HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `signed PUT threw: ${stringifyError(e)}` };
  }
}

export function passthroughCompressed(file: File): CompressResult {
  const extFromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  const extFromMime = (file.type.split("/")[1] ?? "").replace(/^x-/, "");
  const ext = (extFromName || extFromMime || "bin").replace(/[^a-z0-9]/g, "");
  return {
    file,
    skipped: true,
    reason: "not_image",
    originalSize: file.size,
    compressedSize: file.size,
    compressionRatio: 1,
    mimeType: file.type || "application/octet-stream",
    ext: ext || "bin",
  };
}

export async function safeJson(
  res: Response,
): Promise<{ ok?: boolean; error?: string; item?: CmsMediaItem } | null> {
  try {
    return (await res.json()) as { ok?: boolean; error?: string; item?: CmsMediaItem };
  } catch {
    return null;
  }
}

export function stringifyError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
