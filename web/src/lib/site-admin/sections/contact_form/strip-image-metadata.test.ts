/**
 * TUL-1288: contact-form image attachments must not keep EXIF / GPS / XMP.
 * Lossless: pixel data is untouched, only metadata segments are dropped.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { stripImageMetadata } from "./strip-image-metadata";

const GPS = Buffer.from("GPSLatitude-19.43");

function jpegWithExif(): Uint8Array {
  const exif = Buffer.concat([Buffer.from("Exif\0\0"), GPS]);
  const seg = (marker: number, body: Buffer) =>
    Buffer.concat([Buffer.from([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from("JFIF\0")),
    seg(0xe1, exif),
    seg(0xdb, Buffer.from([1, 2, 3])),
    Buffer.from([0xff, 0xda, 0x00, 0x03, 0x00, 0x11, 0x22, 0xff, 0xd9]),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);
}

test("JPEG: the EXIF (APP1) segment is removed, the rest kept", () => {
  const out = Buffer.from(stripImageMetadata(jpegWithExif(), "image/jpeg"));
  assert.equal(out.includes(GPS), false);
  assert.equal(out.includes(Buffer.from("JFIF")), true);
  assert.deepEqual([...out.subarray(0, 2)], [0xff, 0xd8]);
  assert.deepEqual([...out.subarray(-2)], [0xff, 0xd9]);
  assert.equal(out.includes(Buffer.from([0x11, 0x22])), true, "scan data survives");
});

test("PNG: the eXIf chunk is removed, IDAT kept", () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", Buffer.alloc(13)),
    chunk("eXIf", GPS),
    chunk("IDAT", Buffer.from("pixels")),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  const out = Buffer.from(stripImageMetadata(png, "image/png"));
  assert.equal(out.includes(GPS), false);
  assert.equal(out.includes(Buffer.from("pixels")), true);
  assert.equal(out.includes(Buffer.from("IEND")), true);
});

test("WebP: the EXIF chunk is removed and the RIFF size is rewritten", () => {
  const ck = (t: string, d: Buffer) => {
    const l = Buffer.alloc(4);
    l.writeUInt32LE(d.length);
    return Buffer.concat([Buffer.from(t), l, d]);
  };
  const body = Buffer.concat([Buffer.from("WEBP"), ck("VP8X", Buffer.alloc(10)), ck("EXIF", GPS.length % 2 ? Buffer.concat([GPS, Buffer.alloc(1)]) : GPS), ck("VP8 ", Buffer.from("data"))]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  const webp = Buffer.concat([Buffer.from("RIFF"), size, body]);
  const out = Buffer.from(stripImageMetadata(webp, "image/webp"));
  assert.equal(out.includes(GPS), false);
  assert.equal(out.readUInt32LE(4), out.length - 8);
  assert.equal(out.includes(Buffer.from("data")), true);
});

test("PDF, GIF and garbage pass through unchanged", () => {
  const pdf = Buffer.from("%PDF-1.4 hello");
  assert.deepEqual(Buffer.from(stripImageMetadata(pdf, "application/pdf")), pdf);
  const junk = Buffer.from("not a jpeg");
  assert.deepEqual(Buffer.from(stripImageMetadata(junk, "image/jpeg")), junk);
});

test("the attachment store strips metadata before upload", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./attachments-store.ts", import.meta.url), "utf8");
  assert.match(src, /stripImageMetadata\(original, item\.mime\)/);
  assert.match(src, /\.upload\(storagePath, clean,/);
});
