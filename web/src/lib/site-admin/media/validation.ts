export const MEDIA_PUBLIC_BUCKET = "media-public";
export const MEDIA_LIBRARY_MAX_ITEMS = 60;
export const MEDIA_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Per-kind upload caps. These are the numbers migration
 * 20261103000000_media_public_bucket_widen.sql documents as "enforced
 * in-process before storage" (image 8 MB / document 25 MB / video 200 MB).
 * The legacy multipart route did enforce them; the signed-upload lane
 * (upload/init + upload/register) shipped without any size check at all,
 * so the only effective ceiling was the bucket's 200 MB. These constants
 * are the single source of truth for BOTH lanes now.
 */
export const MEDIA_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
export const MEDIA_VIDEO_MAX_BYTES = 200 * 1024 * 1024;

export type MediaUploadKind = "image" | "document" | "video";

export function maxBytesForMediaKind(kind: MediaUploadKind): number {
  return kind === "document"
    ? MEDIA_DOCUMENT_MAX_BYTES
    : kind === "video"
      ? MEDIA_VIDEO_MAX_BYTES
      : MEDIA_IMAGE_MAX_BYTES;
}

const KIND_LABEL: Readonly<Record<MediaUploadKind, string>> = {
  image: "Image",
  document: "Document",
  video: "Video",
};

export type MediaSizeValidation =
  | { ok: true; byteSize: number }
  | { ok: false; status: 400 | 413; error: string };

/**
 * Kind-aware size gate. Used at BOTH ends of the signed pipeline:
 *  - upload/init, against the size the client *declares* (cheap refusal
 *    before a signed URL is minted), and
 *  - upload/register, against the size the object *actually* has in
 *    storage (the client-declared number is never trusted).
 */
export function validateMediaUploadSize(input: {
  kind: MediaUploadKind;
  byteSize: number;
}): MediaSizeValidation {
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    return { ok: false, status: 400, error: "Missing file." };
  }
  const maxBytes = maxBytesForMediaKind(input.kind);
  if (input.byteSize > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `${KIND_LABEL[input.kind]} exceeds ${Math.round(
        maxBytes / 1024 / 1024,
      )}MB limit.`,
    };
  }
  return { ok: true, byteSize: input.byteSize };
}

/** SVG library assets are only servable once the strict brand-mark
 *  sanitizer has accepted them; the register lane stamps this metadata
 *  key and `resolveAssetKind` refuses to classify an SVG without it. */
export const SVG_SANITIZED_METADATA_KEY = "svg_sanitized";
export const SVG_LIBRARY_MAX_BYTES = 256 * 1024;

export const IMAGE_MIME_TO_EXT: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type ImageUploadValidation =
  | { ok: true; mime: string; ext: string; byteSize: number }
  | { ok: false; status: 400 | 413 | 415; error: string };

export function validateImageUpload(input: {
  mime: string | null | undefined;
  byteSize: number;
  maxBytes?: number;
}): ImageUploadValidation {
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    return { ok: false, status: 400, error: "Missing file." };
  }

  const maxBytes = input.maxBytes ?? MEDIA_IMAGE_MAX_BYTES;
  if (input.byteSize > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `Image exceeds ${Math.round(maxBytes / 1024 / 1024)}MB limit.`,
    };
  }

  const mime = (input.mime ?? "").toLowerCase();
  const ext = IMAGE_MIME_TO_EXT[mime];
  if (!ext) {
    return {
      ok: false,
      status: 415,
      error:
        `Unsupported image type "${mime || "unknown"}". Accepted: JPEG, PNG, WebP, GIF.`,
    };
  }

  return { ok: true, mime, ext, byteSize: input.byteSize };
}

export function isSafeMediaUrl(value: string | null | undefined): value is string {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeAltText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
}
