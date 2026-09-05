/**
 * Version and error-correction tables from ISO/IEC 18004.
 *
 * Data only. Every number here is transcribed from the standard, so the tests
 * check them against INDEPENDENT arithmetic (total codewords implied by the
 * version's module count) rather than restating them — a transcription typo is
 * the likeliest defect in this file and re-reading the same numbers back would
 * not find one.
 *
 * Versions 1 to 10 only. A version-10 code at level M holds 213 bytes; the
 * longest thing this engine encodes is a URL like
 * `https://casarizo.com/q/t7`, which is 25. Capping the table keeps it
 * transcribable and reviewable rather than 40 rows of numbers nobody checks.
 */

export type EccLevel = "L" | "M" | "Q" | "H";

/** Error-correction blocks: [ecCodewordsPerBlock, group1Blocks, group1DataCodewords, group2Blocks, group2DataCodewords] */
type EccSpec = readonly [number, number, number, number, number];

/** Total data codewords available, by version and level. */
export const VERSION_ECC: Record<number, Record<EccLevel, EccSpec>> = {
  1:  { L: [ 7, 1,  19, 0,  0], M: [10, 1,  16, 0,  0], Q: [13, 1,  13, 0,  0], H: [17, 1,   9, 0,  0] },
  2:  { L: [10, 1,  34, 0,  0], M: [16, 1,  28, 0,  0], Q: [22, 1,  22, 0,  0], H: [28, 1,  16, 0,  0] },
  3:  { L: [15, 1,  55, 0,  0], M: [26, 1,  44, 0,  0], Q: [18, 2,  17, 0,  0], H: [22, 2,  13, 0,  0] },
  4:  { L: [20, 1,  80, 0,  0], M: [18, 2,  32, 0,  0], Q: [26, 2,  24, 0,  0], H: [16, 4,   9, 0,  0] },
  5:  { L: [26, 1, 108, 0,  0], M: [24, 2,  43, 0,  0], Q: [18, 2,  15, 2, 16], H: [22, 2,  11, 2, 12] },
  6:  { L: [18, 2,  68, 0,  0], M: [16, 4,  27, 0,  0], Q: [24, 4,  19, 0,  0], H: [28, 4,  15, 0,  0] },
  7:  { L: [20, 2,  78, 0,  0], M: [18, 4,  31, 0,  0], Q: [18, 2,  14, 4, 15], H: [26, 4,  13, 1, 14] },
  8:  { L: [24, 2,  97, 0,  0], M: [22, 2,  38, 2, 39], Q: [22, 4,  18, 2, 19], H: [26, 4,  14, 2, 15] },
  9:  { L: [30, 2, 116, 0,  0], M: [22, 3,  36, 2, 37], Q: [20, 4,  16, 4, 17], H: [24, 4,  12, 4, 13] },
  10: { L: [18, 2,  68, 2, 69], M: [26, 4,  43, 1, 44], Q: [24, 6,  19, 2, 20], H: [28, 6,  15, 2, 16] },
};

/** Centres of the alignment patterns, by version. Version 1 has none. */
export const ALIGNMENT_CENTRES: Record<number, readonly number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

/** Module count on a side. */
export function sizeForVersion(version: number): number {
  return version * 4 + 17;
}

/** Total codewords (data + EC) a version holds, derived from its geometry. */
export function totalCodewords(version: number): number {
  const spec = VERSION_ECC[version]!.L;
  return spec[1] * (spec[2] + spec[0]) + spec[3] * (spec[4] + spec[0]);
}

/** Data codewords available at a version and level. */
export function dataCodewords(version: number, ecc: EccLevel): number {
  const [, g1, d1, g2, d2] = VERSION_ECC[version]![ecc];
  return g1 * d1 + g2 * d2;
}

/**
 * Byte-mode character-count indicator width. 8 bits for versions 1-9,
 * 16 from version 10. The engine never exceeds version 10.
 */
export function charCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

/** Two bits of ECC level, in the order the format information uses. */
export const ECC_FORMAT_BITS: Record<EccLevel, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };
