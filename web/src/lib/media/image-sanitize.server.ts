/**
 * image-sanitize.server.ts: the sharp side of the H1 upload guards.
 *
 * Two jobs:
 *   • PIXEL CAP. `SHARP_INPUT_LIMITS` is the options object every user-image
 *     `sharp()` call should pass. sharp enforces `limitInputPixels` on
 *     `metadata()` as well as on decode, so a decompression bomb is refused at
 *     the header read instead of after allocating gigabytes.
 *   • LOCATION STRIP. Phone photos carry EXIF GPS. sharp drops ALL metadata
 *     (EXIF, XMP, IPTC) on output unless `withMetadata()`/`keepExif()` is
 *     called, and nothing in this repo calls either. `stripImageMetadata`
 *     re-encodes in the source format after `rotate()` (orientation is baked
 *     into pixels first, so dropping the EXIF orientation tag cannot turn a
 *     portrait sideways). Paths that store bytes WITHOUT going through
 *     `resizeUploadForStorage` use it.
 */
import "server-only";
import sharp from "sharp";

import { MAX_INPUT_PIXELS, withinPixelBudget } from "./upload-guards";

export const SHARP_INPUT_LIMITS = {
  limitInputPixels: MAX_INPUT_PIXELS,
  failOn: "none",
} as const;

export class ImagePixelLimitError extends Error {
  constructor(width: number, height: number) {
    super(`Image is ${width}x${height}, over the ${MAX_INPUT_PIXELS} pixel limit.`);
    this.name = "ImagePixelLimitError";
  }
}

/** Header read under the pixel cap. Throws on an over-budget or broken image. */
export async function readImageHeader(bytes: Buffer | Uint8Array): Promise<sharp.Metadata> {
  const meta = await sharp(bytes, SHARP_INPUT_LIMITS).metadata();
  if (!withinPixelBudget(meta.width, meta.height)) {
    throw new ImagePixelLimitError(meta.width ?? 0, meta.height ?? 0);
  }
  return meta;
}

/** True when the bytes carry EXIF, XMP or IPTC (GPS lives in EXIF/XMP). */
export async function hasEmbeddedMetadata(bytes: Buffer | Uint8Array): Promise<boolean> {
  try {
    const meta = await readImageHeader(bytes);
    return Boolean(meta.exif || meta.xmp || meta.iptc);
  } catch {
    // Unreadable: callers that ask this are about to re-encode anyway, and a
    // "yes" sends them down the re-encode path, which then fails closed.
    return true;
  }
}

/**
 * Re-encode without any metadata, same format, orientation baked in.
 * Throws on undecodable or over-budget input so callers refuse the file.
 * GIF is returned unchanged: it has no EXIF block, and a sharp round-trip
 * would drop animation frames.
 */
export async function stripImageMetadata(bytes: Buffer | Uint8Array): Promise<Buffer> {
  const meta = await readImageHeader(bytes);
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (meta.format === "gif") return buf;
  return sharp(buf, SHARP_INPUT_LIMITS).rotate().toBuffer();
}
