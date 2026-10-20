/**
 * upload-guards.test.ts: size before bytes, pixels before decode, magic bytes
 * before claims (H1). Pure: no sharp, no network.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_INPUT_PIXELS,
  checkDeclaredLength,
  guardImageBlob,
  guardImageBytes,
  readResponseCapped,
  readStreamCapped,
  sniffImageMime,
  withinPixelBudget,
} from "./upload-guards";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const GIF = new TextEncoder().encode("GIF89a\x01\x00\x01\x00");
const WEBP = new TextEncoder().encode("RIFF\x24\x00\x00\x00WEBPVP8 ");
const HTML = new TextEncoder().encode("<!doctype html><html><body>not a photo</body></html>");
const SVG = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);

function ftyp(major: string, compat: string[] = []): Uint8Array {
  const size = 16 + compat.length * 4;
  const out = new Uint8Array(size);
  out.set([0, 0, 0, size], 0);
  out.set(new TextEncoder().encode("ftyp" + major + "\0\0\0\0" + compat.join("")), 4);
  return out;
}

test("sniffs every raster the app supports from bytes alone", () => {
  assert.equal(sniffImageMime(JPEG), "image/jpeg");
  assert.equal(sniffImageMime(PNG), "image/png");
  assert.equal(sniffImageMime(GIF), "image/gif");
  assert.equal(sniffImageMime(WEBP), "image/webp");
  assert.equal(sniffImageMime(ftyp("avif", ["mif1", "miaf"])), "image/avif");
  assert.equal(sniffImageMime(ftyp("mif1", ["avif"])), "image/avif");
  assert.equal(sniffImageMime(ftyp("heic", ["mif1"])), "image/heic");
  assert.equal(sniffImageMime(ftyp("isom", ["mp41"])), null, "an MP4 is not an image");
});

test("a .jpg that is really HTML, SVG or an EXE is refused, whatever it claims", () => {
  for (const [name, bytes] of [["html", HTML], ["svg", SVG], ["exe", EXE]] as const) {
    const verdict = guardImageBytes(bytes);
    assert.equal(verdict.ok, false, `${name} must be refused`);
    if (!verdict.ok) assert.equal(verdict.status, 415);
  }
  const svg = guardImageBytes(SVG);
  assert.equal(!svg.ok && svg.reason, "markup", "SVG is never a raster; only the sanitizer path takes it");
});

test("a spoofed Content-Type cannot change the answer: the bytes decide", async () => {
  const lyingHtml = new File([HTML], "photo.jpg", { type: "image/jpeg" });
  const refused = await guardImageBlob(lyingHtml);
  assert.equal(refused.ok, false);

  const pngClaimingJpeg = new File([PNG], "photo.jpg", { type: "image/jpeg" });
  const accepted = await guardImageBlob(pngClaimingJpeg);
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.equal(accepted.mime, "image/png", "stored type follows the bytes, not the claim");
    assert.equal(accepted.ext, "png");
  }
});

test("a real image outside the route's allow-list is refused", () => {
  const v = guardImageBytes(ftyp("heic"), { allowed: ["image/jpeg", "image/png"] });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, "type_not_allowed");
});

test("short input never matches a signature", () => {
  assert.equal(sniffImageMime(new Uint8Array([0xff, 0xd8])), null);
  assert.equal(sniffImageMime(new Uint8Array(0)), null);
});

test("pixel cap: 100 MP passes, one row more fails, missing dims defer to sharp", () => {
  assert.equal(MAX_INPUT_PIXELS, 100_000_000);
  assert.equal(withinPixelBudget(10_000, 10_000), true);
  assert.equal(withinPixelBudget(10_000, 10_001), false);
  assert.equal(withinPixelBudget(100_000, 100_000), false);
  assert.equal(withinPixelBudget(undefined, undefined), true);
});

test("size cap by Content-Length: over refuses, missing or junk defers to the stream", () => {
  assert.deepEqual(checkDeclaredLength("9000000", 8_000_000), { ok: false, declared: 9_000_000 });
  assert.deepEqual(checkDeclaredLength("100", 8_000_000), { ok: true, declared: 100 });
  assert.deepEqual(checkDeclaredLength(null, 8_000_000), { ok: true, declared: null });
  assert.deepEqual(checkDeclaredLength("abc", 8_000_000), { ok: true, declared: null });
});

test("size cap by streamed bytes: stops reading and cancels past the cap", async () => {
  let pulled = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += 1;
      controller.enqueue(new Uint8Array(1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  const read = await readStreamCapped(stream, 4096);
  assert.equal(read.ok, false);
  assert.ok(pulled <= 6, `read stopped near the cap (pulled ${pulled})`);
  assert.equal(cancelled, true, "the upstream is cancelled, not drained");
});

test("readResponseCapped refuses a lying-small Content-Length by bytes, a big one by header", async () => {
  const big = new Response(new Uint8Array(10), { headers: { "content-length": "99999999" } });
  const byHeader = await readResponseCapped(big, 1024);
  assert.equal(byHeader.ok, false);

  const under = new Response(new Uint8Array(4096));
  const byBytes = await readResponseCapped(under, 1024);
  assert.equal(byBytes.ok, false);

  const fine = await readResponseCapped(new Response(new Uint8Array(512)), 1024);
  assert.equal(fine.ok, true);
  if (fine.ok) assert.equal(fine.bytes.byteLength, 512);
});

test("client pre-check (image-sniff.ts) reads the bytes, not the File's claim", async () => {
  const { sniffImageBlob } = await import("./image-sniff");
  assert.equal(await sniffImageBlob(new File([HTML], "a.jpg", { type: "image/jpeg" })), null);
  assert.equal(await sniffImageBlob(new File([PNG], "a.jpg", { type: "image/jpeg" })), "image/png");
});
