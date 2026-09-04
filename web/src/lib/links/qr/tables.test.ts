/**
 * The tables, checked against arithmetic the standard implies rather than
 * against themselves. A transcription typo is the likeliest defect here, and
 * re-reading the same numbers back would never find one.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  VERSION_ECC, ALIGNMENT_CENTRES, sizeForVersion, totalCodewords,
  dataCodewords, charCountBits, type EccLevel,
} from "./tables";

const LEVELS: EccLevel[] = ["L", "M", "Q", "H"];

/**
 * Total codewords a version holds, computed from GEOMETRY: the module count
 * minus every function pattern, divided by eight. Entirely independent of the
 * ECC table, so agreement between the two is real evidence.
 */
function codewordsFromGeometry(version: number): number {
  const size = sizeForVersion(version);
  let functionModules = 3 * 8 * 8;          // three finders with separators
  functionModules += 2 * (size - 16);        // the two timing lines
  functionModules += 31;                     // format info + the dark module
  if (version >= 7) functionModules += 36;   // version info blocks
  const centres = ALIGNMENT_CENTRES[version]!;
  if (centres.length > 0) {
    const n = centres.length;
    // Every centre pair except the three that collide with the finders.
    functionModules += (n * n - 3) * 25;
    // Alignment patterns on the timing rows overlap them by 5 modules each.
    functionModules -= (n - 2) * 2 * 5;
  }
  return Math.floor((size * size - functionModules) / 8);
}

test("every version's total codewords agree with its geometry", () => {
  for (let v = 1; v <= 10; v += 1) {
    assert.equal(totalCodewords(v), codewordsFromGeometry(v), `version ${v}`);
  }
});

test("all four levels of a version hold the same total codewords", () => {
  // Levels trade data for EC; the total is a property of the version alone.
  // A mistyped block count in any single level breaks this.
  for (let v = 1; v <= 10; v += 1) {
    const totals = LEVELS.map((l) => {
      const [ec, g1, d1, g2, d2] = VERSION_ECC[v]![l];
      return g1 * (d1 + ec) + g2 * (d2 + ec);
    });
    assert.equal(new Set(totals).size, 1, `version ${v} totals differ: ${totals}`);
  }
});

test("capacity strictly decreases as error correction increases", () => {
  for (let v = 1; v <= 10; v += 1) {
    const caps = LEVELS.map((l) => dataCodewords(v, l));
    for (let i = 1; i < caps.length; i += 1) {
      assert.ok(caps[i]! < caps[i - 1]!, `version ${v}: ${LEVELS[i]} not below ${LEVELS[i - 1]}`);
    }
  }
});

test("capacity increases with version at every level", () => {
  for (const l of LEVELS) {
    for (let v = 2; v <= 10; v += 1) {
      assert.ok(dataCodewords(v, l) > dataCodewords(v - 1, l), `${l} v${v}`);
    }
  }
});

test("known capacities from the standard", () => {
  assert.equal(dataCodewords(1, "L"), 19);
  assert.equal(dataCodewords(1, "H"), 9);
  assert.equal(dataCodewords(10, "M"), 216);
  assert.equal(sizeForVersion(1), 21);
  assert.equal(sizeForVersion(10), 57);
});

test("byte-mode character count is 8 bits below version 10", () => {
  for (let v = 1; v <= 9; v += 1) assert.equal(charCountBits(v), 8);
  assert.equal(charCountBits(10), 16);
});

test("alignment centres start and end inside the symbol", () => {
  for (let v = 2; v <= 10; v += 1) {
    const c = ALIGNMENT_CENTRES[v]!;
    assert.equal(c[0], 6, `version ${v} first centre`);
    assert.equal(c[c.length - 1], sizeForVersion(v) - 7, `version ${v} last centre`);
  }
});
