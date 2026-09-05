/**
 * Module placement, masking and format information.
 *
 * The matrix is built in two layers: FUNCTION patterns (finders, timing,
 * alignment, format, version) which are fixed by the standard, and DATA which
 * snakes through whatever is left. `reserved` tracks which cells the function
 * layer owns so the data walk can skip them — getting that wrong produces a
 * symbol that looks right and decodes to nothing.
 */
import { ALIGNMENT_CENTRES, ECC_FORMAT_BITS, sizeForVersion, type EccLevel } from "./tables";

export type Matrix = {
  size: number;
  /** true = dark module. */
  modules: boolean[][];
};

function grid(size: number, fill: boolean): boolean[][] {
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(fill));
}

function placeFinder(m: boolean[][], r: boolean[][], top: number, left: number): void {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const y = top + dy;
      const x = left + dx;
      if (y < 0 || x < 0 || y >= m.length || x >= m.length) continue;
      const onRing = dy === 0 || dy === 6 || dx === 0 || dx === 6;
      const inCore = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
      const inside = dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6;
      m[y]![x] = inside && (onRing || inCore);
      r[y]![x] = true; // the separator ring is reserved too, and light
    }
  }
}

function placeAlignment(m: boolean[][], r: boolean[][], version: number): void {
  const centres = ALIGNMENT_CENTRES[version]!;
  const last = centres.length - 1;
  for (let i = 0; i < centres.length; i += 1) {
    for (let j = 0; j < centres.length; j += 1) {
      // The three that would sit on a finder are omitted.
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      const cy = centres[i]!;
      const cx = centres[j]!;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          m[cy + dy]![cx + dx] = Math.max(Math.abs(dy), Math.abs(dx)) !== 1;
          r[cy + dy]![cx + dx] = true;
        }
      }
    }
  }
}

/** BCH(15,5) for format information, with the standard's mask applied. */
export function formatBits(ecc: EccLevel, mask: number): number {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((rem >> i) & 1) rem ^= 0b10100110111 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0b101010000010010;
}

/** BCH(18,6) for version information. Versions 7 and up only. */
export function versionBits(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i -= 1) {
    if ((rem >> i) & 1) rem ^= 0b1111100100101 << (i - 12);
  }
  return (version << 12) | rem;
}

function placeFormat(m: boolean[][], r: boolean[][], ecc: EccLevel, mask: number): void {
  const size = m.length;
  const bits = formatBits(ecc, mask);
  const bit = (i: number) => ((bits >> i) & 1) === 1;

  for (let i = 0; i <= 5; i += 1) { m[8]![i] = bit(i); r[8]![i] = true; }
  m[8]![7] = bit(6); r[8]![7] = true;
  m[8]![8] = bit(7); r[8]![8] = true;
  m[7]![8] = bit(8); r[7]![8] = true;
  for (let i = 9; i <= 14; i += 1) { m[14 - i]![8] = bit(i); r[14 - i]![8] = true; }

  // The second copy is 7 + 8, not 8 + 7. Bits 0-6 run up column 8 from the
  // bottom edge, stopping ABOVE the dark module at (size-8, 8); bits 7-14 run
  // along row 8 to the right edge. Writing it as 8 + 7 puts a format bit on
  // the dark module, which leaves one module unreserved — the data walk then
  // has one cell too many and every codeword after the halfway point shifts by
  // a bit. The symbol still decodes its payload, so only the Reed-Solomon
  // syndromes reveal it.
  for (let i = 0; i <= 6; i += 1) { m[size - 1 - i]![8] = bit(i); r[size - 1 - i]![8] = true; }
  for (let i = 7; i <= 14; i += 1) { m[8]![size - 15 + i] = bit(i); r[8]![size - 15 + i] = true; }

  // The dark module: always set, always reserved.
  m[size - 8]![8] = true;
  r[size - 8]![8] = true;
}

function placeVersion(m: boolean[][], r: boolean[][], version: number): void {
  if (version < 7) return;
  const size = m.length;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i += 1) {
    const on = ((bits >> i) & 1) === 1;
    const a = Math.floor(i / 3);
    const b = i % 3;
    m[size - 11 + b]![a] = on; r[size - 11 + b]![a] = true;
    m[a]![size - 11 + b] = on; r[a]![size - 11 + b] = true;
  }
}

