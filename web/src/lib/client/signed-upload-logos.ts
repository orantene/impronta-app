/**
 * signed-upload-logos — the brand-mark upload lanes (agency wordmark,
 * talent Max-site logo, workspace brand images).
 *
 * Split out of `signed-upload.ts` for the 800-line max-lines budget; the
 * barrel re-exports every name, so callers are unchanged. These three
 * lanes belong together: each pairs a compressed raster signed-PUT with
 * a server finalize, and each has an SVG sibling that must NOT ride a
 * signed PUT (raw markup on a public URL is stored XSS — the text goes
 * to a server action that sanitizes before storing).
 */

import { compressImage, type CompressResult } from "@/lib/client/image-compress";
import {
  SVG_LIBRARY_MAX_BYTES,
  SVG_MIME,
  putToSignedUrl,
  uploadProgressReporter,
  type FailureResult,
  type SignedUploadProgress,
} from "@/lib/client/signed-upload-core";

// ── Agency logo (branding drawer) ───────────────────────────────────────

export type AgencyLogoUploadOk = { ok: true; logoUrl: string };

const LOGO_SVG_MAX_BYTES = 256 * 1024;
const LOGO_RASTER_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Agency logo upload (Wave 5.1): replaces the raw-FormData
 * actionUploadAgencyLogo server action, whose 10 MB cap was unreachable
 * behind the ~4 MB Server Action body limit and which stored SVG bytes
 * un-sanitized into the public bucket.
 *
 * Raster (png/jpg/webp): compress in-browser, signed PUT direct to
 * storage, then a finalize action that re-verifies the bytes server-side.
 * SVG: the text rides a plain server action (small by definition) and is
 * stored only if the strict brand-mark sanitizer accepts it.
 *
 * No legacy fallback on purpose — the legacy transport is the thing this
 * replaces. `fallbackToLegacy` is always false.
 */
export async function uploadAgencyLogo(opts: {
  file: File;
  onProgress?: (p: SignedUploadProgress) => void;
}): Promise<AgencyLogoUploadOk | FailureResult> {
  const { file } = opts;
  if (file.size === 0) {
    return { ok: false, fallbackToLegacy: false, error: "File is empty." };
  }

  const actions = await import("@/lib/server-actions/admin-agency-logo-upload");

  // SVG lane — sanitized server-side, text transport.
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
    if (file.size > LOGO_SVG_MAX_BYTES) {
      return {
        ok: false,
        fallbackToLegacy: false,
        error: "SVG logo must be under 256 KB.",
      };
    }
    const svgText = await file.text();
    const result = await actions.actionUploadAgencyLogoSvg(svgText);
    if (!result.ok) {
      return { ok: false, fallbackToLegacy: false, error: result.error };
    }
    return { ok: true, logoUrl: result.logoUrl };
  }

  // Raster lane — compress, signed PUT, finalize.
  opts.onProgress?.({ phase: "compressing" });
  const compressed = await compressImage(file);
  const ext = compressed.ext === "jpeg" ? "jpg" : compressed.ext;
  if (ext !== "jpg" && ext !== "png" && ext !== "webp") {
    return {
      ok: false,
      fallbackToLegacy: false,
      error: "Logo must be a PNG, SVG, JPEG or WebP file.",
    };
  }
  if (compressed.file.size > LOGO_RASTER_MAX_BYTES) {
    return {
      ok: false,
      fallbackToLegacy: false,
      error: "Logo must be under 8 MB after compression.",
    };
  }

  const signed = await actions.actionCreateAgencyLogoUploadUrl(ext);
  if (!signed.ok) {
    return { ok: false, fallbackToLegacy: false, error: signed.error };
  }

  opts.onProgress?.({
    phase: "uploading",
    bytesTotal: compressed.file.size,
    compression: compressed,
  });
  const putOk = await putToSignedUrl(
    signed.uploadUrl,
    compressed.file,
    uploadProgressReporter(opts.onProgress, compressed),
  );
  if (!putOk.ok) {
    return { ok: false, fallbackToLegacy: false, error: putOk.error };
  }

  opts.onProgress?.({ phase: "registering", compression: compressed });
  const finalized = await actions.actionFinalizeAgencyLogo(signed.storagePath);
  if (!finalized.ok) {
    return { ok: false, fallbackToLegacy: false, error: finalized.error };
  }
  return { ok: true, logoUrl: finalized.logoUrl };
}

// ── Talent Max-site logo (talent self-service site manager) ─────────────

export type MaxSiteLogoUploadOk = { ok: true; logoUrl: string };

const MAX_SITE_LOGO_MAX_BYTES = 10 * 1024 * 1024;

/**
 * D7 — Max-site logo upload. The old path posted the raw File through a
 * Server Action, so its advertised 10 MB allowance was unreachable behind
 * the ~4 MB body cap and the resulting 413 surfaced as nothing at all.
 *
 * Raster: compress → signed PUT → finalize (server re-verifies size +
 * magic bytes and writes the media_assets row).
 * SVG: text transport, sanitized server-side before storage.
 */
