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
import {
  SVG_LIBRARY_MAX_BYTES,
  SVG_MIME,
  passthroughCompressed,
  putToSignedUrl,
  uploadProgressReporter,
  safeJson,
  stringifyError,
  type CmsMediaItem,
  type FailureResult,
  type SignedUploadPhase,
  type SignedUploadProgress,
} from "@/lib/client/signed-upload-core";

// Shared vocabulary + transport primitives moved to ./signed-upload-core
// and the brand-mark lanes to ./signed-upload-logos when this file crossed
// the 800-line max-lines budget. Both are re-exported here so every
// existing `from "@/lib/client/signed-upload"` import is unchanged.
export type {
  CmsMediaItem,
  SignedUploadPhase,
  SignedUploadProgress,
} from "@/lib/client/signed-upload-core";
export {
  uploadAgencyLogo,
  uploadBrandingMedia,
  uploadTalentMaxSiteLogo,
  type AgencyLogoUploadOk,
  type BrandingMediaUploadOk,
  type MaxSiteLogoUploadOk,
} from "@/lib/client/signed-upload-logos";

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

  const putOk = await putToSignedUrl(
    signed.data.uploadUrl,
    compressed.file,
    uploadProgressReporter(opts.onProgress, compressed),
  );
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
    // A quota refusal is a decision, not a transport failure: never retry it.
    const fallbackToLegacy = registered.quotaBlocked !== true;
    return { ok: false, fallbackToLegacy, error: registered.error };
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

// ── Talent reel (video) uploads ─────────────────────────────────────────

/** Mirrors the legacy action's video allowance + the bucket cap. */
const MAX_REEL_BYTES = 200 * 1024 * 1024;

const REEL_MIME_TO_EXT: Record<string, "mp4" | "mov" | "webm"> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export type TalentReelUploadOk = {
  ok: true;
  id: string;
  publicUrl: string;
  sortOrder: number;
};

/**
 * Hello-reel upload: signed PUT direct to storage, no canvas step —
 * video can't round-trip a canvas, and it's exactly the payload the
 * 4 MB Server Action body cap makes impossible to ship any other way.
 * `fallbackToLegacy` is only set for container formats the signed
 * pipeline doesn't whitelist (avi/mkv/…): tiny clips in those formats
 * can still make it through the legacy action.
 */
export async function uploadTalentReel(opts: {
  file: File;
  talentProfileId: string;
  onProgress?: (p: SignedUploadProgress) => void;
}): Promise<TalentReelUploadOk | FailureResult> {
  const { file, talentProfileId } = opts;

  if (!file.type.startsWith("video/")) {
    return { ok: false, fallbackToLegacy: true, error: "not a video file" };
  }
  if (file.size > MAX_REEL_BYTES) {
    return {
      ok: false,
      fallbackToLegacy: false,
      error: `Video must be under ${Math.round(MAX_REEL_BYTES / 1024 / 1024)} MB.`,
    };
  }
  const ext = REEL_MIME_TO_EXT[file.type];
  if (!ext) {
    return {
      ok: false,
      fallbackToLegacy: true,
      error: `unsupported video container (${file.type})`,
    };
  }

  const { actionCreateSignedUploadUrl, actionRegisterUploadedAsset } =
    await import("@/app/(workspace)/[tenantSlug]/admin/media/actions");
  const signed = await actionCreateSignedUploadUrl("reel", talentProfileId, ext);
  if (!signed.ok) {
    return { ok: false, fallbackToLegacy: false, error: signed.error };
  }

  opts.onProgress?.({ phase: "uploading", bytesTotal: file.size });
  const putOk = await putToSignedUrl(
    signed.data.uploadUrl,
    file,
    uploadProgressReporter(opts.onProgress),
  );
  if (!putOk.ok) {
    // A failed 100 MB PUT will not fare better as a 100 MB Server
    // Action body — surface the error instead of a doomed retry.
    return { ok: false, fallbackToLegacy: false, error: putOk.error };
  }

  opts.onProgress?.({ phase: "registering" });
  const registered = await actionRegisterUploadedAsset({
    storagePath: signed.data.storagePath,
    variantKind: "reel",
    talentProfileId,
    originalFilename: file.name || null,
  });
  if (!registered.ok) {
    return { ok: false, fallbackToLegacy: false, error: registered.error };
  }

  return {
    ok: true,
    id: registered.data.id,
    publicUrl: registered.data.publicUrl,
    sortOrder: registered.data.sortOrder,
  };
}

