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

import { ascii, sniffImageMime, SNIFF_HEAD_BYTES, EXT_FOR_SNIFFED_MIME, type SniffedImageMime } from "./image-sniff";

export { sniffImageMime, SNIFF_HEAD_BYTES, EXT_FOR_SNIFFED_MIME };
export type { SniffedImageMime };

/** Hard ceiling on decoded pixels for any user-supplied image (100 MP). */
export const MAX_INPUT_PIXELS = 100_000_000;

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
    };

/**
 * Decide an upload from its bytes. Refusals carry a `reason` code; the words
 * (en + es) come from `upload-guard-copy.ts`, never from here. `allowed` is the route's raster set; the
 * returned `mime`/`ext` are what the caller stores, never the client claim.
 */
export function guardImageBytes(
  head: Uint8Array,
  opts: { allowed?: ReadonlyArray<SniffedImageMime> } = {},
): ImageBytesVerdict {
  const allowed = opts.allowed ?? LIBRARY_RASTER_MIMES;
  const mime = sniffImageMime(head);
  if (!mime) {
    return {
      ok: false,
      status: 415,
      reason: looksLikeMarkup(head) ? "markup" : "not_an_image",
    };
  }
  if (!allowed.includes(mime)) {
    return {
      ok: false,
      status: 415,
      reason: "type_not_allowed",
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

/** Cap on a provider-generated image download (OpenAI image URLs). */
export const GENERATED_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Server-action request body ceiling, mirroring `serverActions.bodySizeLimit`
 * ("4mb") in next.config.ts (pinned by upload-hardening-wiring.static.test).
 * A server action receives its FormData already parsed, so the File is fully
 * buffered before any check in this module runs: for server actions THIS is
 * the real upper bound, and per-action caps above it are unreachable.
 * Route handlers get `checkDeclaredLength` + the streaming cap instead.
 */
export const SERVER_ACTION_BODY_LIMIT_BYTES = 4 * 1024 * 1024;

/** A server action's file cap, clamped to what the platform can deliver. */
export function serverActionFileCap(cap: number): number {
  return Math.min(cap, SERVER_ACTION_BODY_LIMIT_BYTES);
}

export type AttachmentKind = "image" | "pdf" | "office" | "video" | "audio" | "archive" | "other";

export type AttachmentVerdict =
  | { ok: true; kind: AttachmentKind; mime: string }
  | { ok: false; status: 415; reason: "executable" | "markup" };

const EXECUTABLE_HEADS: ReadonlyArray<ReadonlyArray<number>> = [
  [0x4d, 0x5a], // MZ: Windows PE / DOS
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0xfe, 0xed, 0xfa, 0xce], [0xfe, 0xed, 0xfa, 0xcf], // Mach-O
  [0xce, 0xfa, 0xed, 0xfe], [0xcf, 0xfa, 0xed, 0xfe],
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O fat / Java class
  [0x23, 0x21], // "#!" script
];

function startsWith(head: Uint8Array, sig: ReadonlyArray<number>): boolean {
  return head.length >= sig.length && sig.every((b, i) => head[i] === b);
}

/**
 * Free-form attachments (inquiry briefs, mood boards, documents): any type may
 * be shared, EXCEPT executables and markup (HTML/SVG/XML is a script vector
 * wherever the file is later opened). The stored content type comes from the
 * bytes, falling back to `application/octet-stream`, never the client claim.
 */
export function guardAttachmentBytes(head: Uint8Array, claimedMime?: string | null): AttachmentVerdict {
  const claimed = (claimedMime ?? "").toLowerCase();
  if (EXECUTABLE_HEADS.some((sig) => startsWith(head, sig))) {
    return { ok: false, status: 415, reason: "executable" };
  }
  if (looksLikeMarkup(head)) return { ok: false, status: 415, reason: "markup" };
  const image = sniffImageMime(head);
  if (image) return { ok: true, kind: "image", mime: image };
  if (ascii(head, 0, 5) === "%PDF-") return { ok: true, kind: "pdf", mime: "application/pdf" };
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0xd0, 0xcf, 0x11, 0xe0])) {
    // OOXML is a zip and legacy .doc/.xls is OLE: the bytes prove the family,
    // the claim may only pick a known office type inside it.
    return { ok: true, kind: "office", mime: OFFICE_MIMES.has(claimed) ? claimed : "application/octet-stream" };
  }
  if (ascii(head, 4, 4) === "ftyp") return { ok: true, kind: "video", mime: "video/mp4" };
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return { ok: true, kind: "video", mime: "video/webm" };
  if (ascii(head, 0, 3) === "ID3" || startsWith(head, [0xff, 0xfb])) {
    return { ok: true, kind: "audio", mime: "audio/mpeg" };
  }
  if (TEXT_MIMES.has(claimed) && !head.includes(0)) return { ok: true, kind: "other", mime: claimed };
  return { ok: true, kind: "other", mime: "application/octet-stream" };
}

const OFFICE_MIMES = new Set([
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const TEXT_MIMES = new Set(["text/plain", "text/csv"]);

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
