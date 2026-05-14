import "server-only";

import sharp from "sharp";
import { logServerError } from "@/lib/server/safe-error";

export type ExtractedMediaMetadata = {
  width: number | null;
  height: number | null;
  fileSizeBytes: number;
  mimeType: string;
  originalFilename: string;
};

const SVG_MIME = "image/svg+xml";

// Only allow specific raster + modern photo formats. SVG excluded
// because it can execute embedded JavaScript when served from the
// public bucket. "image/" with an empty subtype is rejected.
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
]);

export function isSafeImageMime(mime: string): boolean {
  if (!mime || mime === SVG_MIME) return false;
  return ALLOWED_IMAGE_MIMES.has(mime.toLowerCase());
}

export async function extractImageMetadata(
  file: File,
  buffer: ArrayBuffer,
): Promise<ExtractedMediaMetadata> {
  const mimeType = file.type || "application/octet-stream";
  const fileSizeBytes = file.size;
  const originalFilename = file.name || "upload";

  let width: number | null = null;
  let height: number | null = null;

  if (mimeType.startsWith("image/") && mimeType !== SVG_MIME) {
    try {
      const meta = await sharp(Buffer.from(buffer)).metadata();
      width = typeof meta.width === "number" ? meta.width : null;
      height = typeof meta.height === "number" ? meta.height : null;
    } catch (err) {
      logServerError("media-metadata.sharp", err);
    }
  }

  return { width, height, fileSizeBytes, mimeType, originalFilename };
}