// ── Voice notes (inquiry threads — private bucket) ──────────────────────

/**
 * Voice-note upload: signed PUT of the recorded audio into inquiry-files,
 * then a finalize action that writes the attachment + voice-message rows.
 * Long recordings exceed the 4 MB Server Action cap the legacy FormData
 * path rides on; this transport has the bucket's 100 MB ceiling instead.
 */
export async function uploadVoiceNoteSigned(opts: {
  inquiryId: string;
  threadType: "private" | "group";
  blob: Blob;
  mimeType: string;
  durationMs: number;
}): Promise<{ ok: true; messageId: string } | FailureResult> {
  const { inquiryId, blob } = opts;
  if (blob.size === 0) {
    return { ok: false, fallbackToLegacy: false, error: "Recording is empty." };
  }

  const ext = opts.mimeType.includes("ogg")
    ? "ogg"
    : opts.mimeType.includes("mp4")
      ? "m4a"
      : "webm";

  const { createVoiceNoteUploadUrl, finalizeVoiceNote } =
    await import("@/lib/server-actions/voice-notes");

  const signed = await createVoiceNoteUploadUrl(inquiryId, ext);
  if (!signed.ok) {
    return { ok: false, fallbackToLegacy: false, error: signed.error };
  }

  const putOk = await putToSignedUrl(signed.data.uploadUrl, blob);
  if (!putOk.ok) {
    // Short recordings still fit through the legacy FormData action.
    return { ok: false, fallbackToLegacy: blob.size < 4 * 1024 * 1024, error: putOk.error };
  }

  const finalized = await finalizeVoiceNote({
    inquiryId,
    threadType: opts.threadType,
    durationMs: opts.durationMs,
    storagePath: signed.data.storagePath,
    mimeType: opts.mimeType,
  });
  if (!finalized.ok) {
    return { ok: false, fallbackToLegacy: false, error: finalized.error };
  }
  return finalized;
}

// ── Talent documents (comp cards, contracts — private bucket) ───────────

export type TalentDocumentUploadOk = {
  ok: true;
  storagePath: string;
  bucketId: string;
  sizeBytes: number;
  mimeType: string;
};

/**
 * Document upload for the Files editor: signed PUT into the private
 * media-originals bucket, then a finalize action that stats the object.
 * No compression — a contract's bytes must land exactly as picked.
 */
export async function uploadTalentDocumentSigned(opts: {
  file: File;
  talentProfileId: string;
  onProgress?: (p: SignedUploadProgress) => void;
}): Promise<TalentDocumentUploadOk | FailureResult> {
  const { file, talentProfileId } = opts;

  if (file.size === 0) {
    return { ok: false, fallbackToLegacy: false, error: "File is empty." };
  }
  if (file.size > 50 * 1024 * 1024) {
    return { ok: false, fallbackToLegacy: false, error: "File must be under 50 MB." };
  }

  const { actionCreateDocumentSignedUploadUrl, actionFinalizeDocumentUpload } =
    await import("@/app/(workspace)/[tenantSlug]/admin/media/actions");

  const signed = await actionCreateDocumentSignedUploadUrl(
    talentProfileId,
    file.name || "file.bin",
  );
  if (!signed.ok) {
    return { ok: false, fallbackToLegacy: false, error: signed.error };
  }

  opts.onProgress?.({ phase: "uploading", bytesTotal: file.size });
  const putOk = await putToSignedUrl(
    signed.data.uploadUrl,
    file,
    uploadProgressReporter(opts.onProgress),
  );
  if (!putOk.ok) {
    // Small documents may still fit through the legacy FormData action.
    return { ok: false, fallbackToLegacy: file.size < 4 * 1024 * 1024, error: putOk.error };
  }

  opts.onProgress?.({ phase: "registering" });
  const finalized = await actionFinalizeDocumentUpload(
    talentProfileId,
    signed.data.storagePath,
  );
  if (!finalized.ok) {
    return { ok: false, fallbackToLegacy: false, error: finalized.error };
  }

  return { ok: true, ...finalized.data };
}

