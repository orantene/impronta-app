/**
 * media-upload-engine.test.ts — the semantics the Media page's upload engine
 * only ever had by hand-verification, now pinned so the shared hook cannot
 * regress them for every surface at once.
 *
 * The four that matter, and the failure each one prevents:
 *  1. Pool never exceeds its concurrency  → a 200-photo drop opening 200
 *     simultaneous PUTs and getting throttled into a wall of errors.
 *  2. One worker's failure does not abort its siblings → "I dropped 30 photos
 *     and 4 arrived", the classic serial-loop bug.
 *  3. The batch promise resolves only after the LAST worker settles → the
 *     assign modal committing a staging list that is still filling in.
 *  4. Prepare rules (SVG refusal, zip cap, zip size, batch cap) survive the
 *     move out of the 3,000-line page they were buried in.
 *
 * Run: node_modules/.bin/tsx --test src/lib/media/media-upload-engine.test.ts
 * Lane: `npm run test:media-ownership`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyUploadKind,
  createUploadItems,
  isAllowedRasterImage,
  isSvgFile,
  MAX_BATCH_FILES,
  patchUploadItem,
  prepareUploadFiles,
  revokeUploadItemUrls,
  runUploadPool,
  summarizeUploadItems,
  ZIP_IMAGE_CAP,
  ZIP_MAX_BYTES,
  type MediaUploadItem,
  type NoUploadExtra,
  type ZipLoader,
} from "./media-upload-engine";

// ── helpers ─────────────────────────────────────────────────────────────

function file(name: string, type = "image/jpeg", size = 1024): File {
  const f = new File([new Uint8Array(1)], name, { type });
  // `new File` derives size from its parts; tests that care about the size
  // gate override it rather than allocating half a gigabyte of zeroes.
  Object.defineProperty(f, "size", { value: size });
  return f;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Deterministic item factory — no Math.random, no URL.createObjectURL
 *  (neither exists usefully under `node --test`). */
function items(n: number) {
  return createUploadItems(
    Array.from({ length: n }, (_, i) => file(`p${i}.jpg`)),
    () => ({}) as NoUploadExtra,
    (i) => `id-${i}`,
    (f) => `blob:${f.name}`,
  );
}

// ── 1. concurrency ──────────────────────────────────────────────────────

test("runUploadPool never exceeds its concurrency at any instant", async () => {
  let active = 0;
  let peak = 0;
  const order: string[] = [];
  await runUploadPool(
    items(20),
    async (it) => {
      active += 1;
      peak = Math.max(peak, active);
      await tick();
      order.push(it.id);
      active -= 1;
    },
    4,
  );
  assert.equal(peak, 4, `peak in-flight was ${peak}, expected exactly 4`);
  assert.equal(order.length, 20, "every item ran");
  assert.equal(new Set(order).size, 20, "no item ran twice");
});

test("runUploadPool with concurrency 1 is a serial loop, in order", async () => {
  const seen: string[] = [];
  await runUploadPool(
    items(5),
    async (it) => {
      await tick();
      seen.push(it.id);
    },
    1,
  );
  assert.deepEqual(seen, ["id-0", "id-1", "id-2", "id-3", "id-4"]);
});

test("runUploadPool clamps a nonsense concurrency to at least 1", async () => {
  let ran = 0;
  await runUploadPool(items(3), async () => { ran += 1; }, 0);
  assert.equal(ran, 3);
});

// ── 2. failure isolation ────────────────────────────────────────────────

test("runUploadPool: a rejecting worker does NOT abort its siblings", async () => {
  const done: string[] = [];
  await runUploadPool(
    items(10),
    async (it) => {
      await tick();
      if (it.id === "id-3" || it.id === "id-7") throw new Error("boom");
      done.push(it.id);
    },
    4,
  );
  assert.equal(done.length, 8, "the eight healthy files still uploaded");
  assert.ok(!done.includes("id-3") && !done.includes("id-7"));
});