/** The eight mask conditions, indexed by mask number. */
export const MASKS: readonly ((y: number, x: number) => boolean)[] = [
  (y, x) => (y + x) % 2 === 0,
  (y) => y % 2 === 0,
  (_y, x) => x % 3 === 0,
  (y, x) => (y + x) % 3 === 0,
  (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0,
  (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0,
  (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0,
];

/**
 * The standard's penalty score. Lower is better; it is what decides which of
 * the eight masks a symbol uses. The four rules penalise, in order: runs of
 * one colour, 2x2 blocks of one colour, the finder-like 1:1:3:1:1 pattern that
 * a scanner could mistake for a real finder, and an overall imbalance of dark
 * to light.
 */
export function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0;

  const runScore = (run: number) => (run >= 5 ? 3 + (run - 5) : 0);
  for (let y = 0; y < n; y += 1) {
    let runH = 1, runV = 1;
    for (let x = 1; x < n; x += 1) {
      runH = m[y]![x] === m[y]![x - 1] ? runH + 1 : (score += runScore(runH), 1);
      runV = m[x]![y] === m[x - 1]![y] ? runV + 1 : (score += runScore(runV), 1);
    }
    score += runScore(runH) + runScore(runV);
  }

  for (let y = 0; y < n - 1; y += 1) {
    for (let x = 0; x < n - 1; x += 1) {
      const v = m[y]![x];
      if (v === m[y]![x + 1] && v === m[y + 1]![x] && v === m[y + 1]![x + 1]) score += 3;
    }
  }

  const FINDER = [true, false, true, true, true, false, true];
  const matchesAt = (line: boolean[], i: number) =>
    FINDER.every((v, k) => line[i + k] === v);
  const quietRun = (line: boolean[], from: number, to: number) => {
    for (let i = from; i < to; i += 1) if (line[i] !== false) return false;
    return true;
  };
  for (let i = 0; i < n; i += 1) {
    const row = m[i]!;
    const col = m.map((r) => r[i]!);
    for (const line of [row, col]) {
      for (let j = 0; j + 7 <= n; j += 1) {
        if (!matchesAt(line, j)) continue;
        const before = j - 4 >= 0 && quietRun(line, j - 4, j);
        const after = j + 11 <= n && quietRun(line, j + 7, j + 11);
        if (before || after) score += 40;
      }
    }
  }

  const dark = m.flat().filter(Boolean).length;
  const pct = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

/**
 * Build the symbol. Places function patterns, walks the data in the
 * two-column zigzag from the bottom right, then picks the mask with the
 * lowest penalty.
 */
export function buildMatrix(
  codewords: Uint8Array,
  version: number,
  ecc: EccLevel,
  forceMask?: number,
): Matrix {
  const size = sizeForVersion(version);

  const base = grid(size, false);
  const reserved = grid(size, false);
  placeFinder(base, reserved, 0, 0);
  placeFinder(base, reserved, 0, size - 7);
  placeFinder(base, reserved, size - 7, 0);
  for (let i = 8; i < size - 8; i += 1) {
    const on = i % 2 === 0;
    base[6]![i] = on; reserved[6]![i] = true;
    base[i]![6] = on; reserved[i]![6] = true;
  }
  placeAlignment(base, reserved, version);
  placeVersion(base, reserved, version);
  // Reserve the format area with a placeholder mask; the real bits go in per
  // candidate below, because format info encodes which mask was chosen.
  placeFormat(base, reserved, ecc, 0);

  // The data walk: two columns at a time, right to left, alternating upward
  // and downward, skipping column 6 (the vertical timing line).
  const dataCells: Array<[number, number]> = [];
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing line. The pair does not straddle it —
    // the whole pair SHIFTS LEFT past it, so `right` itself moves to 5 and the
    // walk continues from there. Treating it as `col = right - 1` without
    // moving `right` reads column 4 twice and never reads column 0, which
    // keeps the cell COUNT correct while corrupting the codewords: the symbol
    // still decodes its payload and only the syndromes disagree.
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      const y = upward ? size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (!reserved[y]![x]) dataCells.push([y, x]);
      }
    }
    upward = !upward;
  }

  let best: Matrix | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    if (forceMask !== undefined && mask !== forceMask) continue;
    const m = base.map((row) => [...row]);
    placeFormat(m, grid(size, false), ecc, mask);
    const maskFn = MASKS[mask]!;
    dataCells.forEach(([y, x], i) => {
      const byte = codewords[i >> 3];
      const bit = byte === undefined ? false : ((byte >> (7 - (i & 7))) & 1) === 1;
      m[y]![x] = maskFn(y, x) ? !bit : bit;
    });
    const score = penalty(m);
    if (score < bestScore) {
      bestScore = score;
      best = { size, modules: m };
    }
  }
  return best!;
}

/** The data cell order for a version, exposed so tests can walk it back. */
export function dataCellOrder(version: number, ecc: EccLevel): Array<[number, number]> {
  const size = sizeForVersion(version);
  const base = grid(size, false);
  const reserved = grid(size, false);
  placeFinder(base, reserved, 0, 0);
  placeFinder(base, reserved, 0, size - 7);
  placeFinder(base, reserved, size - 7, 0);
  for (let i = 8; i < size - 8; i += 1) { reserved[6]![i] = true; reserved[i]![6] = true; }
  placeAlignment(base, reserved, version);
  placeVersion(base, reserved, version);
  placeFormat(base, reserved, ecc, 0);

  const cells: Array<[number, number]> = [];
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // see buildMatrix
    for (let step = 0; step < size; step += 1) {
      const y = upward ? size - 1 - step : step;
      for (const x of [right, right - 1]) if (!reserved[y]![x]) cells.push([y, x]);
    }
    upward = !upward;
  }
  return cells;
}
