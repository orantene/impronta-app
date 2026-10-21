import "server-only";

import sharp from "sharp";

/**
 * TUL-1410: the fallback for an upload whose metadata cannot be stripped losslessly.
 * sharp decodes and re-encodes the pixels in the same format and, without
 * `withMetadata()`, writes none of the EXIF / GPS / XMP / IPTC. Returns null when the
 * image cannot be decoded (the caller then refuses the upload).
 */
export async function reencodeImageWithoutMetadata(bytes: Uint8Array, mime: string): Promise<Uint8Array | null> {
  try {
    const img = sharp(Buffer.from(bytes), { failOn: "error" }).rotate();
    const out =
      mime === "image/png" ? await img.png().toBuffer()
      : mime === "image/webp" ? await img.webp().toBuffer()
      : await img.jpeg({ quality: 90 }).toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}
