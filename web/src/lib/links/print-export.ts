/**
 * `toPrintPdfDesign` — Piece B slice 2. Draws a `PrintDesign` (Page Builder's
 * print canvas) as a bleed-size, one-page-per-item PDF.
 *
 * KEPT ALONGSIDE `toPrintPdf`, NOT REPLACING IT. `toPrintPdf` serves the live
 * `/q/<code>/qr.pdf` endpoint at TRIM size; moving that to bleed-size pages
 * would silently start handing operators pages with crop marks printed on them.
 * Two callers, two page geometries, two functions.
 *
 * THE FOUR REFUSALS. Every one is computable from millimetres before a single
 * page is drawn, and every one is a sentence an operator can act on. They are
 * refusals rather than warnings because the output of this function gets
 * PRINTED: a warning on a screen is not read by the person stapling two hundred
 * flyers, and an unscannable code is only discovered by a guest holding a phone
 * at a table. Three come from the agreed `PrintDesignRefusalReason`; the fourth
 * is mine, and is explained at `logo_over_code`.
 */
import "server-only";

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

import { loadMediaKitTypeface } from "@/lib/talent/media-kit-font";

import type { PrintDesign, PrintDesignText } from "./print-design";
import { encodeQr } from "./qr";
import { PRINT_SIZES, type SheetItem } from "./qr/files";
import { QUIET_ZONE, contrastRatio } from "./qr/render";
import type { Matrix } from "./qr/matrix";

/** 1 mm in PDF points. */
const MM = 72 / 25.4;

/**
 * The scannable floor. Below roughly 0.4 mm per module a consumer phone camera
 * stops resolving the symbol reliably at arm's length under the lighting a
 * restaurant actually has. This is the number that decides whether a printed
 * run works, so it is named rather than inlined.
 */
const MIN_MODULE_MM = 0.4;

/** WCAG's normal-text threshold, reused: a scanner is less tolerant, not more. */
const MIN_CONTRAST = 4.5;

/**
 * Fraction of a symbol's area the error correction can lose and still decode.
 * The published figures are ~7/15/25/30% for L/M/Q/H. These are deliberately
 * BELOW them: the published number is the theoretical ceiling for a perfect
 * scan, and a printed piece has already spent some of that budget on ink
 * spread, paper texture and a camera held at an angle.
 */
const OCCLUSION_BUDGET = { L: 0.02, M: 0.06, Q: 0.12, H: 0.18 } as const;

export class PrintDesignRefusal extends Error {
  constructor(
    readonly reason: "contrast" | "slot_too_small" | "logo_over_code",
    message: string,
  ) {
    super(message);
    this.name = "PrintDesignRefusal";
  }
}

function hexToRgb(hex: string) {
  const v = parseInt(hex.replace("#", ""), 16);
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

/** Overlap of two mm rectangles, in mm². Zero when they do not touch. */
function overlapMm2(
  a: { xMm: number; yMm: number; wMm: number; hMm: number },
  b: { xMm: number; yMm: number; wMm: number; hMm: number },
): number {
  const w = Math.min(a.xMm + a.wMm, b.xMm + b.wMm) - Math.max(a.xMm, b.xMm);
  const h = Math.min(a.yMm + a.hMm, b.yMm + b.hMm) - Math.max(a.yMm, b.yMm);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Draw the symbol, with its OWN opaque light backing across the full slot.
 *
 * The backing is why contrast is a property of the code rather than of whatever
 * the page happens to draw behind it: a designer who puts a photograph under
 * the code cannot break it, because the code brings its own paper.
 */
function drawMatrix(
  page: PDFPage,
  matrix: Matrix,
  xPt: number,
  yPt: number,
  sidePt: number,
  dark: ReturnType<typeof rgb>,
  light: ReturnType<typeof rgb>,
) {
  page.drawRectangle({ x: xPt, y: yPt, width: sidePt, height: sidePt, color: light });
  const span = matrix.size + QUIET_ZONE * 2;
  const modulePt = sidePt / span;
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (!matrix.modules[y]![x]) continue;
      page.drawRectangle({
        x: xPt + (x + QUIET_ZONE) * modulePt,
        // PDF's origin is bottom-left; the matrix's is top-left.
        y: yPt + sidePt - (y + QUIET_ZONE + 1) * modulePt,
        width: modulePt,
        height: modulePt,
        color: dark,
      });
    }
  }
}