// ── Inquiry attachments (message threads, staff + client) ───────────────

export type InquiryAttachmentUploadOk = {
  ok: true;
  attachmentId: string;
  filename: string;
  byteSize: number;
  attachmentKind: string | null;
};

/**
 * Attachment upload for inquiry threads: signed PUT into the private
 * inquiry-files bucket, then register. No compression — attachments
 * are documents; the bytes the user picked are the bytes that land.
 * Works for both staff and client callers (the server resolves scope
 * from the session + inquiry).
 */
export async function uploadInquiryAttachmentSigned(opts: {
  inquiryId: string;
  file: File;
  attachmentKind?: string | null;
  description?: string | null;
  onProgress?: (p: SignedUploadProgress) => void;
}): Promise<InquiryAttachmentUploadOk | FailureResult> {
  const { inquiryId, file } = opts;

  if (file.size === 0) {
    return { ok: false, fallbackToLegacy: false, error: "File is empty." };
  }
  if (file.size > 100 * 1024 * 1024) {
    return { ok: false, fallbackToLegacy: false, error: "File exceeds 100 MB cap." };
  }

  const { actionCreateInquiryAttachmentUploadUrl, actionRegisterInquiryAttachment } =
    await import("@/lib/server-actions/inquiry-attachment-signed");

  const signed = await actionCreateInquiryAttachmentUploadUrl(
    inquiryId,
    file.name || "file",
  );
  if (!signed.ok) {
    return { ok: false, fallbackToLegacy: false, error: signed.error };
  }

  opts.onProgress?.({ phase: "uploading", bytesTotal: file.size });
  const putOk = await putToSignedUrl(
    signed.data.uploadUrl,
    file,
    uploadProgressReporter(opts.onProgress),
  );
  if (!putOk.ok) {
    // Small files may still fit through the legacy FormData action;
    // big ones won't, but the caller's fallback will say so honestly.
    return { ok: false, fallbackToLegacy: file.size < 4 * 1024 * 1024, error: putOk.error };
  }

  opts.onProgress?.({ phase: "registering" });
  const registered = await actionRegisterInquiryAttachment({
    inquiryId,
    storagePath: signed.data.storagePath,
    filename: file.name || "file",
    mimeType: file.type || null,
    attachmentKind: opts.attachmentKind ?? null,
    description: opts.description ?? null,
  });
  if (!registered.ok) {
    return { ok: false, fallbackToLegacy: false, error: registered.error };
  }

  return { ok: true, ...registered.data };
}

// ── Inquiry-drawer attachments (submitter scope, guests included) ───────

export type InquirySubmitAttachmentResult = {
  filename: string;
  ok: boolean;
  error?: string;
};

/**
 * T4 — upload the files staged in the InquiryDrawer AFTER the inquiry has
 * been created. The drawer used to append them to the submit action's
 * FormData, which put the whole inquiry behind the ~4 MB Server Action
 * body cap despite advertising 10 x 20 MB.
 *
 * Sequential on purpose: these are the submitter's own files on a public
 * surface, and a serial loop keeps the reported progress truthful. Every
 * file gets its own result — nothing is dropped silently the way the old
 * server-side `continue` did.
 */
