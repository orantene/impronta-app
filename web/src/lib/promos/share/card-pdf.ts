import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

import { encodeQr } from "@/lib/links/qr";
import { drawMatrix } from "@/lib/links/qr/draw-matrix";
import { pdfSafe, SHARE_COPY, safeHex, DEFAULT_SHARE_COLORS } from "./visual-model";
import type { ShareLang } from "./captions";

/** A6 portrait in PDF points (105 x 148 mm). */
const MM = 72 / 25.4;
export const A6 = { width: 105 * MM, height: 148 * MM } as const;

function hexRgb(hex: string) {
  const v = parseInt(hex.slice(1), 16);
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

/**
 * Printable A6 counter card: "Escanea y reserva con 20%". The QR is vector
 * and its link carries `via=qr_print`, so printed scans are attributed.
 */
export async function buildPromoCardPdf(input: {
  lang: ShareLang;
  talentName: string;
  /** "20% de descuento" */
  headline: string;
  condition: string | null;
  link: string;
  accent?: string;
}): Promise<Uint8Array> {
  const copy = SHARE_COPY[input.lang];
  const accent = hexRgb(safeHex(input.accent, DEFAULT_SHARE_COLORS.accent));
  const doc = await PDFDocument.create();
  const page = doc.addPage([A6.width, A6.height]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const centered = (text: string, y: number, size: number, f = font, color = rgb(0.1, 0.1, 0.1)) => {
    const t = pdfSafe(text);
    const w = f.widthOfTextAtSize(t, size);
    page.drawText(t, { x: (A6.width - w) / 2, y, size, font: f, color });
  };

  page.drawRectangle({ x: 0, y: A6.height - 16 * MM, width: A6.width, height: 16 * MM, color: accent });
  centered(input.talentName, A6.height - 10 * MM, 13, bold, rgb(1, 1, 1));
  centered(copy.printTitle, A6.height - 34 * MM, 20, bold);
  centered(`${copy.printSub}: ${input.headline}`, A6.height - 43 * MM, 11);
  const side = 70 * MM;
  const { matrix } = encodeQr(input.link, { ecc: "M" });
  drawMatrix(page, matrix, (A6.width - side) / 2, 38 * MM, side, rgb(0, 0, 0));
  if (input.condition) centered(input.condition, 30 * MM, 10);
  const url = pdfSafe(input.link.replace(/^https?:\/\//, "").replace(/\?.*$/, ""));
  centered(url, 20 * MM, 8, font, rgb(0.35, 0.35, 0.35));
  return doc.save();
}
