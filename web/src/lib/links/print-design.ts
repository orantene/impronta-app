/**
 * PrintDesign — the seam between the print canvas (Page Builder) and the print
 * PDF exporter (QR & Links). Page Builder lays a print piece out at bleed size
 * and EXTRACTS this structured, millimetre-based description; `toPrintPdfDesign`
 * (QR & Links, Piece B slice 2) DRAWS it with pdf-lib. Agreed between the two
 * areas 2026-09-05; see docs/plans/print-canvas-design.md §"v1".
 *
 * WHY A CONSTRAINED VOCABULARY, NOT AN ARBITRARY NODE TREE. pdf-lib draws
 * primitives (rects, text, an embedded image, the QR matrix); there is no
 * satori/puppeteer in deps to rasterise a builder tree. More importantly, the
 * print rules — quiet zone intact, contrast refused, module size above the
 * scannable floor — are only ENFORCEABLE against a known vocabulary: the
 * exporter can guarantee them because it knows where the QR is and what is
 * behind it. Free-form HTML would put a photo behind the code where nothing
 * could see it. Free layout is "v2 if designers ask".
 *
 * COORDINATES. Every position/size is in MILLIMETRES, origin at the top-left of
 * the TRIM box. The page the exporter emits is (size + 2 * bleedMm) on each
 * axis; the trim box sits `bleedMm` in from every edge, and trim marks are
 * drawn there.
 */

import type { EccLevel } from "./qr";
import type { PrintSizeKey } from "./qr/files";

/**
 * The QR element. `sizeMm` is the WHOLE symbol box INCLUDING the 4-module quiet
 * zone (the exporter's viewBox is `modules + 8`), so the designer's box and the
 * exporter's box are the same box. NOTHING else may be placed inside it — the
 * quiet zone is how a scanner finds the code, and a caption tucked into the
 * white margin is the commonest way a printed code stops working.
 *
 * The QR draws its OWN opaque light backing across the full slot, so its
 * contrast is a property of the code, not of whatever the page draws behind it.
 */
export interface PrintDesignQr {
  xMm: number;
  yMm: number;
  /** Whole-symbol box, quiet zone INCLUDED. */
  sizeMm: number;
  /** Dark-module colour; contrast-checked against the code's own light backing. */
  darkHex?: string;
  ecc?: EccLevel;
}

/**
 * A text element. Position + style live on the DESIGN; the TEXT lives on the
 * per-page SheetItem (so a fan-out of eleven links keeps eleven labels). The
 * exporter embeds a Noto subset via media-kit-font.ts and treats `fontFamily`
 * as a HINT it maps to an embeddable face, falling back with an operator-
 * surfaced warning — a font that failed to ship must degrade the PDF, never
 * fail the download. The tenant's real brand face is v2 (a licence question).
 */
export interface PrintDesignText {
  xMm: number;
  yMm: number;
  sizePt: number;
  bold?: boolean;
  /** A hint the exporter resolves to an embeddable face; not a guaranteed face. */
  fontFamily?: string;
}

/** A raster logo, embedded with sharp/pdf-lib. */
export interface PrintDesignLogo {
  png: Uint8Array;
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
}

export interface PrintDesign {
  size: PrintSizeKey;
  /** Artwork past the trim line; validated 0–10, 3 is the norm. */
  bleedMm: number;
  /** Page fill hex. The QR's own backing sits on top of this behind the code. */
  background?: string;
  qr: PrintDesignQr;
  /** POSITION + STYLE only; the words come from each SheetItem. */
  title?: PrintDesignText;
  /** POSITION + STYLE only; the words come from each SheetItem. */
  caption?: PrintDesignText;
  logo?: PrintDesignLogo;
}

/**
 * THE THREE REFUSALS the exporter (`toPrintPdfDesign`, QR & Links, slice 2)
 * enforces before drawing a single page — each an actionable sentence, none a
 * warning, all computable from mm coordinates:
 *
 *  1. CONTRAST — code vs its own backing below WCAG 4.5:1.
 *  2. SLOT TOO SMALL — the QR slot below the module-size floor (~0.4mm/module).
 *     Checked PER PAGE, because the QR version (and so the module count) varies
 *     with URL length across a fan-out; the refusal names the offending code.
 *  3. LOGO OVER THE CODE — a logo rectangle intersecting the QR slot at anything
 *     below `ecc: "H"`.
 *
 * The seam function, implemented by QR & Links in slice 2 (kept ALONGSIDE the
 * existing trim-size `toPrintPdf`, which serves the live /q/<code>/qr.pdf
 * endpoint and must not silently move to bleed-size pages):
 *
 *   toPrintPdfDesign(items: readonly SheetItem[], design: PrintDesign): Promise<Uint8Array>
 *
 * One page per item; page = (size + 2 * bleedMm); trim marks at the trim box;
 * the item's url stamped into `design.qr`; the item's title/caption drawn at the
 * design's positions.
 */
export type PrintDesignRefusalReason =
  | "contrast"
  | "slot_too_small"
  | "logo_over_code";
