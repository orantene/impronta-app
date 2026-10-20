/**
 * image-sanitize.server.test.ts: talent photos must not leak where they were
 * taken, and a decompression bomb must die at the header (H1).
 *
 * Builds a real JPEG carrying EXIF GPS with sharp, then proves every path that
 * stores user photos drops it: the shared resize (`resizeUploadForStorage`)
 * and the no-resize strip (`stripImageMetadata`).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";

import sharp from "sharp";

import { resizeUploadForStorage } from "@/lib/server/media-resize";

import {
  ImagePixelLimitError,
  hasEmbeddedMetadata,
  readImageHeader,
  stripImageMetadata,
} from "./image-sanitize.server";

/** GPS IFD pointer tag 0x8825, little-endian as sharp writes it. */
const GPS_TAG_LE = Buffer.from([0x25, 0x88]);

async function jpegWithGps(width = 32, height = 16): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: "TestPhone" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "21/1 9/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "86/1 51/1 0/1",
      },
    })
    .toBuffer();
}

function crc32(bytes: Buffer): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function pngHeaderOnly(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.alloc(1))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

test("fixture sanity: the test JPEG really carries EXIF GPS", async () => {
  const src = await jpegWithGps();
  const meta = await sharp(src).metadata();
  assert.ok(meta.exif, "fixture must have EXIF");
  assert.ok(meta.exif!.includes(GPS_TAG_LE), "fixture must have the GPS IFD");
  assert.equal(await hasEmbeddedMetadata(src), true);
});

test("stripImageMetadata removes EXIF GPS and bakes the orientation in", async () => {
  const out = await stripImageMetadata(await jpegWithGps(32, 16));
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "jpeg", "same format back");
  assert.equal(meta.exif, undefined, "no EXIF, so no GPS");
  assert.equal(meta.xmp, undefined);
  assert.equal(meta.iptc, undefined);
  // Orientation 6 = rotate 90: a 32x16 source becomes 16x32 pixels.
  assert.equal(meta.width, 16);
  assert.equal(meta.height, 32);
  assert.equal(await hasEmbeddedMetadata(out), false);
});

test("resizeUploadForStorage (every upload route) stores no GPS", async () => {
  const resized = await resizeUploadForStorage(await jpegWithGps(), "gallery");
  const meta = await sharp(resized.buffer).metadata();
  assert.equal(meta.exif, undefined, "no EXIF block, so no GPS IFD");
  assert.equal(meta.xmp, undefined);
});

test("pixel cap: an over-budget image is refused at the header read", async () => {
  // A ~70-byte PNG whose header claims 12000 x 9000 = 108 MP. Nothing is ever
  // decoded: the cap must fire on the header alone.
  const bomb = pngHeaderOnly(12_000, 9_000);
  await assert.rejects(readImageHeader(bomb), (err: Error) =>
    err instanceof ImagePixelLimitError || /pixel limit/i.test(err.message),
  );
  await assert.rejects(resizeUploadForStorage(bomb, "gallery"), /pixel limit/i);
  await assert.rejects(stripImageMetadata(bomb), /pixel limit/i);
});