test("runUploadPool: an all-failing batch still resolves", async () => {
  await runUploadPool(items(6), async () => { throw new Error("nope"); }, 3);
  // Reaching this line IS the assertion — a hang or a rejection fails the test.
  assert.ok(true);
});

// ── 3. resolution timing ────────────────────────────────────────────────

test("runUploadPool resolves only after the LAST worker settles", async () => {
  let finished = 0;
  // A long tail: the final item takes far longer than the queue drains.
  await runUploadPool(
    items(6),
    async (it) => {
      await new Promise((r) => setTimeout(r, it.id === "id-5" ? 30 : 1));
      finished += 1;
    },
    4,
  );
  assert.equal(finished, 6, "pool resolved before the slow tail finished");
});

test("runUploadPool resolves immediately on an empty list", async () => {
  let ran = 0;
  await runUploadPool<MediaUploadItem>([], async () => { ran += 1; }, 4);
  assert.equal(ran, 0);
});

// ── 4. prepare rules ────────────────────────────────────────────────────

test("prepareUploadFiles refuses SVG once, with a count, and keeps the rest", async () => {
  const res = await prepareUploadFiles([
    file("a.jpg"),
    file("logo.svg", "image/svg+xml"),
    file("mark.SVG", ""),
    file("b.png", "image/png"),
  ]);
  assert.deepEqual(res.rejections, [{ code: "svg_skipped", count: 2 }]);
  assert.deepEqual(res.files.map((f) => f.name), ["a.jpg", "b.png"]);
  assert.equal(res.aborted, false, "SVGs are skipped, not fatal");
});

test("prepareUploadFiles drops non-images from an image-only surface AND names them", async () => {
  // This test used to assert `rejections: []` — the drop was silent by design,
  // for the case of a dropped shoot folder carrying a stray notes.txt. That
  // same silence is what let the builder's asset library swallow a hero video
  // whole: no bytes, no error, nothing to debug from. The photo still uploads;
  // the operator now also learns which file did not.
  const res = await prepareUploadFiles([file("notes.txt", "text/plain"), file("a.jpg")]);
  assert.deepEqual(res.files.map((f) => f.name), ["a.jpg"]);
  assert.deepEqual(res.rejections, [{ code: "unsupported_kind", names: ["notes.txt"] }]);
  assert.equal(res.aborted, false, "a stray file must never abort the batch");
});

test("prepareUploadFiles: zips are ignored entirely unless allowZip", async () => {
  const res = await prepareUploadFiles([file("pack.zip", "application/zip"), file("a.jpg")]);
  assert.deepEqual(res.files.map((f) => f.name), ["a.jpg"]);
  assert.equal(res.aborted, false);
});

test("prepareUploadFiles: an over-cap zip yields ZIP_IMAGE_CAP images and reports truncation", async () => {
  const loadZip: ZipLoader = async () => ({
    files: Object.fromEntries(
      Array.from({ length: ZIP_IMAGE_CAP + 25 }, (_, i) => [
        `shoot/img${i}.jpg`,
        { dir: false, async: async () => new Blob([new Uint8Array(1)]) },
      ]),
    ),
  });
  const res = await prepareUploadFiles([file("pack.zip", "application/zip")], {
    allowZip: true,
    loadZip,
  });
  assert.equal(res.files.length, ZIP_IMAGE_CAP);
  assert.deepEqual(res.rejections, [{ code: "zip_truncated", cap: ZIP_IMAGE_CAP }]);
  assert.equal(res.aborted, false, "truncation is a notice — the first 100 still upload");
  assert.equal(res.files[0]!.name, "img0.jpg", "path prefix is stripped from the entry name");
});

test("prepareUploadFiles: zip entries that are directories or non-images are skipped", async () => {
  const loadZip: ZipLoader = async () => ({
    files: {
      "shoot/": { dir: true, async: async () => new Blob() },
      "shoot/a.jpg": { dir: false, async: async () => new Blob([new Uint8Array(1)]) },
      "shoot/logo.svg": { dir: false, async: async () => new Blob([new Uint8Array(1)]) },
      "shoot/readme.txt": { dir: false, async: async () => new Blob([new Uint8Array(1)]) },
      "shoot/b.png": { dir: false, async: async () => new Blob([new Uint8Array(1)]) },
    },
  });
  const res = await prepareUploadFiles([file("pack.zip", "application/zip")], {
    allowZip: true,
    loadZip,
  });
  assert.deepEqual(res.files.map((f) => f.name), ["a.jpg", "b.png"]);
  assert.equal(res.files[1]!.type, "image/png", "extension drives the synthesized MIME");
});

test("prepareUploadFiles: a zip over the size cap aborts the whole batch", async () => {
  const res = await prepareUploadFiles(
    [file("huge.zip", "application/zip", ZIP_MAX_BYTES + 1), file("a.jpg")],
    { allowZip: true, loadZip: async () => ({ files: {} }) },
  );
  assert.equal(res.aborted, true);
  assert.deepEqual(res.files, []);
  assert.deepEqual(res.rejections, [{ code: "zip_too_large" }]);
});

test("prepareUploadFiles: an unreadable zip aborts rather than uploading a partial batch", async () => {
  const res = await prepareUploadFiles([file("bad.zip", "application/zip")], {
    allowZip: true,
    loadZip: async () => { throw new Error("corrupt central directory"); },
  });
  assert.equal(res.aborted, true);
  assert.deepEqual(res.rejections, [{ code: "zip_unreadable" }]);
});

test("prepareUploadFiles: over the batch cap aborts", async () => {
  const many = Array.from({ length: MAX_BATCH_FILES + 1 }, (_, i) => file(`p${i}.jpg`));
  const res = await prepareUploadFiles(many);
  assert.equal(res.aborted, true);
  assert.deepEqual(res.rejections, [{ code: "batch_too_large", max: MAX_BATCH_FILES }]);
});

test("prepareUploadFiles: exactly at the batch cap is allowed", async () => {
  const many = Array.from({ length: MAX_BATCH_FILES }, (_, i) => file(`p${i}.jpg`));
  const res = await prepareUploadFiles(many);
  assert.equal(res.aborted, false);
  assert.equal(res.files.length, MAX_BATCH_FILES);
});

// ── staging model ───────────────────────────────────────────────────────

test("createUploadItems stages every file as queued at zero bytes", () => {
  const staged = items(3);
  assert.equal(staged.length, 3);
  for (const it of staged) {
    assert.equal(it.status, "queued");
    assert.equal(it.bytesSent, 0);
    assert.equal(it.bytesTotal, null);
    assert.equal(it.errorMsg, undefined);
  }
  assert.equal(new Set(staged.map((i) => i.id)).size, 3, "ids are unique");
});

test("createUploadItems carries surface-owned extra state on the item", () => {
  const staged = createUploadItems(
    [file("a.jpg"), file("b.jpg")],
    () => ({ talentId: "t-1" }),
    (i) => `id-${i}`,
    () => "blob:x",
  );
  assert.equal(staged[0]!.talentId, "t-1");
  assert.equal(staged[1]!.talentId, "t-1");
});

test("patchUploadItem is immutable and leaves siblings identical by reference", () => {
  const before = items(3);
  const after = patchUploadItem(before, "id-1", { status: "ready", bytesSent: 99 });
  assert.notEqual(after, before, "a new array");
  assert.equal(after[0], before[0], "untouched items keep their identity");
  assert.equal(after[1]!.status, "ready");
  assert.equal(after[1]!.bytesSent, 99);
  assert.equal(before[1]!.status, "queued", "the original item is not mutated");
});

test("patchUploadItem returns the SAME array for an unknown id (no pointless re-render)", () => {
  const before = items(2);
  assert.equal(patchUploadItem(before, "ghost", { status: "ready" }), before);
});

test("summarizeUploadItems counts in-flight / ready / errors", () => {
  let list = items(5);
  list = patchUploadItem(list, "id-0", { status: "ready" });
  list = patchUploadItem(list, "id-1", { status: "ready" });
  list = patchUploadItem(list, "id-2", { status: "error", errorMsg: "x" });
  list = patchUploadItem(list, "id-3", { status: "uploading" });
  assert.deepEqual(summarizeUploadItems(list), {
    total: 5,
    inFlight: 2, // id-3 uploading + id-4 still queued
    ready: 2,
    errors: 1,
  });
});