export async function uploadTalentMaxSiteLogo(opts: {
  file: File;
  onProgress?: (p: SignedUploadProgress) => void;
}): Promise<MaxSiteLogoUploadOk | FailureResult> {
  const { file } = opts;
  if (file.size === 0) {
    return { ok: false, fallbackToLegacy: false, error: "File is empty." };
  }
  if (file.size > MAX_SITE_LOGO_MAX_BYTES) {
    return { ok: false, fallbackToLegacy: false, error: "Logo must be under 10 MB." };
  }

  const actions = await import("@/lib/talent-site/server/site-logo-actions");

  if (file.type === SVG_MIME || /\.svg$/i.test(file.name)) {
    if (file.size > SVG_LIBRARY_MAX_BYTES) {
      return {
        ok: false,
        fallbackToLegacy: false,
        error: "SVG logo must be under 256 KB.",
      };
    }
    const result = await actions.uploadMaxSiteLogoSvgAction(await file.text());
    if (!result.ok || !result.data) {
      return {
        ok: false,
        fallbackToLegacy: false,
        error: result.ok ? "Upload failed. Try again." : result.error,
      };
    }
    return { ok: true, logoUrl: result.data.logoUrl };
  }

  opts.onProgress?.({ phase: "compressing" });
  const compressed = await compressImage(file);
  const ext = compressed.ext === "jpeg" ? "jpg" : compressed.ext;
  if (ext !== "jpg" && ext !== "png" && ext !== "webp") {
    return {
      ok: false,
      fallbackToLegacy: false,
      error: "Logo must be a PNG, SVG, JPEG or WebP file.",
    };
  }
  if (compressed.file.size > MAX_SITE_LOGO_MAX_BYTES) {
    return {
      ok: false,
      fallbackToLegacy: false,
      error: "Logo must be under 10 MB after compression.",
    };
  }

  const signed = await actions.createMaxSiteLogoUploadUrlAction(ext);
  if (!signed.ok || !signed.data) {
    return {
      ok: false,
      fallbackToLegacy: false,
      error: signed.ok ? "Could not start upload. Try again." : signed.error,
    };
  }
  const grant = signed.data;

  opts.onProgress?.({
    phase: "uploading",
    bytesTotal: compressed.file.size,
    compression: compressed,
  });
  const putOk = await putToSignedUrl(
    grant.uploadUrl,
    compressed.file,
    uploadProgressReporter(opts.onProgress, compressed),
  );
  if (!putOk.ok) {
    return { ok: false, fallbackToLegacy: false, error: putOk.error };
  }

  opts.onProgress?.({ phase: "registering", compression: compressed });
  const finalized = await actions.finalizeMaxSiteLogoAction(grant.storagePath);
  if (!finalized.ok || !finalized.data) {
    return {
      ok: false,
      fallbackToLegacy: false,
      error: finalized.ok ? "Could not save the logo." : finalized.error,
    };
  }
  return { ok: true, logoUrl: finalized.data.logoUrl };
}

// ── Brand images (Settings → Brand identity media manager) ──────────────

export type BrandingMediaUploadOk = {
  ok: true;
  asset: import("@/lib/server-actions/admin-branding-media").BrandingMediaAsset;
  compression: CompressResult;
};

/**
 * Workspace brand-image upload: compress → signed PUT → register a
 * purpose='branding' media_assets row (auto-filed into the tenant's
 * Branding folder). Raster only — the wordmark's SVG lane stays on
 * uploadAgencyLogo. No legacy fallback: there is no FormData path for
 * brand media, and the signed pipeline is the only transport that
 * clears the 4 MB Server Action body cap.
 */
export async function uploadBrandingMedia(opts: {
  file: File;
  sourceMediaAssetId?: string | null;
  onProgress?: (p: SignedUploadProgress) => void;
}): Promise<BrandingMediaUploadOk | FailureResult> {
  const { file } = opts;
  if (file.size === 0) {
    return { ok: false, fallbackToLegacy: false, error: "File is empty." };
  }

  opts.onProgress?.({ phase: "compressing" });
  const compressed = await compressImage(file);
  const ext = compressed.ext === "jpeg" ? "jpg" : compressed.ext;
  if (ext !== "jpg" && ext !== "png" && ext !== "webp") {
    return {
      ok: false,
      fallbackToLegacy: false,
      error: "Brand images must be PNG, JPEG or WebP.",
    };
  }

  const actions = await import("@/lib/server-actions/admin-branding-media");
  const signed = await actions.actionCreateBrandingMediaUploadUrl(ext);
  if (!signed.ok) {
    return { ok: false, fallbackToLegacy: false, error: signed.error };
  }

  opts.onProgress?.({
    phase: "uploading",
    bytesTotal: compressed.file.size,
    compression: compressed,
  });
  const putOk = await putToSignedUrl(
    signed.uploadUrl,
    compressed.file,
    uploadProgressReporter(opts.onProgress, compressed),
  );
  if (!putOk.ok) {
    return { ok: false, fallbackToLegacy: false, error: putOk.error };
  }

  opts.onProgress?.({ phase: "registering", compression: compressed });
  const registered = await actions.actionRegisterBrandingMediaUpload({
    storagePath: signed.storagePath,
    originalFilename: file.name || null,
    sourceMediaAssetId: opts.sourceMediaAssetId ?? null,
  });
  if (!registered.ok) {
    return { ok: false, fallbackToLegacy: false, error: registered.error };
  }

  return { ok: true, asset: registered.data, compression: compressed };
}