export async function uploadInquirySubmitAttachments(opts: {
  tenantSlug: string;
  inquiryId: string;
  files: File[];
  onFileDone?: (done: number, total: number) => void;
}): Promise<InquirySubmitAttachmentResult[]> {
  const { tenantSlug, inquiryId, files } = opts;
  const actions = await import(
    "@/app/(workspace)/[tenantSlug]/client/_actions/inquiry-intent-actions"
  );

  const results: InquirySubmitAttachmentResult[] = [];
  let done = 0;
  for (const file of files) {
    const name = file.name || "file";
    const signed = await actions.createInquiryAttachmentUploadUrlAction({
      tenantSlug,
      inquiryId,
      filename: name,
      mimeType: file.type || "application/octet-stream",
      byteSize: file.size,
    });
    if (!signed.ok) {
      results.push({ filename: name, ok: false, error: signed.error });
      opts.onFileDone?.(++done, files.length);
      continue;
    }

    // No per-byte reporter here on purpose: this lane's contract is
    // `onFileDone(done, total)` (a serial file counter), not a byte bar.
    const putOk = await putToSignedUrl(signed.data.uploadUrl, file);
    if (!putOk.ok) {
      results.push({ filename: name, ok: false, error: putOk.error });
      opts.onFileDone?.(++done, files.length);
      continue;
    }

    const registered = await actions.registerInquiryAttachmentAction({
      tenantSlug,
      inquiryId,
      storagePath: signed.data.storagePath,
      filename: name,
    });
    results.push(
      registered.ok
        ? { filename: name, ok: true }
        : { filename: name, ok: false, error: registered.error },
    );
    opts.onFileDone?.(++done, files.length);
  }
  return results;
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

  const putOk = await putToSignedUrl(
    signed.data.uploadUrl,
    compressed.file,
    uploadProgressReporter(opts.onProgress, compressed),
  );
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

  // SVG lane — never rides the signed PUT. A signed URL would put the raw
  // caller-supplied markup into the PUBLIC bucket the moment it lands (and
  // a caller that simply never calls register leaves it there), which is
  // stored XSS. The text goes to a server route that sanitizes first and
  // stores only what the sanitizer returned. Mirrors uploadAgencyLogo.
  if (kind === "image" && (file.type === SVG_MIME || /\.svg$/i.test(file.name))) {
    return uploadCmsSvg(file, tenantId);
  }

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
      // byteSize is the post-compression size we are about to PUT. The
      // server treats it as a hint only (register re-measures storage),
      // but it lets an over-cap file be refused before the bytes fly.
      body: JSON.stringify({
        tenantId,
        kind,
        ext,
        byteSize: compressed.file.size,
      }),
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
  const putOk = await putToSignedUrl(
    initBody.uploadUrl,
    compressed.file,
    uploadProgressReporter(opts.onProgress, compressed),
  );
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

/**
 * SVG library upload: the markup rides a JSON POST (SVGs are text and
 * capped at 256 KB) so the server can sanitize BEFORE anything reaches
 * the public bucket. Never falls back to legacy — the legacy multipart
 * route rejects SVG outright and always has.
 */
async function uploadCmsSvg(
  file: File,
  tenantId: string,
): Promise<CmsUploadOk | FailureResult> {
  if (file.size === 0) {
    return { ok: false, fallbackToLegacy: false, error: "File is empty." };
  }
  if (file.size > SVG_LIBRARY_MAX_BYTES) {
    return {
      ok: false,
      fallbackToLegacy: false,
      error: `SVG must be under ${Math.round(SVG_LIBRARY_MAX_BYTES / 1024)} KB.`,
    };
  }

  let svgText: string;
  try {
    svgText = await file.text();
  } catch (e) {
    return {
      ok: false,
      fallbackToLegacy: false,
      error: `Could not read SVG: ${stringifyError(e)}`,
    };
  }

  let res: Response;
  try {
    res = await fetch("/api/admin/media/upload/svg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId,
        svg: svgText,
        originalFilename: file.name || null,
      }),
    });
  } catch (e) {
    return {
      ok: false,
      fallbackToLegacy: false,
      error: `SVG upload failed: ${stringifyError(e)}`,
    };
  }

  const body = await safeJson(res);
  if (!res.ok || !body?.ok || !body.item) {
    return {
      ok: false,
      fallbackToLegacy: false,
      error: body?.error ?? `HTTP ${res.status}`,
    };
  }
  return {
    ok: true,
    item: body.item,
    compression: passthroughCompressed(file),
  };
}

