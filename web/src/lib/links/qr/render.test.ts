/**
 * The renderings, checked for the things that make a printed code fail.
 *
 * The interesting assertions are not "it produced an SVG" — they are the quiet
 * zone, the contrast floor and the whole-pixel module size. Those three are how
 * a code that looks perfect on screen fails on card stock.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { encodeQr } from "./index";
import {
  QUIET_ZONE, MIN_CONTRAST, contrastRatio, assertScannableContrast,
  toSvg, toBitmap, modulePixels,
} from "./render";

const sample = encodeQr("https://casarizo.com/q/t7", { ecc: "M" });

test("the SVG reserves a four-module quiet zone on every side", () => {
  // The most common field failure: a code printed flush to an edge or against
  // a coloured panel cannot be FOUND by the scanner, however sharp it is.
  const svg = toSvg(sample.matrix);
  const span = sample.matrix.size + QUIET_ZONE * 2;
  assert.match(svg, new RegExp(`viewBox="0 0 ${span} ${span}"`));

  // No dark module may sit in the border ring.
  const rects = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)"/g)]
    .map((m) => [Number(m[1]), Number(m[2])] as const);
  assert.ok(rects.length > 0, "expected dark modules");
  for (const [x, y] of rects) {
    assert.ok(x >= QUIET_ZONE && y >= QUIET_ZONE, `module at ${x},${y} is inside the quiet zone`);
    assert.ok(x < span - QUIET_ZONE && y < span - QUIET_ZONE, `module at ${x},${y} overruns`);
  }
});

test("the background is painted, not left transparent", () => {
  // A transparent PNG dropped on a dark design inverts the code and it stops
  // scanning. The light modules have to be actually light.
  assert.match(toSvg(sample.matrix), /<rect width="\d+" height="\d+" fill="#ffffff"\/>/);
});

test("low-contrast colour pairs are refused with a reason a person can act on", () => {
  assert.throws(() => toSvg(sample.matrix, { dark: "#9a9a9a", light: "#c8c8c8" }), /contrast/i);
  assert.throws(() => assertScannableContrast("#7f8c8d", "#95a5a6"), /at least/);
  // A brand colour dark enough against white is fine.
  assert.doesNotThrow(() => assertScannableContrast("#135f78", "#ffffff"));
});

test("the contrast ratio matches known WCAG values", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff")), 21);
  assert.equal(Math.round(contrastRatio("#ffffff", "#ffffff")), 1);
  // Symmetric: order of arguments must not change the answer.
  assert.equal(contrastRatio("#135f78", "#ffffff"), contrastRatio("#ffffff", "#135f78"));
  assert.ok(contrastRatio("#000000", "#ffffff") > MIN_CONTRAST);
});

test("a malformed colour is refused rather than silently rendered black", () => {
  assert.throws(() => toSvg(sample.matrix, { dark: "rebeccapurple" }), /6-digit hex/);
  assert.throws(() => toSvg(sample.matrix, { dark: "#abc" }), /6-digit hex/);
});

test("module size for print is a whole number of pixels", () => {
  // A fractional module makes the rasteriser distribute the remainder
  // unevenly, so some modules come out a pixel wider than their neighbours.
  for (const mm of [50, 100, 25, 37]) {
    const px = modulePixels(sample.matrix, mm, 300);
    assert.ok(Number.isInteger(px) && px >= 1, `${mm}mm -> ${px}`);
    // The rendered symbol must not exceed the requested physical width.
    const span = (sample.matrix.size + QUIET_ZONE * 2) * px;
    assert.ok(span <= (mm / 25.4) * 300 + 1e-9, `${mm}mm overflows: ${span}px`);
  }
});

test("a 50mm code at 300dpi is comfortably above the readable module floor", () => {
  // Rule of thumb for print: modules below ~0.4mm stop scanning on phone
  // cameras. At 300dpi that is about 5 device pixels.
  const px = modulePixels(sample.matrix, 50, 300);
  const moduleMm = (px / 300) * 25.4;
  assert.ok(moduleMm >= 0.4, `module is ${moduleMm.toFixed(2)}mm, below the print floor`);
});

test("the bitmap has the quiet zone and the right dimensions", () => {
  const scale = 4;
  const { size, pixels } = toBitmap(sample.matrix, scale);
  assert.equal(size, (sample.matrix.size + QUIET_ZONE * 2) * scale);
  assert.equal(pixels.length, size * size);

  // Every pixel in the border ring must be light.
  const border = QUIET_ZONE * scale;
  for (let i = 0; i < border; i += 1) {
    for (let j = 0; j < size; j += 1) {
      assert.equal(pixels[i * size + j], 0, "top band");
      assert.equal(pixels[(size - 1 - i) * size + j], 0, "bottom band");
      assert.equal(pixels[j * size + i], 0, "left band");
      assert.equal(pixels[j * size + (size - 1 - i)], 0, "right band");
    }
  }
  assert.ok(pixels.some((p) => p === 1), "expected some dark pixels");
});

test("the bitmap agrees with the matrix module for module", () => {
  const scale = 3;
  const { size, pixels } = toBitmap(sample.matrix, scale);
  for (let y = 0; y < sample.matrix.size; y += 1) {
    for (let x = 0; x < sample.matrix.size; x += 1) {
      const px = (x + QUIET_ZONE) * scale;
      const py = (y + QUIET_ZONE) * scale;
      const expected = sample.matrix.modules[y]![x] ? 1 : 0;
      assert.equal(pixels[py * size + px], expected, `module ${x},${y}`);
      // and the whole scale x scale block, not just its corner
      assert.equal(pixels[(py + scale - 1) * size + px + scale - 1], expected);
    }
  }
});

test("a fractional scale is refused", () => {
  assert.throws(() => toBitmap(sample.matrix, 2.5), /whole number/);
  assert.throws(() => toBitmap(sample.matrix, 0), /whole number/);
});
