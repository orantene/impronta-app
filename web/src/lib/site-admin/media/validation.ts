export const MEDIA_PUBLIC_BUCKET = "media-public";
export const MEDIA_LIBRARY_MAX_ITEMS = 60;
export const MEDIA_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

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