/** Trim marks at the four corners of the trim box, drawn in the bleed only. */
function drawTrimMarks(page: PDFPage, bleedPt: number, trimW: number, trimH: number) {
  const len = Math.min(bleedPt, 5 * MM);
  if (len <= 0) return;
  const ink = rgb(0, 0, 0);
  const mark = (x: number, y: number, dx: number, dy: number) =>
    page.drawLine({
      start: { x, y },
      end: { x: x + dx, y: y + dy },
      thickness: 0.25,
      color: ink,
    });
  for (const [cx, sx] of [[bleedPt, -1], [bleedPt + trimW, 1]] as const) {
    for (const [cy, sy] of [[bleedPt, -1], [bleedPt + trimH, 1]] as const) {
      mark(cx, cy, sx * len, 0);
      mark(cx, cy, 0, sy * len);
    }
  }
}

/**
 * Drop codepoints the embedded face cannot draw.
 *
 * A custom font does NOT throw on an unrepresentable character the way
 * `StandardFonts.Helvetica` does — it silently draws `.notdef`, so a name with
 * an unusual glyph prints as a row of empty boxes on two hundred flyers and
 * nothing anywhere reports a problem. Sanitising against the font's own
 * `characterSet` turns a silent tofu into a visible omission.
 */
function sanitise(text: string, coverage: ReadonlySet<number> | null): string {
  if (!coverage) return text;
  return [...text].filter((ch) => coverage.has(ch.codePointAt(0)!)).join("");
}

function drawCentred(
  page: PDFPage,
  text: string,
  style: PrintDesignText,
  font: PDFFont,
  colour: ReturnType<typeof rgb>,
  bleedPt: number,
  trimHPt: number,
) {
  if (!text) return;
  const w = font.widthOfTextAtSize(text, style.sizePt);
  page.drawText(text, {
    // Design coordinates are mm from the TOP-LEFT of the trim box; PDF's origin
    // is bottom-left of the full bleed page. Both translations happen here so
    // no caller has to remember which space it is in.
    x: bleedPt + style.xMm * MM - w / 2,
    y: bleedPt + trimHPt - style.yMm * MM - style.sizePt,
    size: style.sizePt,
    font,
    color: colour,
  });
}

/**
 * One page per item, at bleed size, with the design's geometry.
 *
 * @throws PrintDesignRefusal before drawing anything, so a refusal never leaves
 * a half-written PDF the operator might print.
 */
