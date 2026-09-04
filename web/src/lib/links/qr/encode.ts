/**
 * Byte-mode data encoding and Reed-Solomon block interleaving.
 *
 * Byte mode only. Alphanumeric mode would pack an uppercase URL more tightly,
 * but a link code is lowercase by design (see the `links_code_format`
 * constraint) and alphanumeric mode has no lowercase letters, so it cannot
 * carry these URLs at all.
 */
import { reedSolomon } from "./galois";
import { VERSION_ECC, charCountBits, dataCodewords, type EccLevel } from "./tables";

const MODE_BYTE = 0b0100;
/** The two pad bytes the standard alternates once the terminator is placed. */
const PAD_A = 0xec;
const PAD_B = 0x11;

class BitWriter {
  private bits: number[] = [];
  push(value: number, width: number): void {
    for (let i = width - 1; i >= 0; i -= 1) this.bits.push((value >> i) & 1);
  }
  get length(): number {
    return this.bits.length;
  }
  /** Pad to a byte boundary and return the bytes. */
  toBytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((b, i) => {
      if (b) out[i >> 3]! |= 0x80 >> (i & 7);
    });
    return out;
  }
}

/** The smallest version 1-10 that holds `byteLength` at this level, or null. */
export function chooseVersion(byteLength: number, ecc: EccLevel): number | null {
  for (let v = 1; v <= 10; v += 1) {
    const capacityBits = dataCodewords(v, ecc) * 8;
    const needed = 4 + charCountBits(v) + byteLength * 8;
    if (needed <= capacityBits) return v;
  }
  return null;
}

/** Mode indicator, length, payload, terminator and padding, as data codewords. */
export function encodeData(bytes: Uint8Array, version: number, ecc: EccLevel): Uint8Array {
  const capacity = dataCodewords(version, ecc);
  const w = new BitWriter();
  w.push(MODE_BYTE, 4);
  w.push(bytes.length, charCountBits(version));
  for (const b of bytes) w.push(b, 8);

  // Terminator: up to four zero bits, but never past the capacity.
  const capacityBits = capacity * 8;
  w.push(0, Math.min(4, capacityBits - w.length));
  // Round up to a byte boundary.
  if (w.length % 8 !== 0) w.push(0, 8 - (w.length % 8));

  const out = new Uint8Array(capacity);
  const written = w.toBytes();
  out.set(written, 0);
  for (let i = written.length; i < capacity; i += 1) {
    out[i] = (i - written.length) % 2 === 0 ? PAD_A : PAD_B;
  }
  return out;
}

/**
 * Split data into its blocks, compute each block's EC codewords, and
 * interleave both — the order the symbol is filled in.
 *
 * Interleaving is what makes a QR code survive a coffee ring: consecutive
 * codewords land far apart in the symbol, so localised damage is spread thinly
 * across many blocks instead of destroying one.
 */
export function interleave(data: Uint8Array, version: number, ecc: EccLevel): Uint8Array {
  const [ecPerBlock, g1, d1, g2, d2] = VERSION_ECC[version]![ecc];

  const blocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < g1; i += 1) {
    blocks.push(data.slice(offset, offset + d1));
    offset += d1;
  }
  for (let i = 0; i < g2; i += 1) {
    blocks.push(data.slice(offset, offset + d2));
    offset += d2;
  }

  const ecBlocks = blocks.map((b) => reedSolomon(b, ecPerBlock));

  const out: number[] = [];
  const maxData = Math.max(d1, d2);
  for (let i = 0; i < maxData; i += 1) {
    for (const b of blocks) if (i < b.length) out.push(b[i]!);
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const b of ecBlocks) out.push(b[i]!);
  }
  return Uint8Array.from(out);
}
