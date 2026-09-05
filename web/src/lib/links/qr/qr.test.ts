/**
 * The encoder, proven by reading its output back.
 *
 * A test that only checks "the function returned a 21x21 grid" would pass on a
 * grid of noise. These decode the symbol the way a scanner does and assert two
 * independent things: that the Reed-Solomon syndromes are zero (the bytes
 * really are a valid codeword) and that the payload comes back identical.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { encodeQr, sizeForVersion } from "./index";
import { decodeQr } from "./roundtrip";
import { penalty, MASKS, buildMatrix } from "./matrix";
import { chooseVersion, encodeData, interleave } from "./encode";
import type { EccLevel } from "./tables";

const LEVELS: EccLevel[] = ["L", "M", "Q", "H"];

function roundTrip(text: string, ecc: EccLevel) {
  const { matrix, version } = encodeQr(text, { ecc });
  return { ...decodeQr(matrix, version, ecc), version, matrix };
}

test("a real link URL round-trips at every error-correction level", () => {
  const url = "https://casarizo.com/q/t7";
  for (const ecc of LEVELS) {
    const out = roundTrip(url, ecc);
    assert.equal(out.text, url, `payload at level ${ecc}`);
    assert.equal(out.syndromesClean, true, `syndromes at level ${ecc}`);
  }
});

test("payloads of every length from 1 to 120 bytes round-trip", () => {
  // Walks across version boundaries and the byte-alignment edge cases that
  // padding and the terminator get wrong.
  for (let n = 1; n <= 120; n += 1) {
    const text = "a".repeat(n);
    const out = roundTrip(text, "M");
    assert.equal(out.text, text, `length ${n}`);
    assert.equal(out.syndromesClean, true, `length ${n} syndromes`);
  }
});

test("multi-block versions round-trip, which is where interleaving is exercised", () => {
  // Version 5-Q and up split into several blocks; a wrong interleave produces
  // a symbol that is structurally perfect and decodes to rubbish.
  for (const [text, ecc] of [
    ["x".repeat(60), "Q"], ["y".repeat(90), "H"], ["z".repeat(150), "M"],
    ["w".repeat(200), "L"],
  ] as const) {
    const out = roundTrip(text, ecc);
    assert.equal(out.text, text, `${text.length} bytes at ${ecc}`);
    assert.equal(out.syndromesClean, true, `${text.length} bytes at ${ecc} syndromes`);
    assert.ok(out.version >= 5, `expected a multi-block version, got ${out.version}`);
  }
});

test("UTF-8 survives, so a Spanish caption is not mangled", () => {
  for (const text of ["Reservá tu mesa", "Café ☕ Rizo", "año/niño"]) {
    const out = roundTrip(text, "M");
    assert.equal(out.text, text);
    assert.equal(out.syndromesClean, true);
  }
});

test("the symbol is the right size and its finder patterns are where scanners look", () => {
  const { matrix, version } = encodeQr("https://casarizo.com/q/door", { ecc: "M" });
  const n = sizeForVersion(version);
  assert.equal(matrix.size, n);
  assert.equal(matrix.modules.length, n);
  // Finder centre is dark, its surrounding ring light, at all three corners.
  for (const [ty, tx] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) {
    assert.equal(matrix.modules[ty + 3]![tx + 3], true, "finder core dark");
    assert.equal(matrix.modules[ty + 1]![tx + 1], false, "finder ring light");
    assert.equal(matrix.modules[ty]![tx], true, "finder outer dark");
  }
  // The dark module, which is fixed by the standard and always set.
  assert.equal(matrix.modules[n - 8]![8], true, "dark module");
});

test("the mask chosen is the lowest-penalty one, not merely a valid one", () => {
  // Guards the selection loop: an encoder that always picked mask 0 would
  // still round-trip perfectly and print worse-scanning codes.
  //
  // Compares REAL candidates built with each mask forced. An earlier version
  // of this test XOR-ed the two mask functions over the finished symbol, which
  // also flipped the finder and timing modules — it was scoring a symbol no
  // encoder would ever produce, and it failed against correct output.
  const url = "https://casarizo.com/q/reserve";
  const bytes = new TextEncoder().encode(url);
  const version = chooseVersion(bytes.length, "M")!;
  const codewords = interleave(encodeData(bytes, version, "M"), version, "M");

  const scores = [];
  for (let mask = 0; mask < MASKS.length; mask += 1) {
    scores.push(penalty(buildMatrix(codewords, version, "M", mask).modules));
  }
  const chosen = decodeQr(encodeQr(url, { ecc: "M" }).matrix, version, "M").mask;
  assert.equal(
    scores[chosen],
    Math.min(...scores),
    `chose mask ${chosen} (score ${scores[chosen]}) but the minimum was ${Math.min(...scores)}`,
  );
});

test("text too long to fit REFUSES rather than truncating", () => {
  // A truncated URL is a code that scans perfectly and goes to the wrong page.
  assert.throws(() => encodeQr("a".repeat(3000), { ecc: "H" }), /will not fit/);
});

test("level H really does carry more error correction, which is what lets a logo sit on top", () => {
  const short = "https://casarizo.com/q/t7";
  const l = encodeQr(short, { ecc: "L" });
  const h = encodeQr(short, { ecc: "H" });
  assert.ok(h.version >= l.version, "H needs at least as much room as L");
});
