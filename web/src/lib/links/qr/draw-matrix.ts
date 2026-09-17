/**
 * Draw a QR matrix onto a pdf-lib page as VECTOR rectangles.
 *
 * Pure (no `server-only`, no sharp) so the ticket PDF, which is unit-tested
 * under the plain events runner, can share it with the print sheet in
 * `./files`. A vector symbol is resolution-independent and a few kilobytes;
 * a raster would be neither.
 */
import type { PDFPage, RGB } from "pdf-lib";

import type { Matrix } from "./matrix";
import { QUIET_ZONE } from "./render";

export function drawMatrix(
  page: PDFPage,
  matrix: Matrix,
  originXPt: number,
  originYPt: number,
  sidePt: number,
  dark: RGB,
): void {
  const span = matrix.size + QUIET_ZONE * 2;
  const modulePt = sidePt / span;
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (!matrix.modules[y]![x]) continue;
      page.drawRectangle({
        x: originXPt + (x + QUIET_ZONE) * modulePt,
        // PDF's origin is bottom-left; the matrix's is top-left.
        y: originYPt + sidePt - (y + QUIET_ZONE + 1) * modulePt,
        width: modulePt,
        height: modulePt,
        color: dark,
      });
    }
  }
}
