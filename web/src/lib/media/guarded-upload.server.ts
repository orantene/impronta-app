/**
 * guarded-upload.server.ts: one call per upload entry point (H1 follow-up).
 *
 * Every server action / route that takes a user File should go through one of
 * these two instead of `file.type` + `file.arrayBuffer()` + `storage.upload`:
 *
 *   readGuardedImage(file, { maxBytes })
 *     size cap, magic-byte type (never the client claim), 100 MP pixel cap at
 *     the header, and EXIF/XMP/IPTC (GPS) stripped from the bytes it returns.
 *     A clean file comes back byte-identical (logos stay exact).
 *
 *   readGuardedAttachment(file, { maxBytes })
 *     size cap, executables and markup (HTML/SVG/XML) refused, stored content
 *     type from the bytes, and images inside attachments stripped of GPS too.
 *
 * Refusals carry a stable `code` and an `error` already localized (en/es) for
 * the current request, so callers return `{ ok: false, error }` unchanged.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createTranslator } from "@/i18n/messages";

import { ImagePixelLimitError, readImageHeader, stripImageMetadata } from "./image-sanitize.server";
import { uploadGuardMessage, type UploadGuardCode } from "./upload-guard-copy";
import {
  LIBRARY_RASTER_MIMES,
  SNIFF_HEAD_BYTES,
  guardAttachmentBytes,
  guardImageBytes,
  type AttachmentKind,
  type SniffedImageMime,
} from "./upload-guards";

export type GuardRefusal = { ok: false; code: UploadGuardCode; status: 400 | 413 | 415; error: string };

type Translate = (key: string) => string;

/** Translator for the current request; tests and callers may inject one. */
async function requestTranslator(t?: Translate): Promise<Translate> {
  if (t) return t;
  try {
    const { getRequestLocale } = await import("@/i18n/request-locale");
    return createTranslator(await getRequestLocale());
  } catch {
    return createTranslator("en");
  }
}

async function refuse(code: UploadGuardCode, status: GuardRefusal["status"], t?: Translate): Promise<GuardRefusal> {
  return { ok: false, code, status, error: uploadGuardMessage(await requestTranslator(t), code) };
}

/** Strip location metadata only when present; a clean file stays byte-exact. */
async function cleanImage(bytes: Buffer): Promise<Buffer> {
  const meta = await readImageHeader(bytes); // pixel cap + decodability
  if (!(meta.exif || meta.xmp || meta.iptc)) return bytes;
  return stripImageMetadata(bytes);
}

export type GuardedImage =
  | { ok: true; bytes: Buffer; mime: SniffedImageMime; ext: string; byteSize: number }
  | GuardRefusal;

export async function readGuardedImage(
  file: Blob,
  opts: { maxBytes: number; allowed?: ReadonlyArray<SniffedImageMime>; t?: Translate },
): Promise<GuardedImage> {
  if (file.size <= 0) return refuse("not_an_image", 400, opts.t);
  if (file.size > opts.maxBytes) return refuse("too_large", 413, opts.t);
  const head = new Uint8Array(await file.slice(0, SNIFF_HEAD_BYTES).arrayBuffer());
  const verdict = guardImageBytes(head, { allowed: opts.allowed ?? LIBRARY_RASTER_MIMES });
  if (!verdict.ok) return refuse(verdict.reason, 415, opts.t);
  let bytes: Buffer;
  try {
    bytes = await cleanImage(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    const pixels = err instanceof ImagePixelLimitError || /pixel limit/i.test(String(err));
    return refuse(pixels ? "too_many_pixels" : "unreadable", pixels ? 413 : 400, opts.t);
  }
  return { ok: true, bytes, mime: verdict.mime, ext: verdict.ext, byteSize: bytes.byteLength };
}

export type GuardedAttachment =
  | { ok: true; bytes: Buffer; contentType: string; kind: AttachmentKind; byteSize: number }
  | GuardRefusal;

export async function readGuardedAttachment(
  file: Blob,
  opts: { maxBytes: number; t?: Translate },
): Promise<GuardedAttachment> {
  if (file.size <= 0) return refuse("unreadable", 400, opts.t);
  if (file.size > opts.maxBytes) return refuse("too_large", 413, opts.t);
  const head = new Uint8Array(await file.slice(0, SNIFF_HEAD_BYTES).arrayBuffer());
  const verdict = guardAttachmentBytes(head, file.type);
  if (!verdict.ok) return refuse(verdict.reason, 415, opts.t);
  let bytes = Buffer.from(await file.arrayBuffer());
  if (verdict.kind === "image") {
    try {
      bytes = await cleanImage(bytes);
    } catch (err) {
      const pixels = err instanceof ImagePixelLimitError || /pixel limit/i.test(String(err));
      return refuse(pixels ? "too_many_pixels" : "unreadable", pixels ? 413 : 400, opts.t);
    }
  }
  return { ok: true, bytes, contentType: verdict.mime, kind: verdict.kind, byteSize: bytes.byteLength };
}

/** Localized message for a code, for callers that refuse on their own path. */
export async function uploadGuardError(code: UploadGuardCode, t?: Translate): Promise<string> {
  return uploadGuardMessage(await requestTranslator(t), code);
}

/**
 * For browser-direct uploads (the bytes reached storage without passing the
 * server): size from object info BEFORE download, magic-byte type, pixel cap,
 * and an in-place re-upload of the stripped copy when the object carries
 * EXIF/XMP/IPTC. Never deletes: the caller decides what a refusal means.
 */
export async function verifyStoredImage(
  admin: SupabaseClient,
  bucket: string,
  path: string,
  opts: { maxBytes: number; allowed?: ReadonlyArray<SniffedImageMime>; t?: Translate },
): Promise<{ ok: true; mime: SniffedImageMime; byteSize: number } | GuardRefusal> {
  const store = admin.storage.from(bucket);
  // On an info error the post-download size check below stays the authority.
  const { data: info, error: infoErr } = await store.info(path);
  if (!infoErr && typeof info?.size === "number" && info.size > opts.maxBytes) {
    return refuse("too_large", 413, opts.t);
  }
  const { data: blob, error } = await store.download(path);
  if (error || !blob) return refuse("unreadable", 400, opts.t);
  if (blob.size > opts.maxBytes) return refuse("too_large", 413, opts.t);
  const original = Buffer.from(await blob.arrayBuffer());
  const verdict = guardImageBytes(original.subarray(0, SNIFF_HEAD_BYTES), {
    allowed: opts.allowed ?? LIBRARY_RASTER_MIMES,
  });
  if (!verdict.ok) return refuse(verdict.reason, 415, opts.t);
  let clean: Buffer;
  try {
    clean = await cleanImage(original);
  } catch (err) {
    const pixels = err instanceof ImagePixelLimitError || /pixel limit/i.test(String(err));
    return refuse(pixels ? "too_many_pixels" : "unreadable", pixels ? 413 : 400, opts.t);
  }
  if (clean !== original) {
    const { error: upErr } = await store.upload(path, clean, { contentType: verdict.mime, upsert: true });
    if (upErr) return refuse("unreadable", 400, opts.t);
  }
  return { ok: true, mime: verdict.mime, byteSize: clean.byteLength };
}
