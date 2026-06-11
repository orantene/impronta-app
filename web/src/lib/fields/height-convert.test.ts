import test from "node:test";
import assert from "node:assert/strict";

import { cmToFtIn, ftInToCm } from "@/lib/fields/height-convert";

test("cmToFtIn: known anchors", () => {
  // 152.4cm = exactly 5'0"
  assert.deepEqual(cmToFtIn(152.4), { ft: 5, inch: 0 });
  // 180cm ≈ 5'11"
  assert.deepEqual(cmToFtIn(180), { ft: 5, inch: 11 });
  // 178cm ≈ 5'10"
  assert.deepEqual(cmToFtIn(178), { ft: 5, inch: 10 });
  // 193cm ≈ 6'4"
  assert.deepEqual(cmToFtIn(193), { ft: 6, inch: 4 });
});

test("cmToFtIn: inch rounding carries up to a whole foot, never 12in", () => {
  // 182.7cm rounds to ~71.93in → must read 6'0", not 5'12".
  const r = cmToFtIn(182.7);
  assert.ok(r.inch < 12, "inch must never be 12");
  assert.deepEqual(r, { ft: 6, inch: 0 });
});

test("cmToFtIn: non-positive height clamps to 0'0\"", () => {
  assert.deepEqual(cmToFtIn(0), { ft: 0, inch: 0 });
  assert.deepEqual(cmToFtIn(-5), { ft: 0, inch: 0 });
});

test("ftInToCm: known anchors round to nearest cm", () => {
  assert.equal(ftInToCm(5, 0), 152); // 60in * 2.54 = 152.4 → 152
  assert.equal(ftInToCm(6, 0), 183); // 72in * 2.54 = 182.88 → 183
  assert.equal(ftInToCm(5, 10), 178); // 70in * 2.54 = 177.8 → 178
});

test("round-trip cm → ft/in → cm stays within 1cm (rounding tolerance)", () => {
  for (let cm = 140; cm <= 210; cm++) {
    const { ft, inch } = cmToFtIn(cm);
    const back = ftInToCm(ft, inch);
    assert.ok(Math.abs(back - cm) <= 1, `cm=${cm} round-tripped to ${back}`);
  }
});