test("revokeUploadItemUrls frees every object URL exactly once", () => {
  const freed: string[] = [];
  revokeUploadItemUrls(items(3), (u) => freed.push(u));
  assert.deepEqual(freed, ["blob:p0.jpg", "blob:p1.jpg", "blob:p2.jpg"]);
});

// ── classification helpers ──────────────────────────────────────────────

test("isSvgFile catches both the MIME and the extension (case-insensitively)", () => {
  assert.equal(isSvgFile(file("a.svg", "")), true);
  assert.equal(isSvgFile(file("A.SVG", "")), true);
  assert.equal(isSvgFile(file("a.jpg", "image/svg+xml")), true);
  assert.equal(isSvgFile(file("a.jpg", "image/jpeg")), false);
});

test("isAllowedRasterImage accepts rasters and refuses SVG + non-images", () => {
  assert.equal(isAllowedRasterImage(file("a.jpg", "image/jpeg")), true);
  assert.equal(isAllowedRasterImage(file("a.webp", "image/webp")), true);
  assert.equal(isAllowedRasterImage(file("a.svg", "image/svg+xml")), false);
  assert.equal(isAllowedRasterImage(file("a.pdf", "application/pdf")), false);
});

// ── Kind allowance (2026-08-27 incident: silent video drop) ─────────────────
//
// The builder's asset library shipped a Videos tab, an `accept` list carrying
// video/* and application/pdf, a kind-aware CMS transport and a 200 MB server
// video lane — and every video an operator chose was filtered out of
// `prepareUploadFiles` before a byte moved, with no rejection reported. Three
// consecutive uploads produced zero network calls and zero on-screen text.
//
// These pin both halves of the fix: a surface that asks for a kind gets it,
// and a kind nobody asked for is REPORTED rather than dropped in silence.

test("default (no allowKinds) is images-only — Media page behaviour unchanged", async () => {
  const res = await prepareUploadFiles([
    file("a.jpg", "image/jpeg"),
    file("b.mp4", "video/mp4"),
  ]);
  assert.deepEqual(res.files.map((f) => f.name), ["a.jpg"]);
  assert.deepEqual(res.rejections, [{ code: "unsupported_kind", names: ["b.mp4"] }]);
  assert.equal(res.aborted, false);
});

test("allowKinds video → the video is cleared, not dropped", async () => {
  const res = await prepareUploadFiles([file("hero.mp4", "video/mp4")], {
    allowKinds: ["image", "video", "document"],
  });
  assert.deepEqual(res.files.map((f) => f.name), ["hero.mp4"]);
  assert.deepEqual(res.rejections, []);
});

test("a junk file is never cleared, even on an all-kinds surface", async () => {
  const res = await prepareUploadFiles([file(".DS_Store", ""), file("a.jpg")], {
    allowKinds: ["image", "video", "document"],
  });
  assert.deepEqual(res.files.map((f) => f.name), ["a.jpg"]);
  assert.deepEqual(res.rejections, [{ code: "unsupported_kind", names: [".DS_Store"] }]);
});

test("a video with an empty MIME still classifies by extension", async () => {
  // Chrome hands over `type: ""` for some containers; the extension fallback is
  // what keeps a .mov from reading as an image and being posted to the wrong lane.
  const res = await prepareUploadFiles([file("clip.mov", "")], {
    allowKinds: ["video"],
  });
  assert.deepEqual(res.files.map((f) => f.name), ["clip.mov"]);
});

test("SVG keeps its own message and never doubles as unsupported_kind", async () => {
  const res = await prepareUploadFiles([file("logo.svg", "image/svg+xml")], {
    allowKinds: ["image", "video", "document"],
  });
  assert.deepEqual(res.files, []);
  assert.deepEqual(res.rejections, [{ code: "svg_skipped", count: 1 }]);
});

