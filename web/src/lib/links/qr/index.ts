/**
 * QR encoding for printed link codes. Pure, no dependencies, no I/O.
 *
 * See `galois.ts` for why this is hand-written rather than installed, and how
 * its output is verified rather than merely tested.
 */
import { encodeData, chooseVersion, interleave } from "./encode";
import { buildMatrix, type Matrix } from "./matrix";
import type { EccLevel } from "./tables";

export type { EccLevel, Matrix };
export { sizeForVersion } from "./tables";

export type QrOptions = {
  /**
   * Error correction. Defaults to "M".
   *
   * Use "H" whenever a logo sits in the middle: the centre of the symbol is
   * data like any other, and covering it is only survivable because the error
   * correction can reconstruct what the logo hides. H recovers about 30% of
   * the codewords, which is what makes a centre mark safe to print.
   */
  ecc?: EccLevel;
};

export type QrResult = {
  matrix: Matrix;
  version: number;
  ecc: EccLevel;
};

/**
 * Encode `text` as a QR symbol.
 *
 * Refuses rather than truncating when the text will not fit in versions 1-10.
 * A truncated URL is a code that scans perfectly and goes to the wrong page,
 * which is worse than a code that was never printed.
 */
export function encodeQr(text: string, options: QrOptions = {}): QrResult {
  const ecc = options.ecc ?? "M";
  const bytes = new TextEncoder().encode(text);
  const version = chooseVersion(bytes.length, ecc);
  if (version === null) {
    throw new Error(
      `${bytes.length} bytes will not fit in a version-10 QR at level ${ecc}. ` +
        "Shorten the URL rather than raising the version: a larger symbol needs " +
        "a larger print area to stay scannable.",
    );
  }
  const data = encodeData(bytes, version, ecc);
  const codewords = interleave(data, version, ecc);
  return { matrix: buildMatrix(codewords, version, ecc), version, ecc };
}
