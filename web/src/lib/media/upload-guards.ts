/**
 * upload-guards.ts: the byte-level checks every upload and import runs BEFORE
 * it trusts, decodes or stores anything (H1, Wave H hardening).
 *
 * DEPENDENCY-FREE ON PURPOSE (no sharp, no server-only, no node:*), so the
 * multipart routes, the server actions and the URL importers can all share it
 * and a plain `tsx --test` can exercise it.
 *
 * Four rules live here:
 *   1. SIZE BEFORE BYTES. A declared `Content-Length` over the cap is refused
 *      without reading the body, and a body is read through a streaming byte
 *      cap that stops (and cancels the stream) the moment it passes the cap.
 *      `await res.arrayBuffer()` followed by a length check is NOT a cap: the
 *      whole payload is already in memory by then.
 *   2. PIXELS BEFORE DECODE. `MAX_INPUT_PIXELS` is the one ceiling handed to
 *      sharp's `limitInputPixels` (see image-sanitize.server.ts) and checked
 *      against header dimensions, so a 2 KB PNG that claims 100k x 100k never
 *      reaches a full decode.
 *   3. MAGIC BYTES, NOT CLAIMS. A client `File.type`, a server `Content-Type`
 *      and a file extension are all claims. `sniffImageMime` reads the leading
 *      bytes and is the only answer the upload paths act on. SVG is never an
 *      accepted raster: it is a scriptable document and only enters storage
 *      through the brand-mark sanitizer (`site-admin/sanitize-svg.ts`).
 *   4. NO FALSE POSITIVES ON SHORT INPUT. Anything too short to carry a full
 *      signature fails, which is the safe direction.
 */

/** Hard ceiling on decoded pixels for any user-supplied image (100 MP). */
export const MAX_INPUT_PIXELS = 100_000_000;

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

/**
 * Every raster the photo pipeline accepts (matches media-metadata's
 * ALLOWED_IMAGE_MIMES): AVIF/HEIC are re-encoded by the resize step.
 */
export const PHOTO_RASTER_MIMES: ReadonlyArray<SniffedImageMime> = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
];

/** The raster set the media library stores (matches IMAGE_MIME_TO_EXT). */
export const LIBRARY_RASTER_MIMES: ReadonlyArray<SniffedImageMime> = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

function ascii(head: Uint8Array, start: number, len: number): string {
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

/** True when the leading bytes read like markup (HTML, XML, SVG). */
export function looksLikeMarkup(head: Uint8Array): boolean {
  let i = 0;
  // Skip a UTF-8 BOM and leading whitespace.
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) i = 3;
  while (i < head.length && (head[i] === 0x20 || head[i] === 0x09 || head[i] === 0x0a || head[i] === 0x0d)) {
    i += 1;
  }
  return head[i] === 0x3c; // "<"
}

export type ImageBytesVerdict =
  | { ok: true; mime: SniffedImageMime; ext: string }
  | {
      ok: false;
      status: 415;
      reason: "not_an_image" | "markup" | "type_not_allowed";
      error: string;
    };

/**
 * Decide an upload from its bytes. `allowed` is the route's raster set; the
 * returned `mime`/`ext` are what the caller stores, never the client claim.
 */
export function guardImageBytes(
  head: Uint8Array,
  opts: { allowed?: ReadonlyArray<SniffedImageMime> } = {},
): ImageBytesVerdict {
  const allowed = opts.allowed ?? LIBRARY_RASTER_MIMES;
  const label = allowed.map((m) => EXT_FOR_SNIFFED_MIME[m].toUpperCase()).join(", ");
  const mime = sniffImageMime(head);
  if (!mime) {
    return {
      ok: false,
      status: 415,
      reason: looksLikeMarkup(head) ? "markup" : "not_an_image",
      error: `This file is not a supported image. Accepted: ${label}.`,
    };
  }
  if (!allowed.includes(mime)) {
    return {
      ok: false,
      status: 415,
      reason: "type_not_allowed",
      error: `Unsupported image type. Accepted: ${label}.`,
    };
  }
  return { ok: true, mime, ext: EXT_FOR_SNIFFED_MIME[mime] };
}