export async function toPrintPdfDesign(
  items: readonly SheetItem[],
  design: PrintDesign,
): Promise<Uint8Array> {
  if (items.length === 0) throw new Error("Nothing to print: no codes were given.");
  if (design.bleedMm < 0 || design.bleedMm > 10) {
    throw new Error(`Bleed must be between 0 and 10 mm; got ${design.bleedMm}.`);
  }

  const size = PRINT_SIZES[design.size];
  const darkHex = design.qr.darkHex ?? "#000000";
  const lightHex = "#ffffff";
  const ecc = design.qr.ecc ?? "M";

  // REFUSAL 1 — CONTRAST, against the code's own backing.
  const ratio = contrastRatio(darkHex, lightHex);
  if (ratio < MIN_CONTRAST) {
    throw new PrintDesignRefusal(
      "contrast",
      `The code colour ${darkHex} is too pale to scan: ${ratio.toFixed(1)}:1 against its ` +
        `white backing, and ${MIN_CONTRAST}:1 is the floor. Darken the code colour.`,
    );
  }

  // Encode every item FIRST. The QR version, and so the module count, depends on
  // URL length, so a fan-out of eleven links is eleven different symbols in one
  // slot. Checking the slot once against the first code would pass on the
  // shortest URL and ship the rest unscannable.
  const encoded = items.map((item) => ({ item, matrix: encodeQr(item.url, { ecc }).matrix }));

  // REFUSAL 2 — SLOT TOO SMALL, per page, naming the offending code.
  const drawableMm = design.qr.sizeMm;
  for (const { item, matrix } of encoded) {
    const span = matrix.size + QUIET_ZONE * 2;
    const moduleMm = drawableMm / span;
    if (moduleMm < MIN_MODULE_MM) {
      const neededMm = Math.ceil(span * MIN_MODULE_MM * 10) / 10;
      throw new PrintDesignRefusal(
        "slot_too_small",
        `The code for ${item.title ?? item.url} needs a slot of at least ${neededMm} mm ` +
          `but the design gives it ${drawableMm} mm, which prints ${moduleMm.toFixed(2)} mm ` +
          `modules against a ${MIN_MODULE_MM} mm floor. This URL encodes to ${matrix.size} ` +
          `modules; a longer link needs a bigger box. Enlarge the code or shorten the link.`,
      );
    }
  }

  // REFUSAL 3 — LOGO OVER THE CODE, bounded by the correction budget.
  //
  // Slice 1's type exempts a logo over the code at ecc "H" with no size bound.
  // The exemption is right in principle — H tolerates real damage — but an
  // arbitrarily large logo at H still destroys the symbol, and an unbounded
  // exemption is the kind that gets used. This checks the overlap AREA against
  // what the chosen level can actually correct, so "H" buys a bigger logo
  // rather than an unlimited one, and L is refused almost immediately.
  if (design.logo) {
    const slot = { xMm: design.qr.xMm, yMm: design.qr.yMm, wMm: drawableMm, hMm: drawableMm };
    const covered = overlapMm2(design.logo, slot);
    if (covered > 0) {
      const budget = OCCLUSION_BUDGET[ecc];
      const fraction = covered / (drawableMm * drawableMm);
      if (fraction > budget) {
        throw new PrintDesignRefusal(
          "logo_over_code",
          `The logo covers ${(fraction * 100).toFixed(0)}% of the code, and error ` +
            `correction level ${ecc} can only survive about ${(budget * 100).toFixed(0)}%. ` +
            `Move the logo off the code, make it smaller, or raise the code's error ` +
            `correction to "H" — which tolerates more, but not this much.`,
        );
      }
    }
  }

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  // The font must never fail the download. A missing subset degrades the PDF —
  // pdf-lib's built-in face draws the ASCII majority — and the sanitiser turns
  // anything it cannot draw into an omission rather than a box of tofu.
  const face = await loadMediaKitTypeface();
  let font: PDFFont;
  let bold: PDFFont;
  let coverage: ReadonlySet<number> | null = null;
  if (face) {
    font = await pdf.embedFont(face.regular, { subset: true });
    bold = await pdf.embedFont(face.bold, { subset: true });
    coverage = face.coverage;
  } else {
    const { StandardFonts } = await import("pdf-lib");
    font = await pdf.embedFont(StandardFonts.Helvetica);
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    // Helvetica THROWS on an unrepresentable codepoint rather than drawing
    // tofu, so restrict to WinAnsi's range and drop the rest. Losing an accent
    // beats a 500 on a download the operator is waiting for.
    coverage = new Set(Array.from({ length: 256 }, (_, i) => i));
  }

  const bleedPt = design.bleedMm * MM;
  const trimW = size.widthMm * MM;
  const trimH = size.heightMm * MM;
  const pageW = trimW + bleedPt * 2;
  const pageH = trimH + bleedPt * 2;

  const dark = hexToRgb(darkHex);
  const light = hexToRgb(lightHex);
  const background = design.background ? hexToRgb(design.background) : null;

  const logoImage = design.logo ? await pdf.embedPng(design.logo.png) : null;

  for (const { item, matrix } of encoded) {
    const page = pdf.addPage([pageW, pageH]);

    // Background covers the FULL bleed page, not the trim box: that is the
    // entire point of bleed. A background stopping at the trim line produces a
    // white hairline down one edge wherever the guillotine drifts.
    if (background) {
      page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: background });
    }

    if (logoImage && design.logo) {
      page.drawImage(logoImage, {
        x: bleedPt + design.logo.xMm * MM,
        y: bleedPt + trimH - (design.logo.yMm + design.logo.hMm) * MM,
        width: design.logo.wMm * MM,
        height: design.logo.hMm * MM,
      });
    }

    // `sizeMm` is the WHOLE symbol box, quiet zone INCLUDED, so it maps
    // straight onto the drawn side. Re-padding here would shrink every code by
    // eight modules and silently break the agreed contract with slice 1.
    drawMatrix(
      page,
      matrix,
      bleedPt + design.qr.xMm * MM,
      bleedPt + trimH - (design.qr.yMm + drawableMm) * MM,
      drawableMm * MM,
      dark,
      light,
    );

    if (design.title && item.title) {
      drawCentred(page, sanitise(item.title, coverage), design.title,
        design.title.bold === false ? font : bold, dark, bleedPt, trimH);
    }
    if (design.caption && item.caption) {
      drawCentred(page, sanitise(item.caption, coverage), design.caption,
        design.caption.bold ? bold : font, dark, bleedPt, trimH);
    }

    drawTrimMarks(page, bleedPt, trimW, trimH);
  }

  return pdf.save();
}
