/**
 * signed-upload — client-side orchestrator for the
 * compress → signed-PUT → register pipeline.
 *
 * Three target flavors share the same skeleton:
 *   - uploadTalentMedia: per-talent gallery / card / hero / etc.
 *   - uploadStagingMedia: tenant staging parking lot (admin bulk drop).
 *   - uploadCmsMedia: tenant CMS library (page-builder assets, docs, video).
 *
 * Each call:
 *   1. Compresses the File in-browser when possible.
 *   2. Requests a one-shot signed URL from the matching server endpoint.
 *   3. PUTs the bytes directly to *.supabase.co (no Function in the data path).
 *   4. Calls the matching register endpoint, which inserts the DB row and
 *      runs server-side sharp as defense-in-depth.
 *
 * Failure mode is "fall back to legacy". On any error the helper returns
 * `{ ok: false, fallbackToLegacy: true, error }` so the caller can retry
 * through the existing FormData-based action without losing the user's
 * file. The few "we genuinely couldn't" cases (auth failure, bad path)
 * set `fallbackToLegacy: false` so the caller surfaces the error instead.
 */

import type {
  UploadVariant,
  StagedMediaMeta,
} from "@/app/(workspace)/[tenantSlug]/admin/media/actions";
import { compressImage, type CompressResult } from "@/lib/client/image-compress";

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

type FailureResult = {
  ok: false;
  /** Caller may retry through the legacy server-upload path. */
  fallbackToLegacy: boolean;
  error: string;
};

// ── Talent uploads (per-talent gallery / card / hero / etc.) ────────────

export type TalentUploadOk = {
  ok: true;
  id: string;
  publicUrl: string;
  sourceMediaAssetId: string | null;
  sortOrder: number;
  compression: CompressResult;
};

export async function uploadTalentMedia(opts: {
  file: File;
  variantKind: UploadVariant;
  talentProfileId: string;
  metadata?: Record<string, unknown>;
  sourceMediaAssetId?: string | null;
  onProgress?: (p: SignedUploadProgress) => void;
}): Promise<TalentUploadOk | FailureResult> {
  const { file, variantKind, talentProfileId } = opts;

  opts.onProgress?.({ phase: "compressing" });
  const compressed = await compressImage(file);
  // Only the JPEG / PNG outputs are safe to drive through the signed
  // pipeline — `actionCreateSignedUploadUrl` only accepts those exts.
  // Anything else (SVG passthrough, animated GIF passthrough, etc.)
  // falls back to the legacy action so server-side validators run.
  if (compressed.skipped && compressed.ext !== "jpg" && compressed.ext !== "png") {
    return {
      ok: false,
      fallbackToLegacy: true,
      error: `compress skipped (${compressed.reason ?? "unknown"})`,
    };
  }
  const signExt = (compressed.ext === "png" ? "png" : "jpg") as "jpg" | "png";

  const { actionCreateSignedUploadUrl, actionRegisterUploadedAsset } =
    await import("@/app/(workspace)/[tenantSlug]/admin/media/actions");
  const signed = await actionCreateSignedUploadUrl(
    variantKind,
    talentProfileId,
    signExt,
  );
  if (!signed.ok) {
    // Auth + roster failures shouldn't silently fall back — the legacy
    // path would fail the same way and the user needs the real message.
    return { ok: false, fallbackToLegacy: false, error: signed.error };
  }

  opts.onProgress?.({
    phase: "uploading",
    bytesTotal: compressed.file.size,
    compression: compressed,
  });

  const putOk = await putToSignedUrl(signed.data.uploadUrl, compressed.file);
  if (!putOk.ok) {
    return { ok: false, fallbackToLegacy: true, error: putOk.error };
  }

  opts.onProgress?.({ phase: "registering", compression: compressed });

  const registered = await actionRegisterUploadedAsset({
    storagePath: signed.data.storagePath,
    variantKind,
    talentProfileId,
    metadata: opts.metadata,
    sourceMediaAssetId: opts.sourceMediaAssetId ?? null,
    originalFilename: file.name || null,
  });
  if (!registered.ok) {
    return { ok: false, fallbackToLegacy: true, error: registered.error };
  }

  return {
    ok: true,
    id: registered.data.id,
    publicUrl: registered.data.publicUrl,
    sourceMediaAssetId: registered.data.sourceMediaAssetId,
    sortOrder: registered.data.sortOrder,
    compression: compressed,
  };
}

// ── Staging uploads (tenant parking lot for bulk drop) ──────────────────

export type StagingUploadOk = {
  ok: true;
  storagePath: string;
  publicUrl: string;
  meta: StagedMediaMeta;
  compression: CompressResult;
};