/** `guardImageBytes` over the first bytes of a Blob/File (reads 64 bytes only). */
export async function guardImageBlob(
  blob: Blob,
  opts: { allowed?: ReadonlyArray<SniffedImageMime> } = {},
): Promise<ImageBytesVerdict> {
  const head = new Uint8Array(await blob.slice(0, SNIFF_HEAD_BYTES).arrayBuffer());
  return guardImageBytes(head, opts);
}

/** True while `width x height` stays inside the decode budget. */
export function withinPixelBudget(
  width: number | null | undefined,
  height: number | null | undefined,
  maxPixels: number = MAX_INPUT_PIXELS,
): boolean {
  if (typeof width !== "number" || typeof height !== "number") return true;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  return width * height <= maxPixels;
}

export type DeclaredLengthVerdict =
  | { ok: true; declared: number | null }
  | { ok: false; declared: number };

/**
 * Refuse on a declared length over the cap, before a single body byte is
 * read. A missing or unparseable header passes: the streaming cap is the
 * authority, this is only the cheap early exit.
 */
export function checkDeclaredLength(
  header: string | null | undefined,
  maxBytes: number,
): DeclaredLengthVerdict {
  if (header == null || header.trim() === "") return { ok: true, declared: null };
  const n = Number(header.trim());
  if (!Number.isFinite(n) || n < 0) return { ok: true, declared: null };
  if (n > maxBytes) return { ok: false, declared: n };
  return { ok: true, declared: n };
}

export type CappedRead =
  | { ok: true; bytes: Uint8Array; truncated?: boolean }
  | { ok: false; reason: "too_large"; readBytes: number };

/**
 * Read a byte stream, stopping and cancelling it once it passes `maxBytes`.
 * Never holds more than `maxBytes` plus one chunk. With `truncate`, the
 * first `maxBytes` are returned instead of a refusal (a page scraper only
 * needs the <head>; an image must never be truncated, so that is opt-in).
 */
export async function readStreamCapped(
  body: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array> | null | undefined,
  maxBytes: number,
  opts: { truncate?: boolean } = {},
): Promise<CappedRead> {
  if (!body) return { ok: true, bytes: new Uint8Array(0) };
  const chunks: Uint8Array[] = [];
  let total = 0;
  const overflow = (): CappedRead => {
    if (!opts.truncate) return { ok: false, reason: "too_large", readBytes: total };
    return { ok: true, bytes: concat(chunks, maxBytes), truncated: true };
  };

  const isWebStream = typeof (body as ReadableStream<Uint8Array>).getReader === "function";
  if (isWebStream) {
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        chunks.push(value);
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          return overflow();
        }
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    const iterator = (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
    for (;;) {
      const { done, value } = await iterator.next();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      chunks.push(value);
      if (total > maxBytes) {
        await iterator.return?.();
        return overflow();
      }
    }
  }

  return { ok: true, bytes: concat(chunks, total) };
}

function concat(chunks: Uint8Array[], limit: number): Uint8Array {
  const size = Math.min(limit, chunks.reduce((n, c) => n + c.byteLength, 0));
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    if (offset >= size) break;
    const take = Math.min(c.byteLength, size - offset);
    out.set(take === c.byteLength ? c : c.subarray(0, take), offset);
    offset += take;
  }
  return out;
}

/**
 * Content-Length pre-check, then the streaming cap, for a fetch `Response`.
 * Drop-in for `await res.arrayBuffer()` on any untrusted download.
 */
export async function readResponseCapped(res: Response, maxBytes: number): Promise<CappedRead> {
  const declared = checkDeclaredLength(res.headers.get("content-length"), maxBytes);
  if (!declared.ok) {
    await res.body?.cancel().catch(() => undefined);
    return { ok: false, reason: "too_large", readBytes: 0 };
  }
  return readStreamCapped(res.body, maxBytes);
}
