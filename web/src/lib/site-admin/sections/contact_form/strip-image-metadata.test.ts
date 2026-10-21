/**
 * TUL-1288: contact-form image attachments must not keep EXIF / GPS / XMP.
 * Lossless: pixel data is untouched, only metadata segments are dropped.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeImageForStorage, stripImageMetadata } from "./strip-image-metadata";

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
  const out = Buffer.from(stripImageMetadata(jpegWithExif(), "image/jpeg") ?? new Uint8Array(0));
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
  const out = Buffer.from(stripImageMetadata(png, "image/png") ?? new Uint8Array(0));
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
  const out = Buffer.from(stripImageMetadata(webp, "image/webp") ?? new Uint8Array(0));
  assert.equal(out.includes(GPS), false);
  assert.equal(out.readUInt32LE(4), out.length - 8);
  assert.equal(out.includes(Buffer.from("data")), true);
});

test("PDF and GIF pass through unchanged (no EXIF container)", () => {
  const pdf = Buffer.from("%PDF-1.4 hello");
  assert.deepEqual(Buffer.from(stripImageMetadata(pdf, "application/pdf")!), pdf);
  const gif = Buffer.from("GIF89a....");
  assert.deepEqual(Buffer.from(stripImageMetadata(gif, "image/gif")!), gif);
});

// TUL-1410: fail closed. A JPEG/PNG/WebP that cannot be parsed is NEVER returned as the original.
function malformedJpegWithGps(): Uint8Array {
  const exif = Buffer.concat([Buffer.from("Exif\0\0"), GPS]);
  // The APP1 length claims far more bytes than the file holds (truncated upload).
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0x10, 0x00]), exif]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1]);
}

test("a malformed JPEG carrying GPS is not returned as the original", () => {
  assert.equal(stripImageMetadata(malformedJpegWithGps(), "image/jpeg"), null);
  assert.equal(stripImageMetadata(Buffer.from("not a jpeg"), "image/jpeg"), null);
  // Well-formed segments but no scan data: also unparseable.
  const noScan = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x0a]), Buffer.from("Exif\0\0"), GPS.subarray(0, 2)]);
  assert.equal(stripImageMetadata(noScan, "image/jpeg"), null);
});

test("a malformed PNG and WebP are not returned as the original", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", Buffer.alloc(13)), chunk("eXIf", GPS).subarray(0, 12)]);
  assert.equal(stripImageMetadata(png, "image/png"), null);
  assert.equal(stripImageMetadata(Buffer.from("RIFFxxxxWEBPEXIF\xff\xff\xff\xff"), "image/webp"), null);
  assert.equal(stripImageMetadata(Buffer.from("garbage"), "image/png"), null);
});

test("sanitize: a well-formed image is stripped without re-encoding", async () => {
  let called = 0;
  const out = await sanitizeImageForStorage(jpegWithExif(), "image/jpeg", async () => { called += 1; return null; });
  assert.ok(out);
  assert.equal(Buffer.from(out!).includes(GPS), false);
  assert.equal(called, 0);
});

test("sanitize: a malformed image is re-encoded, and only the re-encoded bytes are returned", async () => {
  const clean = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  const out = await sanitizeImageForStorage(malformedJpegWithGps(), "image/jpeg", async () => clean);
  assert.deepEqual(out, clean);
});

test("sanitize: re-encode failure, a throw, or output that still carries EXIF means refuse (null), never the original", async () => {
  const bad = malformedJpegWithGps();
  assert.equal(await sanitizeImageForStorage(bad, "image/jpeg", async () => null), null);
  assert.equal(await sanitizeImageForStorage(bad, "image/jpeg", async () => { throw new Error("sharp could not decode"); }), null);
  assert.equal(await sanitizeImageForStorage(bad, "image/jpeg"), null, "no re-encoder available");
  assert.equal(await sanitizeImageForStorage(bad, "image/jpeg", async () => bad), null, "re-encode that still has the GPS is refused");
});

test("sanitize: non-image types pass through untouched", async () => {
  const pdf = Buffer.from("%PDF-1.4");
  assert.deepEqual(Buffer.from((await sanitizeImageForStorage(pdf, "application/pdf"))!), pdf);
});

test("the attachment store strips metadata before upload", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./attachments-store.ts", import.meta.url), "utf8");
  assert.match(src, /sanitizeImageForStorage\(original, item\.mime/);
  assert.match(src, /if \(!clean\) \{[\s\S]{0,120}rollback\(\)[\s\S]{0,60}return false/);
  assert.match(src, /\.upload\(storagePath, clean,/);
});

test("the real re-encoder (sharp) drops EXIF/GPS and refuses what it cannot decode", async () => {
  const { default: sharp } = await import("sharp");
  const { reencodeImageWithoutMetadata } = await import("./reencode-image");
  const withExif = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#888" } })
    .jpeg()
    .withExif({ IFD0: { Copyright: "GPSSECRET-19.43" } })
    .toBuffer();
  assert.ok(Buffer.from(withExif).includes(Buffer.from("GPSSECRET")), "fixture really carries metadata");
  const out = await reencodeImageWithoutMetadata(withExif, "image/jpeg");
  assert.ok(out);
  assert.equal(Buffer.from(out!).includes(Buffer.from("GPSSECRET")), false);
  assert.equal(await reencodeImageWithoutMetadata(Buffer.from("not an image"), "image/jpeg"), null);
});
