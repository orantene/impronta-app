/**
 * PNG and print-ready PDF output for QR codes. Server only.
 *
 * The PDF draws the symbol as VECTOR rectangles rather than embedding a
 * raster. A vector code is resolution-independent, so the same file prints
 * correctly on a desktop inkjet and a commercial press, and it stays a few
 * kilobytes for a sheet of eleven table codes. Embedding a 300dpi bitmap per
 * code would produce a file too large to email and no sharper on paper.
 *
 * PRINT SIZES are physical, expressed in millimetres, because that is what a
 * printer asks for. `PRINT_SIZES` mirrors the sizes the Share popover offers.
 */
import "server-only";

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import sharp from "sharp";

import { encodeQr, type EccLevel } from "./index";
import { QUIET_ZONE, assertScannableContrast, modulePixels, toBitmap } from "./render";
import type { Matrix } from "./matrix";

/** 1 mm in PDF points. */
const MM = 72 / 25.4;

// The size table moved to the pure, client-safe `./print-sizes` (this module is
// `import "server-only"`). Re-exported here so every existing importer of
// `qr/files` keeps working unchanged.
export {
  PRINT_SIZES,
  type PrintSize,
  type PrintSizeKey,
} from "./print-sizes";
import { PRINT_SIZES } from "./print-sizes";

/**
 * PNG at a given physical width and DPI.
 *
 * Greyscale, one channel: a QR code has exactly two colours and a three-channel
 * PNG triples the bytes for nothing. Colour is applied by the design that
 * places the code, not baked into the symbol.
 */
export async function toPng(
  text: string,
  opts: { widthMm?: number; dpi?: number; ecc?: EccLevel } = {},
): Promise<Buffer> {
  const { matrix } = encodeQr(text, { ecc: opts.ecc ?? "M" });
  const scale = modulePixels(matrix, opts.widthMm ?? 50, opts.dpi ?? 300);
  const { size, pixels } = toBitmap(matrix, scale);

  // 0 = dark, 255 = light. The bitmap uses 1 for dark, so invert.
  const grey = Buffer.allocUnsafe(size * size);
  for (let i = 0; i < pixels.length; i += 1) grey[i] = pixels[i] === 1 ? 0 : 255;

  return sharp(grey, { raw: { width: size, height: size, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function drawMatrix(
  page: ReturnType<PDFDocument["addPage"]>,
  matrix: Matrix,
  originXPt: number,
  originYPt: number,
  sidePt: number,
  dark: ReturnType<typeof rgb>,
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

export type SheetItem = {
  /** The URL the code carries. */
  url: string;
  /** Large label, e.g. "Table 7". */
  title?: string;
  /** Small line under the code, e.g. the short link for typing. */
  caption?: string;
};

/**
 * One PDF page per item — the "print all tables" output.
 *
 * Eleven tables become eleven pages in one file rather than eleven downloads,
 * because the operator's next action is Ctrl+P once.
 */
export async function toPrintPdf(
  items: readonly SheetItem[],
  opts: { size?: PrintSizeKey; ecc?: EccLevel; darkHex?: string } = {},
): Promise<Uint8Array> {
  if (items.length === 0) throw new Error("Nothing to print: no codes were given.");

  const size = PRINT_SIZES[opts.size ?? "table_tent"];
  const darkHex = opts.darkHex ?? "#000000";
  assertScannableContrast(darkHex, "#ffffff");
  const v = parseInt(darkHex.replace("#", ""), 16);
  const dark = rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageW = size.widthMm * MM;
  const pageH = size.heightMm * MM;

  for (const item of items) {
    const { matrix } = encodeQr(item.url, { ecc: opts.ecc ?? "M" });
    const page = pdf.addPage([pageW, pageH]);

    // The code occupies 62% of the narrow edge, centred, sitting slightly
    // above the middle so a title above and a caption below both have room.
    const sidePt = Math.min(pageW, pageH) * 0.62;
    const x = (pageW - sidePt) / 2;
    const y = (pageH - sidePt) / 2;
    drawMatrix(page, matrix, x, y, sidePt, dark);

    if (item.title) {
      const fs = Math.min(24, sidePt / 8);
      const w = bold.widthOfTextAtSize(item.title, fs);
      page.drawText(item.title, {
        x: (pageW - w) / 2, y: y + sidePt + fs * 0.9, size: fs, font: bold, color: dark,
      });
    }
    if (item.caption) {
      const fs = Math.min(11, sidePt / 18);
      const w = font.widthOfTextAtSize(item.caption, fs);
      page.drawText(item.caption, {
        x: (pageW - w) / 2, y: y - fs * 1.8, size: fs, font, color: dark,
      });
    }
  }

  return pdf.save();
}
