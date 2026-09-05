/**
 * PNG and PDF output.
 *
 * These assert real file structure and real geometry, not "a Buffer came
 * back". The PNG is decoded again and its pixels compared to the matrix; the
 * PDF's page size is checked in millimetres, because a table tent printed at
 * A4 is a wasted afternoon at the print shop.
 */
import test from "node:test";
import assert from "node:assert/strict";

import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

import { toPng, toPrintPdf, PRINT_SIZES } from "./files";
import { encodeQr } from "./index";
import { QUIET_ZONE } from "./render";

const URL_ = "https://casarizo.com/q/t7";
const MM = 72 / 25.4;

test("the PNG is a real PNG at the requested physical size", async () => {
  const buf = await toPng(URL_, { widthMm: 50, dpi: 300 });
  assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], "PNG magic bytes");

  const meta = await sharp(buf).metadata();
  // 50mm at 300dpi is ~590px; the symbol rounds DOWN to whole modules, so it
  // must be at or under that and within one module of it.
  assert.ok(meta.width! <= 591, `width ${meta.width} exceeds 50mm at 300dpi`);
  assert.ok(meta.width! > 500, `width ${meta.width} is far under the requested size`);
  assert.equal(meta.width, meta.height, "a QR code is square");
});

test("the PNG's pixels match the matrix, so the image is the code and not noise", async () => {
  const buf = await toPng(URL_, { widthMm: 50, dpi: 300 });
  const { matrix } = encodeQr(URL_, { ecc: "M" });
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });

  const span = matrix.size + QUIET_ZONE * 2;
  const scale = info.width / span;
  assert.ok(Number.isInteger(scale), `module scale ${scale} is fractional`);

  // Sample the centre of every module and compare.
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      const px = Math.floor(((x + QUIET_ZONE) + 0.5) * scale);
      const py = Math.floor(((y + QUIET_ZONE) + 0.5) * scale);
      const dark = data[(py * info.width + px) * info.channels]! < 128;
      assert.equal(dark, matrix.modules[y]![x], `module ${x},${y}`);
    }
  }
});

test("the PNG's quiet zone is actually white", async () => {
  const buf = await toPng(URL_, { widthMm: 40, dpi: 300 });
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const corners = [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]];
  for (const [x, y] of corners) {
    assert.equal(data[(y * info.width + x) * info.channels], 255, `corner ${x},${y} not white`);
  }
});

test("a print PDF has one page per code, at the requested physical size", async () => {
  const items = [
    { url: "https://casarizo.com/q/t1", title: "Table 1", caption: "casarizo.com/q/t1" },
    { url: "https://casarizo.com/q/t2", title: "Table 2", caption: "casarizo.com/q/t2" },
    { url: "https://casarizo.com/q/t3", title: "Table 3", caption: "casarizo.com/q/t3" },
  ];
  const bytes = await toPrintPdf(items, { size: "table_tent" });
  assert.deepEqual([...bytes.subarray(0, 4)], [0x25, 0x50, 0x44, 0x46], "%PDF magic bytes");

  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 3, "one page per table");

  const { width, height } = doc.getPage(0).getSize();
  assert.ok(Math.abs(width - PRINT_SIZES.table_tent.widthMm * MM) < 0.5, `width ${width}pt`);
  assert.ok(Math.abs(height - PRINT_SIZES.table_tent.heightMm * MM) < 0.5, `height ${height}pt`);
});

test("every offered print size produces a page of that size", async () => {
  for (const key of Object.keys(PRINT_SIZES) as (keyof typeof PRINT_SIZES)[]) {
    const bytes = await toPrintPdf([{ url: URL_ }], { size: key });
    const doc = await PDFDocument.load(bytes);
    const { width, height } = doc.getPage(0).getSize();
    assert.ok(Math.abs(width - PRINT_SIZES[key].widthMm * MM) < 0.5, `${key} width`);
    assert.ok(Math.abs(height - PRINT_SIZES[key].heightMm * MM) < 0.5, `${key} height`);
  }
});

test("eleven table codes are ONE file, because the next action is Ctrl+P once", async () => {
  const items = Array.from({ length: 11 }, (_, i) => ({
    url: `https://casarizo.com/q/t${i + 1}`,
    title: `Table ${i + 1}`,
  }));
  const bytes = await toPrintPdf(items, { size: "table_tent" });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 11);
  // Vector, not embedded rasters: eleven 300dpi bitmaps would be megabytes.
  assert.ok(bytes.byteLength < 400_000, `PDF is ${bytes.byteLength} bytes; expected vector output`);
});

test("printing nothing is refused rather than producing an empty file", async () => {
  await assert.rejects(() => toPrintPdf([]), /Nothing to print/);
});

test("a low-contrast ink colour is refused before it reaches the printer", async () => {
  await assert.rejects(
    () => toPrintPdf([{ url: URL_ }], { darkHex: "#cccccc" }),
    /contrast/i,
  );
});
