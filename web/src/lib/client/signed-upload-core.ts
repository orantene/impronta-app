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

/**
 * Byte-level progress reporter for the PUT leg.
 *
 * `SignedUploadProgress.bytesSent` was declared here from day one and never
 * written by anybody: every lane called `putToSignedUrl`, which uses `fetch`,
 * and `fetch` exposes NO upload-progress event. Callers therefore had a
 * `bytesSent` field that was always `undefined` and rendered a spinner where
 * they had designed a progress bar.
 *
 * The only browser transport that reports request-body progress is
 * `XMLHttpRequest` (`xhr.upload.onprogress`). So `putToSignedUrl` now takes an
 * optional reporter and switches transport ONLY when one is supplied — a
 * caller that does not ask for progress keeps the exact `fetch` path it had,
 * byte for byte, so this cannot regress the lanes that never wanted it.
 */
export type PutProgressReporter = (bytesSent: number, bytesTotal: number) => void;

/**
 * Adapt an `onProgress` consumer into the PUT-leg reporter shape. Keeps the
 * `phase: "uploading"` + `compression` envelope identical to the manual
 * `onProgress?.({ phase: "uploading", … })` call every lane already makes, so
 * the only new information on the wire is `bytesSent`.
 */
export function uploadProgressReporter(
  onProgress: ((p: SignedUploadProgress) => void) | undefined,
  compression?: CompressResult,
): PutProgressReporter | undefined {
  if (!onProgress) return undefined;
  return (bytesSent, bytesTotal) =>
    onProgress({ phase: "uploading", bytesSent, bytesTotal, compression });
}

export async function putToSignedUrl(
  uploadUrl: string,
  blob: Blob,
  onBytes?: PutProgressReporter,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (onBytes && typeof XMLHttpRequest !== "undefined") {
    return putViaXhr(uploadUrl, blob, onBytes);
  }
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

/** Same PUT, same error strings — XHR only so upload progress is observable. */
function putViaXhr(
  uploadUrl: string,
  blob: Blob,
  onBytes: PutProgressReporter,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: { ok: true } | { ok: false; error: string }) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl, true);
      xhr.setRequestHeader("Content-Type", blob.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        // `lengthComputable` is false for a few exotic body types; reporting a
        // total of 0 would render a NaN-wide bar, so we simply say nothing.
        if (e.lengthComputable && e.total > 0) onBytes(e.loaded, e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Guarantee the bar reaches 100% even when the last progress event
          // lands short of total (Safari does this on small bodies).
          onBytes(blob.size, blob.size);
          done({ ok: true });
          return;
        }
        done({ ok: false, error: `signed PUT failed: HTTP ${xhr.status}` });
      };
      xhr.onerror = () => done({ ok: false, error: "signed PUT threw: network error" });
      xhr.onabort = () => done({ ok: false, error: "signed PUT threw: aborted" });
      xhr.ontimeout = () => done({ ok: false, error: "signed PUT threw: timeout" });
      xhr.send(blob);
    } catch (e) {
      done({ ok: false, error: `signed PUT threw: ${stringifyError(e)}` });
    }
  });
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