export async function uploadStagingMedia(opts: {
  file: File;
  onProgress?: (p: SignedUploadProgress) => void;
}): Promise<StagingUploadOk | FailureResult> {
  const { file } = opts;

  opts.onProgress?.({ phase: "compressing" });
  const compressed = await compressImage(file);
  if (compressed.skipped && compressed.ext !== "jpg" && compressed.ext !== "png") {
    return {
      ok: false,
      fallbackToLegacy: true,
      error: `compress skipped (${compressed.reason ?? "unknown"})`,
    };
  }
  const signExt = (compressed.ext === "png" ? "png" : "jpg") as "jpg" | "png";

  const { actionCreateStagingSignedUploadUrl, actionRegisterStagedAsset } =
    await import("@/app/(workspace)/[tenantSlug]/admin/media/actions");
  const signed = await actionCreateStagingSignedUploadUrl(signExt);
  if (!signed.ok) {
    return { ok: false, fallbackToLegacy: false, error: signed.error };
  }

  opts.onProgress?.({
    phase: "uploading",
    bytesTotal: compressed.file.size,
    compression: compressed,
  });

  const putOk = await putToSignedUrl(signed.data.uploadUrl, compressed.file);
  if (!putOk.ok) {
    return { ok: false, fallbackToLegacy: true, error: putOk.error };
  }

  opts.onProgress?.({ phase: "registering", compression: compressed });
  const registered = await actionRegisterStagedAsset(
    signed.data.storagePath,
    file.name || null,
  );
  if (!registered.ok) {
    return { ok: false, fallbackToLegacy: true, error: registered.error };
  }

  return {
    ok: true,
    storagePath: registered.data.storagePath,
    publicUrl: registered.data.publicUrl,
    meta: registered.data.meta,
    compression: compressed,
  };
}

// ── CMS library uploads (page-builder assets) ───────────────────────────

export type CmsMediaItem = {
  id: string;
  variantKind: string;
  storagePath: string;
  publicUrl: string;
  createdAt: string;
  width: number | null;
  height: number | null;
};

export type CmsUploadOk = {
  ok: true;
  item: CmsMediaItem;
  compression: CompressResult;
};

export async function uploadCmsMedia(opts: {
  file: File;
  tenantId: string;
  kind?: "image" | "document" | "video";
  onProgress?: (p: SignedUploadProgress) => void;
}): Promise<CmsUploadOk | FailureResult> {
  const { file, tenantId } = opts;
  const kind = opts.kind ?? "image";

  // Only images get the compression pass; documents + videos PUT
  // their original bytes through the same signed-URL pipeline (no
  // resize on either side).
  let compressed: CompressResult;
  if (kind === "image") {
    opts.onProgress?.({ phase: "compressing" });
    compressed = await compressImage(file);
  } else {
    compressed = passthroughCompressed(file);
  }

  // Init endpoint accepts a whitelist of extensions per kind; clamp
  // to what we have.
  const ext = (compressed.ext || "bin").toLowerCase();

  let initRes: Response;
  try {
    initRes = await fetch("/api/admin/media/upload/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, kind, ext }),
    });
  } catch (e) {
    return {
      ok: false,
      fallbackToLegacy: true,
      error: `init request failed: ${stringifyError(e)}`,
    };
  }
  if (!initRes.ok) {
    const body = await safeJson(initRes);
    return {
      ok: false,
      // 4xx auth / config errors aren't going to magically work on the
      // legacy route either — surface them directly.
      fallbackToLegacy: initRes.status >= 500,
      error: body?.error ?? `HTTP ${initRes.status}`,
    };
  }
  const initBody = (await initRes.json()) as {
    ok: boolean;
    uploadUrl?: string;
    storagePath?: string;
    error?: string;
  };
  if (!initBody.ok || !initBody.uploadUrl || !initBody.storagePath) {
    return {
      ok: false,
      fallbackToLegacy: false,
      error: initBody.error ?? "Could not start upload.",
    };
  }

  opts.onProgress?.({
    phase: "uploading",
    bytesTotal: compressed.file.size,
    compression: compressed,
  });
  const putOk = await putToSignedUrl(initBody.uploadUrl, compressed.file);
  if (!putOk.ok) {
    return { ok: false, fallbackToLegacy: true, error: putOk.error };
  }

  opts.onProgress?.({ phase: "registering", compression: compressed });
  let regRes: Response;
  try {
    regRes = await fetch("/api/admin/media/upload/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId,
        storagePath: initBody.storagePath,
        kind,
        originalFilename: file.name || null,
        originalMime: file.type || null,
      }),
    });
  } catch (e) {
    return {
      ok: false,
      fallbackToLegacy: true,
      error: `register request failed: ${stringifyError(e)}`,
    };
  }
  const regBody = await safeJson(regRes);
  if (!regRes.ok || !regBody?.ok || !regBody.item) {
    return {
      ok: false,
      fallbackToLegacy: regRes.status >= 500,
      error: regBody?.error ?? `HTTP ${regRes.status}`,
    };
  }

  return {
    ok: true,
    item: regBody.item as CmsMediaItem,
    compression: compressed,
  };
}

// ── Shared low-level PUT ────────────────────────────────────────────────

async function putToSignedUrl(
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

function passthroughCompressed(file: File): CompressResult {
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

async function safeJson(res: Response): Promise<{ ok?: boolean; error?: string; item?: CmsMediaItem } | null> {
  try {
    return (await res.json()) as { ok?: boolean; error?: string; item?: CmsMediaItem };
  } catch {
    return null;
  }
}

function stringifyError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
