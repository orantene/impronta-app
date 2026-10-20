/**
 * image-sniff.ts: magic-byte image type detection, and nothing else (H1).
 * Split from upload-guards.ts so client code (roster editor pre-checks)
 * pulls only these few hundred bytes into the admin bundle.
 */

/** How many leading bytes the sniffer wants. Enough for an ISO-BMFF ftyp box. */
export const SNIFF_HEAD_BYTES = 64;

export type SniffedImageMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/avif"
  | "image/heic";

export const EXT_FOR_SNIFFED_MIME: Readonly<Record<SniffedImageMime, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
};

export function ascii(head: Uint8Array, start: number, len: number): string {
  if (head.length < start + len) return "";
  let s = "";
  for (let i = start; i < start + len; i += 1) s += String.fromCharCode(head[i]!);
  return s;
}

const AVIF_BRANDS = new Set(["avif", "avis"]);
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/** ISO-BMFF (`....ftyp<brand>`): AVIF or HEIC, decided by the brand list. */
function sniffIsoBmff(head: Uint8Array): SniffedImageMime | null {
  if (ascii(head, 4, 4) !== "ftyp") return null;
  const boxSize =
    ((head[0]! << 24) | (head[1]! << 16) | (head[2]! << 8) | head[3]!) >>> 0;
  const end = Math.min(head.length, boxSize >= 16 ? boxSize : 16);
  const brands: string[] = [ascii(head, 8, 4)];
  // Compatible brands start after major brand (4) + minor version (4).
  for (let off = 16; off + 4 <= end; off += 4) brands.push(ascii(head, off, 4));
  if (brands.some((b) => AVIF_BRANDS.has(b))) return "image/avif";
  if (brands.some((b) => HEIC_BRANDS.has(b))) return "image/heic";
  return null;
}

/**
 * What image these bytes actually are, or null. Pass at least
 * `SNIFF_HEAD_BYTES` leading bytes; the client's claim is never consulted.
 */
export function sniffImageMime(head: Uint8Array): SniffedImageMime | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    head.length >= 8 &&
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
    head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
  ) {
    return "image/png";
  }
  const gif = ascii(head, 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP") return "image/webp";
  return sniffIsoBmff(head);
}

/** Sniffed type of a Blob/File from its first 64 bytes (client-safe). */
export async function sniffImageBlob(blob: Blob): Promise<SniffedImageMime | null> {
  return sniffImageMime(new Uint8Array(await blob.slice(0, SNIFF_HEAD_BYTES).arrayBuffer()));
}
