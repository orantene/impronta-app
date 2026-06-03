import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Tiny, dependency-free PDF layout helper on top of pdf-lib.
 *
 * Both the client receipt and the talent payout statement are simple, single
 * column A4 documents — a header, a few labelled rows, and a footer. This
 * builder gives a thin fluent surface for that so the generators stay readable
 * and we never hand-compute y-coordinates twice.
 */

const PAGE_WIDTH = 595.28; // A4 in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const INK = rgb(0.09, 0.1, 0.12);
const MUTED = rgb(0.45, 0.47, 0.5);
const HAIRLINE = rgb(0.86, 0.87, 0.89);

export class PdfDocBuilder {
  private doc!: PDFDocument;
  private page!: PDFPage;
  private regular!: PDFFont;
  private bold!: PDFFont;
  private cursorY = PAGE_HEIGHT - MARGIN;

  static async create(): Promise<PdfDocBuilder> {
    const b = new PdfDocBuilder();
    b.doc = await PDFDocument.create();
    b.regular = await b.doc.embedFont(StandardFonts.Helvetica);
    b.bold = await b.doc.embedFont(StandardFonts.HelveticaBold);
    b.page = b.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    b.cursorY = PAGE_HEIGHT - MARGIN;
    return b;
  }

  /** Document metadata. */
  meta(title: string, subject: string): this {
    this.doc.setTitle(title);
    this.doc.setSubject(subject);
    this.doc.setProducer("Tulala");
    this.doc.setCreator("Tulala");
    return this;
  }

  /** Brand line + big document title. */
  header(brand: string, docTitle: string): this {
    this.text(brand.toUpperCase(), { size: 10, font: this.bold, color: MUTED, gap: 6 });
    this.text(docTitle, { size: 22, font: this.bold, color: INK, gap: 18 });
    return this;
  }

  /** Section heading (e.g. "Booking", "Payment"). */
  section(label: string): this {
    this.cursorY -= 6;
    this.text(label.toUpperCase(), { size: 9, font: this.bold, color: MUTED, gap: 10 });
    return this;
  }

  /** A label / value row, value right-aligned. */
  row(label: string, value: string, opts?: { strong?: boolean }): this {
    const valueFont = opts?.strong ? this.bold : this.regular;
    const size = opts?.strong ? 12 : 11;
    this.page.drawText(label, {
      x: MARGIN,
      y: this.cursorY,
      size: 11,
      font: this.regular,
      color: MUTED,
    });
    const w = valueFont.widthOfTextAtSize(value, size);
    this.page.drawText(value, {
      x: PAGE_WIDTH - MARGIN - w,
      y: this.cursorY,
      size,
      font: valueFont,
      color: INK,
    });
    this.cursorY -= opts?.strong ? 22 : 18;
    return this;
  }

  /** Horizontal hairline divider. */
  divider(): this {
    this.cursorY -= 4;
    this.page.drawLine({
      start: { x: MARGIN, y: this.cursorY },
      end: { x: PAGE_WIDTH - MARGIN, y: this.cursorY },
      thickness: 0.75,
      color: HAIRLINE,
    });
    this.cursorY -= 16;
    return this;
  }

  /** Small footer note pinned near the bottom. */
  footer(note: string): this {
    const lines = wrap(note, this.regular, 9, PAGE_WIDTH - MARGIN * 2);
    let y = MARGIN + (lines.length - 1) * 12;
    for (const line of lines) {
      this.page.drawText(line, { x: MARGIN, y, size: 9, font: this.regular, color: MUTED });
      y -= 12;
    }
    return this;
  }

  private text(
    value: string,
    opts: { size: number; font: PDFFont; color: ReturnType<typeof rgb>; gap: number },
  ): void {
    this.page.drawText(value, {
      x: MARGIN,
      y: this.cursorY,
      size: opts.size,
      font: opts.font,
      color: opts.color,
    });
    this.cursorY -= opts.gap + opts.size;
  }

  async toBytes(): Promise<Uint8Array> {
    return this.doc.save();
  }
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Currency-aware money formatter for minor-unit (cents) amounts. */
export function formatMinor(amountCents: number, currency: string): string {
  const code = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${code}`;
  }
}

/** Human date (e.g. "3 June 2026"). Falls back to the raw string. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}
