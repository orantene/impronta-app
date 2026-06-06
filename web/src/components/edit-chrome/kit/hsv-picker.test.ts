import { test } from "node:test";
import assert from "node:assert/strict";

import { hexToHsv, hsvToHex } from "./hsv-picker";

// ── hex → hsv ──────────────────────────────────────────────────────────────────

test("hexToHsv: primaries", () => {
  const red = hexToHsv("#ff0000");
  assert.equal(Math.round(red.h), 0);
  assert.equal(Math.round(red.s), 100);
  assert.equal(Math.round(red.v), 100);

  const green = hexToHsv("#00ff00");
  assert.equal(Math.round(green.h), 120);
  const blue = hexToHsv("#0000ff");
  assert.equal(Math.round(blue.h), 240);
});

test("hexToHsv: white / black / grey", () => {
  const white = hexToHsv("#ffffff");
  assert.equal(Math.round(white.s), 0);
  assert.equal(Math.round(white.v), 100);

  const black = hexToHsv("#000000");
  assert.equal(Math.round(black.v), 0);

  const grey = hexToHsv("#808080");
  assert.equal(Math.round(grey.s), 0);
  assert.equal(Math.round(grey.v), 50);
});

test("hexToHsv: accepts 3-char shorthand", () => {
  assert.deepEqual(hexToHsv("#f00"), hexToHsv("#ff0000"));
});

test("hexToHsv: non-hex input → black (graceful)", () => {
  const x = hexToHsv("not-a-color");
  assert.equal(Math.round(x.v), 0);
});

// ── hsv → hex ──────────────────────────────────────────────────────────────────

test("hsvToHex: primaries + neutrals", () => {
  assert.equal(hsvToHex({ h: 0, s: 100, v: 100 }), "#ff0000");
  assert.equal(hsvToHex({ h: 120, s: 100, v: 100 }), "#00ff00");
  assert.equal(hsvToHex({ h: 240, s: 100, v: 100 }), "#0000ff");
  assert.equal(hsvToHex({ h: 0, s: 0, v: 100 }), "#ffffff");
  assert.equal(hsvToHex({ h: 0, s: 0, v: 0 }), "#000000");
});

test("hsvToHex: always emits a 6-char hex", () => {
  for (let h = 0; h < 360; h += 37) {
    for (const s of [0, 33, 66, 100]) {
      for (const v of [0, 50, 100]) {
        const hex = hsvToHex({ h, s, v });
        assert.match(hex, /^#[0-9a-f]{6}$/, `bad hex for h${h} s${s} v${v}: ${hex}`);
      }
    }
  }
});

test("hsvToHex: clamps out-of-range S/V", () => {
  assert.equal(hsvToHex({ h: 0, s: 200, v: 200 }), "#ff0000");
  assert.equal(hsvToHex({ h: 0, s: -50, v: -50 }), "#000000");
});

// ── round-trip ──────────────────────────────────────────────────────────────────

test("round-trip hex→hsv→hex is stable for saturated colors", () => {
  for (const hex of [
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#6366f1",
    "#ec4899",
    "#1a1a1a",
    "#fafafa",
    "#123456",
    "#abcdef",
  ]) {
    const back = hsvToHex(hexToHsv(hex));
    assert.equal(back, hex, `round-trip drifted for ${hex}`);
  }
});

test("hue wraps cleanly at the 360 boundary", () => {
  // 360 and 0 are the same hue; both must produce red at full S/V.
  assert.equal(hsvToHex({ h: 360, s: 100, v: 100 }), "#ff0000");
});
