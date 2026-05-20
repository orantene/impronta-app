/**
 * image-compress — browser-only client-side resize + re-encode.
 *
 * Background: the previous upload flow shipped raw camera files (5-15 MB
 * iPhone JPEGs) through a Vercel Function which then ran sharp before
 * writing to Supabase Storage. That wastes the user's mobile-data upload
 * bandwidth and holds a Function open for the entire wire transfer.
 *
 * This helper does the resize FIRST in the browser, so the bytes that
 * leave the device are already near-final (~150 KB). The caller then
 * uploads the compressed File directly to Supabase via a signed URL.
 * Server-side sharp still runs as defense-in-depth (a malicious client
 * could lie about having compressed) — but on the happy path the
 * Function never sees the original pixels.
 *
 * Mirrors the server-side `media-resize.ts` policy:
 *   - Cap longest edge (default 1800, matches gallery sizing).
 *   - JPEG q=0.82 for photos, PNG for alpha-bearing inputs.
 *   - Honor EXIF orientation (createImageBitmap imageOrientation).
 *   - Never enlarge.
 *   - Skip SVG, GIF, non-images.
 *
 * Implementation: prefers OffscreenCanvas + createImageBitmap (zero main-
 * thread blocking, fastest decode). Falls back to <canvas> + HTMLImageElement
 * for browsers without those (Safari < 16.4 OffscreenCanvas.convertToBlob).
 *
 * No npm dependencies — Web APIs only.
 */

export type CompressOptions = {
  /** Max longest edge in CSS pixels. Mirrors media-resize.ts gallery sizing. */
  maxLongEdge?: number;
  /** JPEG quality 0-1. 0.82 = visually-transparent sweet spot (matches server). */
  quality?: number;
};

export type CompressSkipReason =
  | "not_image"
  | "svg"
  | "animated_gif"
  | "smaller_already"
  | "no_canvas_api"
  | "decode_failed"
  | "encode_failed";

export type CompressResult = {
  /** Resulting file. When skipped === true this is the same File reference
   *  as the input — caller can pass it through unchanged. */
  file: File;
  /** True when compression was bypassed; see `reason`. */
  skipped: boolean;
  reason?: CompressSkipReason;
  /** Bytes before compression. */
  originalSize: number;
  /** Bytes after compression. Equals originalSize when skipped. */
  compressedSize: number;
  /** compressedSize / originalSize. 1 when skipped, < 1 when we won. */
  compressionRatio: number;
  /** Output content-type (caller passes this as Content-Type on the
   *  signed PUT, so storage records the right mime). */
  mimeType: string;
  /** Output extension without leading dot — caller uses to build the
   *  storage path (`${uuid}.${ext}`). */
  ext: "jpg" | "png" | string;
};

const DEFAULT_MAX_LONG_EDGE = 1800;
const DEFAULT_QUALITY = 0.82;

/**
 * Run client-side compression on a File. Always resolves — failures fall
 * through to `{ skipped: true, reason }` with the original File so the
 * caller's upload pipeline can still proceed (server-side sharp picks up
 * the slack).
 */
export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<CompressResult> {
  const maxLongEdge = opts.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const originalSize = file.size;

  // ── Bypass rules ────────────────────────────────────────────────────────
  if (!file.type.startsWith("image/")) {
    return pass(file, originalSize, "not_image");
  }
  if (file.type === "image/svg+xml") {
    // Vector — already tiny; canvas would rasterize and balloon the
    // bytes. Server-side mime guard also rejects SVG.
    return pass(file, originalSize, "svg");
  }
  if (file.type === "image/gif") {
    // Animated GIF can't round-trip through canvas without losing frames;
    // sharp on the server also bypasses GIFs. Skip to preserve animation.
    return pass(file, originalSize, "animated_gif");
  }

  // PNG / WebP-with-alpha → keep alpha by re-encoding as PNG instead of
  // JPEG. Cheap heuristic — anything starting with image/png is treated
  // as alpha-bearing. Logos / illustrations stay crisp; gallery photos
  // are virtually never PNG.
  const keepAlpha = file.type === "image/png";

  // Modern path: OffscreenCanvas + createImageBitmap. Honors EXIF
  // orientation via imageOrientation, never blocks the main thread.
  if (
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap === "function"
  ) {
    try {
      return await compressViaOffscreen(file, {
        maxLongEdge,
        quality,
        keepAlpha,
        originalSize,
      });
    } catch (e) {
      // Fall through to legacy canvas path below — at least one mobile
      // Safari version has a half-implemented OffscreenCanvas that throws
      // on convertToBlob. Don't fail the upload, just degrade.
      void e;
    }
  }

  // Legacy fallback: <canvas> + HTMLImageElement + URL.createObjectURL.
  if (typeof document !== "undefined") {
    try {
      return await compressViaCanvas(file, {
        maxLongEdge,
        quality,
        keepAlpha,
        originalSize,
      });
    } catch {
      return pass(file, originalSize, "encode_failed");
    }
  }

  return pass(file, originalSize, "no_canvas_api");
}

