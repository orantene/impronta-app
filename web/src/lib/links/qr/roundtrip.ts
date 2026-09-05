/**
 * A QR DECODER, used only by tests.
 *
 * This is the verification the encoder rests on. It reads a finished symbol
 * back the way a scanner does — find the mask from the format bits, unmask,
 * walk the data cells, de-interleave, then check Reed-Solomon syndromes and
 * parse the payload.
 *
 * It shares no code with the encoding path: `syndromes` is decoder-side
 * arithmetic, the de-interleave is written from the block table rather than by
 * inverting `interleave`, and the mask comes from the symbol itself rather
 * than from the encoder's choice. So agreement between the two is evidence,
 * not a tautology.
 *
 * Not shipped to the app: nothing in the product decodes QR codes. It lives
 * beside the encoder because a proof belongs next to the thing it proves.
 */
import { syndromes } from "./galois";
import { MASKS, dataCellOrder, formatBits } from "./matrix";
import { VERSION_ECC, charCountBits, type EccLevel } from "./tables";
import type { Matrix } from "./matrix";

export type Decoded = {
  text: string;
  mask: number;
  /** True when every block's Reed-Solomon syndromes are zero. */
  syndromesClean: boolean;
};

/** Recover the mask number by matching the symbol's format bits. */
function readMask(m: Matrix, ecc: EccLevel): number {
  let actual = 0;
  for (let i = 0; i <= 5; i += 1) if (m.modules[8]![i]) actual |= 1 << i;
  if (m.modules[8]![7]) actual |= 1 << 6;
  if (m.modules[8]![8]) actual |= 1 << 7;
  if (m.modules[7]![8]) actual |= 1 << 8;
  for (let i = 9; i <= 14; i += 1) if (m.modules[14 - i]![8]) actual |= 1 << i;

  for (let mask = 0; mask < 8; mask += 1) {
    if (formatBits(ecc, mask) === actual) return mask;
  }
  throw new Error("format information did not match any mask");
}

export function decodeQr(m: Matrix, version: number, ecc: EccLevel): Decoded {
  const mask = readMask(m, ecc);
  const maskFn = MASKS[mask]!;

  // Unmask and read the bit stream in the data-cell order.
  const cells = dataCellOrder(version, ecc);
  const bits: number[] = [];
  for (const [y, x] of cells) {
    const shown = m.modules[y]![x]!;
    bits.push((maskFn(y, x) ? !shown : shown) ? 1 : 0);
  }
  const stream = new Uint8Array(bits.length >> 3);
  for (let i = 0; i < stream.length; i += 1) {
    let b = 0;
    for (let k = 0; k < 8; k += 1) b = (b << 1) | bits[i * 8 + k]!;
    stream[i] = b;
  }

  // De-interleave back into blocks, written from the block table directly.
  const [ecPerBlock, g1, d1, g2, d2] = VERSION_ECC[version]![ecc];
  const blockSizes = [...new Array(g1).fill(d1), ...new Array(g2).fill(d2)] as number[];
  const dataBlocks: number[][] = blockSizes.map(() => []);
  const totalData = blockSizes.reduce((a, b) => a + b, 0);

  let p = 0;
  const maxData = Math.max(d1, d2 || 0);
  for (let i = 0; i < maxData; i += 1) {
    for (let b = 0; b < blockSizes.length; b += 1) {
      if (i < blockSizes[b]!) dataBlocks[b]!.push(stream[p++]!);
    }
  }
  // The EC section starts immediately after the data section in the
  // interleaved stream, and is itself interleaved block by block.
  const ecBlocks: number[][] = blockSizes.map(() => []);
  const ecStart = totalData;
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (let b = 0; b < blockSizes.length; b += 1) {
      ecBlocks[b]!.push(stream[ecStart + i * blockSizes.length + b]!);
    }
  }

  const syndromesClean = dataBlocks.every((block, b) => {
    const codeword = Uint8Array.from([...block, ...ecBlocks[b]!]);
    return syndromes(codeword, ecPerBlock).every((s) => s === 0);
  });

  // Parse the payload out of the concatenated data blocks.
  const data = dataBlocks.flat();
  const readBits = (from: number, count: number) => {
    let v = 0;
    for (let i = 0; i < count; i += 1) {
      const idx = from + i;
      v = (v << 1) | ((data[idx >> 3]! >> (7 - (idx & 7))) & 1);
    }
    return v;
  };
  const mode = readBits(0, 4);
  if (mode !== 0b0100) throw new Error(`expected byte mode, got ${mode.toString(2)}`);
  const lenBits = charCountBits(version);
  const length = readBits(4, lenBits);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) bytes[i] = readBits(4 + lenBits + i * 8, 8);

  return { text: new TextDecoder().decode(bytes), mask, syndromesClean };
}
