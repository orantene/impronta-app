/**
 * media-resize — server-side image normalization before Supabase upload.
 *
 * Background: the original upload flow stored raw camera files (5–15 MB
 * JPEG/HEIC) directly in `media-public` and served them as-is to clients.
 * That's the dominant Supabase egress cost on free tier — every directory
 * paint streams full-resolution originals through the Smart CDN.
 *
 * This module re-encodes uploads to a sensible web-serving size and
 * format BEFORE they hit Storage. Combined with the Vercel image
 * optimizer (next.config.images.remotePatterns), the served pixel cost
 * drops roughly 25–50× per asset.
 *
 * Sizing strategy: cap the longest edge at the variant-appropriate
 * dimension (gallery the loosest, card/hero tighter) and re-encode as
 * JPEG at q=82. JPEG is preferred over WebP for source storage so
 * legacy/CDN-direct fetches still display; the optimizer transcodes to
 * AVIF/WebP at the edge per `next.config.images.formats`.
 *
 * EXIF orientation is honored (sharp.rotate()) and stripped from output.
 * Animated GIFs / videos are NOT routed through here — callers detect
 * them upstream and pass through unchanged.
 */
import "server-only";
import sharp from "sharp";

/** Variant-kind → max longest-edge in CSS pixels. */
const MAX_LONG_EDGE: Record<string, number> = {
  hero: 1400,            // 4:5 cover — 1120×1400 portrait
  card: 900,             // headshot thumbnail — 720×900 portrait
  gallery: 1800,         // lightbox feeds off these
  lightbox: 1800,        // alias of gallery sizing
  polaroid: 800,         // four-up polaroid grid
  banner: 1800,          // full-width strip
  watermarked: 1800,     // post-watermark variant
  public_watermarked: 1800,
};

const DEFAULT_LONG_EDGE = 1800;

/** Quality knob — 82 is the visually-transparent sweet spot for JPEG. */
const JPEG_QUALITY = 82;

export type ResizedUpload = {
  /** Resized, re-encoded image bytes ready for storage.upload(). */
  buffer: Buffer;
  /** "image/jpeg" for photos, "image/png" when the source had alpha. */
  mimeType: "image/jpeg" | "image/png";
  /** Storage extension that matches mimeType — caller uses this in the path. */
  ext: "jpg" | "png";
  /** New longest-edge dimensions for media_assets.width/height. */
  width: number;
  height: number;
  /** Final byte size — for media_assets.file_size_bytes. */
  byteSize: number;
  /** Original byte size, for logging/audit. */
  originalByteSize: number;
};

/**
 * Resize + re-encode an image for storage. Throws on un-decodeable input
 * so the caller's upload step short-circuits and returns a user-facing
 * error instead of writing a junk file.
 *
 * Format policy:
 * - Source has alpha (transparent PNGs — typically logos) → stay PNG,
 *   resize + lossless re-pack only.
 * - Anything else (photos, opaque PNGs) → convert to JPEG q=82 mozjpeg.
 *
 * Pass any variant_kind from the media_assets schema; unknown kinds
 * fall through to DEFAULT_LONG_EDGE (1800px), matching gallery.
 */
export async function resizeUploadForStorage(
  input: ArrayBuffer | Buffer,
  variantKind: string,
): Promise<ResizedUpload> {
  const inBuf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const longEdge = MAX_LONG_EDGE[variantKind] ?? DEFAULT_LONG_EDGE;

  // One sharp instance, two reads: first for metadata (to decide JPEG
  // vs PNG), then the actual pipeline. Cheap — metadata doesn't decode
  // the full image.
  const meta = await sharp(inBuf, { failOn: "none" }).metadata();
  const hasAlpha = meta.hasAlpha === true;

  const base = sharp(inBuf, { failOn: "none" })
    .rotate() // honor EXIF orientation, then strip
    .resize({
      width: longEdge,
      height: longEdge,
      fit: "inside",
      withoutEnlargement: true,
    });

  const pipeline = hasAlpha
    ? base.png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        // palette mode quantizes to ≤256 colors — typically 60–80% smaller
        // for logos / illustrations without visible degradation.
        palette: true,
      })
    : base.jpeg({
        quality: JPEG_QUALITY,
        mozjpeg: true, // smaller output, no quality cost
        chromaSubsampling: "4:2:0",
      });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    mimeType: hasAlpha ? "image/png" : "image/jpeg",
    ext: hasAlpha ? "png" : "jpg",
    width: info.width,
    height: info.height,
    byteSize: info.size,
    originalByteSize: inBuf.byteLength,
  };
}

/**
 * Per-request guard — applied before sharp touches the buffer so an
 * adversary can't OOM the server with a "100x100" PNG that decodes into
 * 100k×100k pixels. sharp limits decode to ~268M pixels by default; we
 * also cap input bytes at 8 MB via the caller. This is a defense-in-
 * depth check on top.
 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Centralized "is this safe to compress?" — videos / SVG / animated GIF
 * skip the pipeline. Callers should pass the file's MIME type before
 * calling resizeUploadForStorage. Returns true if the file should be
 * sharp-resized; false if it should pass through (or be rejected).
 */
export function shouldResize(mimeType: string): boolean {
  if (!mimeType.startsWith("image/")) return false;
  // SVG: text-based, no benefit, and sharp can crash on hostile SVGs
  if (mimeType === "image/svg+xml") return false;
  // GIF: usually animated — sharp would silently drop frames
  if (mimeType === "image/gif") return false;
  return true;
}
