/**
 * The field arithmetic, checked against values published in the QR standard
 * rather than against itself.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { gfMul, gfPow, generatorPoly, reedSolomon, syndromes } from "./galois";

test("GF(256) multiplication matches known products", () => {
  assert.equal(gfMul(0, 5), 0);
  assert.equal(gfMul(5, 0), 0);
  assert.equal(gfMul(1, 1), 1);
  assert.equal(gfMul(1, 200), 200);
  // a^1 * a^1 = a^2 = 4
  assert.equal(gfMul(2, 2), 4);
  // Wraps through the primitive polynomial: a^7 * a^1 = a^8 = 0x1D
  assert.equal(gfMul(0x80, 2), 0x1d);
});

test("multiplication is commutative and associative over a sample", () => {
  for (const [a, b, c] of [[3, 7, 11], [200, 13, 99], [255, 254, 2]] as const) {
    assert.equal(gfMul(a, b), gfMul(b, a));
    assert.equal(gfMul(gfMul(a, b), c), gfMul(a, gfMul(b, c)));
  }
});

test("every non-zero element has a multiplicative inverse", () => {
  // If the log/exp tables were built wrongly this fails immediately.
  for (let a = 1; a < 256; a += 1) {
    const inv = gfPow(a, -1);
    assert.equal(gfMul(a, inv), 1, `inverse of ${a}`);
  }
});

test("generator polynomials match the coefficients in the QR spec", () => {
  // Published generator for 2 EC codewords: x^2 + a^25 x + a^1  ->  1, 3, 2
  assert.deepEqual([...generatorPoly(2)], [1, 3, 2]);
  // Degree 7, the generator used by version 1-M, from the standard's table.
  assert.deepEqual([...generatorPoly(7)], [1, 127, 122, 154, 164, 11, 68, 117]);
  // Degree 10, version 1-L.
  assert.deepEqual([...generatorPoly(10)], [1, 216, 194, 159, 111, 199, 94, 95, 113, 157, 193]);
  for (const d of [2, 7, 10, 13, 17, 22, 28, 30]) {
    assert.equal(generatorPoly(d).length, d + 1, `generator degree ${d}`);
  }
});

test("Reed-Solomon reproduces the worked example from the standard", () => {
  // ISO/IEC 18004 Annex I: the 1-M encoding of "01234567" produces these
  // 16 data codewords and these 10 EC codewords. This is the single most
  // valuable assertion in the file — an external, published expectation.
  const data = Uint8Array.from([
    0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11,
    0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11,
  ]);
  const ec = reedSolomon(data, 10);
  assert.deepEqual(
    [...ec],
    [0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55],
  );
});

test("a correct codeword has all-zero syndromes, a corrupted one does not", () => {
  // The verification the whole encoder rests on. Syndromes are decoder-side
  // arithmetic: if they are zero, the bytes really are an RS codeword.
  const data = Uint8Array.from([0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11,
    0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11]);
  const ec = reedSolomon(data, 10);
  const codeword = Uint8Array.from([...data, ...ec]);

  assert.deepEqual([...syndromes(codeword, 10)], new Array(10).fill(0));

  // Flip one bit anywhere and the syndromes must light up, or the check is
  // vacuous and would have passed on a broken encoder.
  const corrupted = Uint8Array.from(codeword);
  corrupted[3] = corrupted[3]! ^ 0x01;
  assert.notDeepEqual([...syndromes(corrupted, 10)], new Array(10).fill(0));
});
