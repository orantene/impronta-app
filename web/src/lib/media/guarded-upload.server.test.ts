/**
 * guarded-upload.server.test.ts: the one-call guards every upload entry point
 * now uses (H1 follow-up). Real sharp, no network, no storage.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { createTranslator } from "@/i18n/messages";

import { readGuardedAttachment, readGuardedImage, verifyStoredImage } from "./guarded-upload.server";
import { uploadGuardMessage } from "./upload-guard-copy";
import { guardAttachmentBytes, serverActionFileCap, SERVER_ACTION_BODY_LIMIT_BYTES } from "./upload-guards";

const en = createTranslator("en");
const es = createTranslator("es");

async function gpsJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "21/1 9/1 0/1" } })
    .toBuffer();
}

async function cleanPng(): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png()
    .toBuffer();
}

const asFile = (bytes: Uint8Array, name: string, type: string) => new File([new Uint8Array(bytes)], name, { type });

test("readGuardedImage strips EXIF/GPS from a phone photo", async () => {
  const r = await readGuardedImage(asFile(await gpsJpeg(), "me.jpg", "image/jpeg"), { maxBytes: 1e6, t: en });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.mime, "image/jpeg");
  assert.equal((await sharp(r.bytes).metadata()).exif, undefined);
});

test("readGuardedImage keeps a clean file byte-exact (logos are not re-encoded)", async () => {
  const png = await cleanPng();
  const r = await readGuardedImage(asFile(png, "logo.png", "image/png"), { maxBytes: 1e6, t: en });
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(r.bytes.equals(png));
});

test("readGuardedImage refuses HTML named .jpg, in en and es", async () => {
  const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
  const r = await readGuardedImage(asFile(html, "x.jpg", "image/jpeg"), { maxBytes: 1e6, t: es });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.status, 415);
  assert.equal(r.error, uploadGuardMessage(es, "markup"));
  assert.notEqual(uploadGuardMessage(es, "markup"), uploadGuardMessage(en, "markup"), "es is translated");
});

test("readGuardedImage refuses over the size cap before reading bytes", async () => {
  const r = await readGuardedImage(asFile(await gpsJpeg(), "a.jpg", "image/jpeg"), { maxBytes: 10, t: en });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "too_large");
});

test("every guard code has en and es copy that resolves (no raw keys)", () => {
  for (const code of [
    "not_an_image", "markup", "type_not_allowed", "executable", "too_large", "too_many_pixels", "unreadable", "private_link",
  ] as const) {
    for (const t of [en, es]) {
      const msg = uploadGuardMessage(t, code);
      assert.ok(!msg.startsWith("dashboard."), `${code} resolved to a raw key`);
    }
  }
});

test("attachments: executables and markup refused, documents pass with a byte-derived type", () => {
  const mz = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]);
  assert.deepEqual(guardAttachmentBytes(mz, "application/pdf"), { ok: false, status: 415, reason: "executable" });
  const svg = new TextEncoder().encode("<svg onload=alert(1)>");
  assert.equal(guardAttachmentBytes(svg, "image/png").ok, false);
  const pdf = guardAttachmentBytes(new TextEncoder().encode("%PDF-1.7\n"), "text/html");
  assert.deepEqual(pdf, { ok: true, kind: "pdf", mime: "application/pdf" });
  const csv = guardAttachmentBytes(new TextEncoder().encode("name,email\n"), "text/csv");
  assert.deepEqual(csv, { ok: true, kind: "other", mime: "text/csv" });
  const lyingHtmlType = guardAttachmentBytes(new TextEncoder().encode("plain words"), "text/html");
  assert.equal(lyingHtmlType.ok && lyingHtmlType.mime, "application/octet-stream", "a text/html claim is never stored");
});

test("readGuardedAttachment strips GPS from a photo inside an attachment", async () => {
  const r = await readGuardedAttachment(asFile(await gpsJpeg(), "brief.jpg", "image/jpeg"), { maxBytes: 1e6, t: en });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.kind, "image");
  assert.equal((await sharp(r.bytes).metadata()).exif, undefined);
});

test("verifyStoredImage re-uploads a stripped copy of a browser-direct GPS photo", async () => {
  const original = await gpsJpeg();
  const uploads: Array<{ path: string; bytes: Buffer; upsert: boolean }> = [];
  const fake = {
    storage: {
      from: () => ({
        info: async () => ({ data: { size: original.byteLength }, error: null }),
        download: async () => ({ data: new Blob([new Uint8Array(original)]), error: null }),
        upload: async (path: string, bytes: Buffer, o: { upsert: boolean }) => {
          uploads.push({ path, bytes, upsert: o.upsert });
          return { data: { path }, error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  const r = await verifyStoredImage(fake, "media-public", "t1/gallery/a.jpg", { maxBytes: 1e6, t: en });
  assert.equal(r.ok, true);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0]!.upsert, true);
  assert.equal((await sharp(uploads[0]!.bytes).metadata()).exif, undefined);
});

test("verifyStoredImage refuses by object size before downloading", async () => {
  let downloaded = false;
  const fake = {
    storage: {
      from: () => ({
        info: async () => ({ data: { size: 50 * 1024 * 1024 }, error: null }),
        download: async () => {
          downloaded = true;
          return { data: null, error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  const r = await verifyStoredImage(fake, "media-public", "x.jpg", { maxBytes: 1e6, t: en });
  assert.equal(r.ok, false);
  assert.equal(downloaded, false);
});

test("server-action caps clamp to the 4 MB platform body limit", () => {
  assert.equal(SERVER_ACTION_BODY_LIMIT_BYTES, 4 * 1024 * 1024);
  assert.equal(serverActionFileCap(100 * 1024 * 1024), SERVER_ACTION_BODY_LIMIT_BYTES);
  assert.equal(serverActionFileCap(1024), 1024);
});
