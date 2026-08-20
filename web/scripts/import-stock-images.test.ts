import assert from "node:assert/strict";
import test from "node:test";

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { altTextFor, readImageSize } from "./import-stock-images";

test("PNG dimensions are read from the header, not guessed", () => {
  // Minimal PNG: signature + IHDR length/type + 1600x900.
  const buf = Buffer.alloc(32);
  buf.write("\x89PNG\r\n\x1a\n", 0, "binary");
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(1600, 16);
  buf.writeUInt32BE(900, 20);
  assert.deepEqual(readImageSize(buf), { width: 1600, height: 900 });
});

test("JPEG dimensions are read by walking to the SOF segment", () => {
  // SOI, a APP0 segment to skip, then SOF0 carrying 1200x800.
  const parts: number[] = [0xff, 0xd8];
  parts.push(0xff, 0xe0, 0x00, 0x04, 0x00, 0x00);           // APP0, length 4
  parts.push(0xff, 0xc0, 0x00, 0x11, 0x08);                  // SOF0, length 17, precision
  parts.push(0x03, 0x20);                                    // height 800
  parts.push(0x04, 0xb0);                                    // width 1200
  parts.push(...new Array(10).fill(0));
  assert.deepEqual(readImageSize(Buffer.from(parts)), { width: 1200, height: 800 });
});

test("an unreadable file reports null rather than a made-up size", () => {
  assert.equal(readImageSize(Buffer.from([1, 2, 3, 4])), null);
});

test("alt text prefers a sidecar .txt over the filename", () => {
  const dir = mkdtempSync(join(tmpdir(), "stock-"));
  try {
    writeFileSync(join(dir, "riviera-dusk.jpg"), "x");
    writeFileSync(join(dir, "riviera-dusk.txt"), "Two hosts greeting guests at a beachfront table.\n");
    assert.equal(
      altTextFor(dir, "riviera-dusk.jpg"),
      "Two hosts greeting guests at a beachfront table.",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("without a sidecar the filename is used, NOT an invented description", () => {
  // The alt-text pass removed 33 confident descriptions of scenes that did not
  // exist. An importer that writes "a model at golden hour" because the file is
  // called IMG_2043 would put them straight back.
  const dir = mkdtempSync(join(tmpdir(), "stock-"));
  try {
    writeFileSync(join(dir, "event_hosts_welcome.jpg"), "x");
    assert.equal(altTextFor(dir, "event_hosts_welcome.jpg"), "event hosts welcome");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an empty sidecar falls back to the filename", () => {
  const dir = mkdtempSync(join(tmpdir(), "stock-"));
  try {
    writeFileSync(join(dir, "a-b.jpg"), "x");
    writeFileSync(join(dir, "a-b.txt"), "   \n");
    assert.equal(altTextFor(dir, "a-b.jpg"), "a b");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