// ── Implementation ──────────────────────────────────────────────────────

type Pipeline = {
  maxLongEdge: number;
  quality: number;
  keepAlpha: boolean;
  originalSize: number;
};

async function compressViaOffscreen(
  file: File,
  p: Pipeline,
): Promise<CompressResult> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return pass(file, p.originalSize, "decode_failed");
  }

  const { targetW, targetH, skipped } = computeTargetSize(
    bitmap.width,
    bitmap.height,
    p.maxLongEdge,
  );
  if (skipped) {
    bitmap.close?.();
    // Already small enough — don't re-encode (would just lose quality
    // for no size win). Server still re-checks bytes anyway.
    return pass(file, p.originalSize, "smaller_already");
  }

  const canvas = new OffscreenCanvas(targetW, targetH);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return pass(file, p.originalSize, "no_canvas_api");
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();

  const outType = p.keepAlpha ? "image/png" : "image/jpeg";
  let blob: Blob;
  try {
    blob = await canvas.convertToBlob(
      // PNG ignores quality; passing it is harmless.
      { type: outType, quality: p.quality },
    );
  } catch {
    return pass(file, p.originalSize, "encode_failed");
  }

  return packResult(file, blob, p.originalSize, outType);
}

async function compressViaCanvas(
  file: File,
  p: Pipeline,
): Promise<CompressResult> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    const { targetW, targetH, skipped } = computeTargetSize(
      naturalW,
      naturalH,
      p.maxLongEdge,
    );
    if (skipped) return pass(file, p.originalSize, "smaller_already");

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return pass(file, p.originalSize, "no_canvas_api");
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const outType = p.keepAlpha ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outType, p.quality);
    });
    if (!blob) return pass(file, p.originalSize, "encode_failed");

    return packResult(file, blob, p.originalSize, outType);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

function computeTargetSize(
  w: number,
  h: number,
  maxLongEdge: number,
): { targetW: number; targetH: number; skipped: boolean } {
  const longEdge = Math.max(w, h);
  if (longEdge <= maxLongEdge) {
    return { targetW: w, targetH: h, skipped: true };
  }
  const scale = maxLongEdge / longEdge;
  return {
    targetW: Math.round(w * scale),
    targetH: Math.round(h * scale),
    skipped: false,
  };
}

function packResult(
  source: File,
  blob: Blob,
  originalSize: number,
  outType: "image/jpeg" | "image/png",
): CompressResult {
  const ext = outType === "image/png" ? "png" : "jpg";
  // Rebuild as File so the caller can keep using .name (with a
  // ".compressed" infix so logs don't pretend it's the original).
  const baseName = stripExt(source.name || "upload");
  const file = new File([blob], `${baseName}.compressed.${ext}`, {
    type: outType,
    lastModified: Date.now(),
  });
  return {
    file,
    skipped: false,
    originalSize,
    compressedSize: file.size,
    compressionRatio: originalSize > 0 ? file.size / originalSize : 1,
    mimeType: outType,
    ext,
  };
}

function pass(
  file: File,
  originalSize: number,
  reason: CompressSkipReason,
): CompressResult {
  // Best-effort extension inference for the pass-through case. Used by
  // the caller to build the storage path; the server is the source of
  // truth on the actual stored mime type.
  const extFromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  const extFromMime = (file.type.split("/")[1] ?? "").replace(/^x-/, "");
  const ext = (extFromName || extFromMime || "bin").replace(/[^a-z0-9]/g, "");
  return {
    file,
    skipped: true,
    reason,
    originalSize,
    compressedSize: originalSize,
    compressionRatio: 1,
    mimeType: file.type || "application/octet-stream",
    ext: ext || "bin",
  };
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
