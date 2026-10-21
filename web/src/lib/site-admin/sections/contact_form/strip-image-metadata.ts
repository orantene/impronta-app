/**
 * TUL-1288: drop location and camera metadata from contact-form image
 * attachments before they are stored.
 *
 * Lossless and dependency-free: pixel data is never re-encoded, only the
 * metadata segments are cut (JPEG APP1 EXIF/XMP, APP13 IPTC, COM; PNG eXIf and
 * XMP iTXt; WebP EXIF and XMP chunks). PDF and GIF carry no EXIF and pass
 * through, as does any file that does not parse as its declared type (the
 * magic-byte gate in `attachments.ts` has already vouched for the type).
 */

const JPEG_DROP = new Set([0xe1, 0xed, 0xfe]); // APP1 (EXIF/XMP), APP13 (IPTC), COM

function stripJpeg(b: Uint8Array): Uint8Array | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const out: number[] = [0xff, 0xd8];
  const kept: Uint8Array[] = [];
  let i = 2;
  let keepFrom = 0;
  let sawScan = false;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xda) {
      keepFrom = i;
      sawScan = true;
      break;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return null;
    if (!JPEG_DROP.has(marker)) kept.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  if (!sawScan) return null;
  const total = out.length + kept.reduce((n, k) => n + k.length, 0) + (b.length - keepFrom);
  const res = new Uint8Array(total);
  res.set(out, 0);
  let o = out.length;
  for (const k of kept) {
    res.set(k, o);
    o += k.length;
  }
  res.set(b.subarray(keepFrom), o);
  return res;
}

function ascii(b: Uint8Array, at: number, n: number): string {
  return String.fromCharCode(...b.subarray(at, at + n));
}

function stripPng(b: Uint8Array): Uint8Array | null {
  if (b.length < 8 || b[0] !== 0x89 || ascii(b, 1, 3) !== "PNG") return null;
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = new DataView(b.buffer, b.byteOffset + i, 4).getUint32(0);
    const end = i + 12 + len;
    if (end > b.length) return null;
    const type = ascii(b, i + 4, 4);
    const drop =
      type === "eXIf" || (type === "iTXt" && ascii(b, i + 8, 17) === "XML:com.adobe.xmp");
    if (!drop) parts.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return concat(parts);
}

function stripWebp(b: Uint8Array): Uint8Array | null {
  if (b.length < 12 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const parts: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const len = new DataView(b.buffer, b.byteOffset + i + 4, 4).getUint32(0, true);
    const end = i + 8 + len + (len % 2);
    if (end > b.length + (len % 2)) return null;
    const type = ascii(b, i, 4);
    if (type !== "EXIF" && type !== "XMP ") {
      const piece = b.slice(i, Math.min(end, b.length));
      if (type === "VP8X" && piece.length > 8) piece[8] &= ~(0x08 | 0x04);
      parts.push(piece);
    }
    i = end;
  }
  const body = concat(parts);
  const res = new Uint8Array(12 + body.length);
  res.set(b.subarray(0, 4), 0);
  new DataView(res.buffer).setUint32(4, 4 + body.length, true);
  res.set(b.subarray(8, 12), 8);
  res.set(body, 12);
  return res;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const res = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    res.set(p, o);
    o += p.length;
  }
  return res;
}

/**
 * Strip location and camera metadata. For JPEG, PNG and WebP a file that does not parse as
 * its declared type returns `null`: it is NEVER handed back as the original (fail closed,
 * TUL-1410). PDF and GIF carry no EXIF container and pass through.
 */
export function stripImageMetadata(bytes: Uint8Array, mime: string): Uint8Array | null {
  switch (mime) {
    case "image/jpeg":
      return stripJpeg(bytes);
    case "image/png":
      return stripPng(bytes);
    case "image/webp":
      return stripWebp(bytes);
    default:
      return bytes;
  }
}

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

function stillHasExif(b: Uint8Array): boolean {
  const text = Buffer.from(b);
  return text.includes(Buffer.from("Exif\0\0")) || text.includes(Buffer.from("eXIf")) || text.includes(Buffer.from("http://ns.adobe.com/xap"));
}

/**
 * The bytes that may be STORED for an upload, or null = refuse.
 *  1. Strip the metadata segments (lossless).
 *  2. If the file is unusual or malformed, re-encode it (`reencode`, which drops all
 *     metadata by construction); the re-encoded bytes are checked for leftover EXIF/XMP.
 *  3. If neither works, null. The original image bytes are never returned.
 */
export async function sanitizeImageForStorage(
  bytes: Uint8Array,
  mime: string,
  reencode?: (bytes: Uint8Array, mime: string) => Promise<Uint8Array | null>,
): Promise<Uint8Array | null> {
  if (!IMAGE_MIMES.has(mime)) return bytes;
  const stripped = stripImageMetadata(bytes, mime);
  if (stripped) return stripped;
  if (!reencode) return null;
  try {
    const out = await reencode(bytes, mime);
    if (!out || out.length === 0 || stillHasExif(out)) return null;
    return out;
  } catch {
    return null;
  }
}