test("classifyUploadKind refuses what no lane takes, rather than guessing image", async () => {
  // The router (`detectUploadKind`) defaults to "image"; the gate must not.
  // A folder drop sweeps up .DS_Store — MIME "", no extension — and guessing
  // image there means uploading junk and reading a 415 back.
  assert.equal(classifyUploadKind(file(".DS_Store", "")), null);
  assert.equal(classifyUploadKind(file("archive.bin", "application/octet-stream")), null);
  assert.equal(classifyUploadKind(file("a.jpg", "image/jpeg")), "image");
  assert.equal(classifyUploadKind(file("b.mp4", "video/mp4")), "video");
  assert.equal(classifyUploadKind(file("c.mkv", "")), "video");
  assert.equal(classifyUploadKind(file("d.pdf", "application/pdf")), "document");
  assert.equal(classifyUploadKind(file("e.csv", "text/csv")), "document");
});

// ── Per-kind size caps (2026-08-27) ─────────────────────────────────────────
//
// The CMS lanes gate video at 30 MB client-side, matched to the server's
// MEDIA_VIDEO_MAX_BYTES. The refusal must happen before any bytes move and
// must NAME the file with its cap: a 413 after a 30-second upload is the slow
// version of the silent drop #1369 fixed.

test("an over-cap video is refused with its name and the cap in MB", async () => {
  const big = new File([new Uint8Array(8)], "raw-export.mp4", { type: "video/mp4" });
  Object.defineProperty(big, "size", { value: 31 * 1024 * 1024 });
  const ok = new File([new Uint8Array(8)], "hero.mp4", { type: "video/mp4" });
  const res = await prepareUploadFiles([big, ok], {
    allowKinds: ["video"],
    maxBytesByKind: { video: 30 * 1024 * 1024 },
  });
  assert.deepEqual(res.files.map((f) => f.name), ["hero.mp4"]);
  assert.deepEqual(res.rejections, [
    { code: "file_too_large", names: ["raw-export.mp4"], maxMb: 30 },
  ]);
  assert.equal(res.aborted, false, "an oversize file must never abort the batch");
});

test("a kind with no cap entry is uncapped at the client gate", async () => {
  const big = new File([new Uint8Array(8)], "huge.mp4", { type: "video/mp4" });
  Object.defineProperty(big, "size", { value: 500 * 1024 * 1024 });
  const res = await prepareUploadFiles([big], {
    allowKinds: ["video"],
    maxBytesByKind: { image: 30 * 1024 * 1024 },
  });
  assert.deepEqual(res.files.map((f) => f.name), ["huge.mp4"]);
  assert.deepEqual(res.rejections, []);
});

test("size gate runs AFTER the kind gate: a wrong-kind file reads unsupported, not too-large", async () => {
  const doc = new File([new Uint8Array(8)], "brief.pdf", { type: "application/pdf" });
  Object.defineProperty(doc, "size", { value: 90 * 1024 * 1024 });
  const res = await prepareUploadFiles([doc], {
    allowKinds: ["image"],
    maxBytesByKind: { document: 25 * 1024 * 1024 },
  });
  assert.deepEqual(res.rejections, [{ code: "unsupported_kind", names: ["brief.pdf"] }]);
});

test("the hook's default caps agree with the server validator", async () => {
  const { DEFAULT_UPLOAD_MAX_BYTES } = await import("./use-media-upload");
  const { maxBytesForMediaKind } = await import("@/lib/site-admin/media/validation");
  // Video and document refuse client-side exactly where the server 413s.
  assert.equal(DEFAULT_UPLOAD_MAX_BYTES.video, maxBytesForMediaKind("video"));
  assert.equal(DEFAULT_UPLOAD_MAX_BYTES.document, maxBytesForMediaKind("document"));
  // Image gates the raw pick generously; compression shrinks it below the
  // server's 8 MB before the PUT, so it must be >= the server cap, not equal.
  assert.ok((DEFAULT_UPLOAD_MAX_BYTES.image ?? 0) >= maxBytesForMediaKind("image"));
});
