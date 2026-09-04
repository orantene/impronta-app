/**
 * GF(256) arithmetic and Reed-Solomon error correction for QR codes.
 *
 * WHY THIS IS HAND-WRITTEN AND NOT A DEPENDENCY
 * The alternative was `npm install` into a `node_modules` that is symlinked
 * from a checkout forty other sessions are using, plus a `package-lock` diff
 * across eight in-flight branches. QR is also a frozen public standard
 * (ISO/IEC 18004) — it will not change underneath us the way a package can.
 *
 * WHY IT IS SAFE TO HAND-WRITE, which is a different question
 * Because it is verifiable rather than merely testable. The encoder's output
 * is checked by computing Reed-Solomon SYNDROMES over the finished codeword —
 * arithmetic from the decoder side, not the encoder side. A valid RS codeword
 * has all-zero syndromes; an encoder bug produces non-zero ones. That is a
 * proof about the output rather than a restatement of the code that made it,
 * which matters here because the failure mode is a printed code that scans on
 * some phones and not others, discovered after the cards are printed.
 *
 * The field is GF(2^8) with primitive polynomial 0x11D (x^8+x^4+x^3+x^2+1),
 * as the QR specification requires.
 */

const PRIMITIVE = 0x11d;

/** exp[i] = a^i, doubled to 512 entries so callers can skip a modulo. */
const EXP = new Uint8Array(512);
/** log[a^i] = i. log[0] is undefined and never read; guarded at call sites. */
const LOG = new Uint8Array(256);

{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= PRIMITIVE;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}

/** Addition in GF(2^8) is XOR. Named so call sites read as field arithmetic. */
export function gfAdd(a: number, b: number): number {
  return a ^ b;
}

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

export function gfPow(a: number, n: number): number {
  if (a === 0) return n === 0 ? 1 : 0;
  // n may be negative; bring the exponent into [0, 254] before the lookup.
  const e = ((LOG[a] * n) % 255 + 255) % 255;
  return EXP[e];
}

/**
 * The generator polynomial for `degree` error-correction codewords:
 * (x - a^0)(x - a^1)...(x - a^(degree-1)), coefficients highest-order first.
 */
export function generatorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] = gfAdd(next[j], poly[j]!);
      next[j + 1] = gfAdd(next[j + 1], gfMul(poly[j]!, EXP[i]));
    }
    poly = next;
  }
  return poly;
}

/**
 * The `ecCount` Reed-Solomon codewords for `data`: the remainder of
 * data * x^ecCount divided by the generator polynomial.
 */
export function reedSolomon(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = generatorPoly(ecCount);
  const rem = new Uint8Array(data.length + ecCount);
  rem.set(data, 0);

  for (let i = 0; i < data.length; i += 1) {
    const factor = rem[i]!;
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j += 1) {
      rem[i + j] = gfAdd(rem[i + j]!, gfMul(gen[j]!, factor));
    }
  }
  return rem.slice(data.length);
}

/**
 * Reed-Solomon syndromes for a finished codeword (data followed by its EC
 * bytes). Every entry is zero for a valid codeword.
 *
 * This exists for verification, not for encoding: it is how the tests prove
 * the encoder produced a real RS codeword rather than plausible-looking bytes.
 * It evaluates the codeword polynomial at the generator's ROOTS, which for QR
 * are a^0..a^(ecCount-1) — see `generatorPoly`, which multiplies in EXP[i]
 * starting at i=0. Evaluating at a^1..a^ecCount instead is the obvious
 * off-by-one and it makes this check fail on a perfectly good codeword; it did
 * exactly that on the first run here. Shares no code with `reedSolomon`.
 */
export function syndromes(codeword: Uint8Array, ecCount: number): Uint8Array {
  const out = new Uint8Array(ecCount);
  for (let i = 0; i < ecCount; i += 1) {
    let acc = 0;
    const x = gfPow(2, i);
    for (const byte of codeword) acc = gfAdd(gfMul(acc, x), byte);
    out[i] = acc;
  }
  return out;
}
