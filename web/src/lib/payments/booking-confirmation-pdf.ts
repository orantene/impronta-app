/**
 * Booking-confirmation PDF (client-facing receipt).
 *
 * Pure function: typed booking data in → PDF bytes out. No DB, no Stripe, no
 * IO — so it is unit-testable and callable from the webhook on
 * payment_intent.succeeded to auto-attach a receipt to the Files tab.
 *
 * CLIENT-FACING ONLY. It shows the line items, subtotal, the transparent
 * service fee (the client-side platform surcharge) and the total paid. It
 * NEVER shows talent_cost, the workspace margin, or the platform/seller split
 * — same dignity rule the Offer tab enforces ("internals are never sent to
 * the client").
 *
 * Reuses the pdf-lib approach proven in api/talent/tax-summary/route.ts.
 */

import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib";

export interface BookingConfirmationLineItem {
  label: string;
  talentName?: string | null;
  units: number;
  unitPriceCents: number;
  totalPriceCents: number;
}

export interface BookingConfirmationPdfInput {
  confirmationNumber: string;
  /** ISO timestamp the payment settled (deterministic — passed in, never Date.now). */
  paidAtISO: string;
  clientName: string;
  workspaceName: string;
  currency: string;
  lineItems: BookingConfirmationLineItem[];
  subtotalCents: number;
  /** The client-side platform surcharge, shown as a transparent "Service fee". */
  serviceFeeCents: number;
  /** What the client actually paid = subtotal + service fee. */
  totalPaidCents: number;
  eventLabel?: string | null;
  /** Tenant brand; defaults to "Tulala". */
  brandName?: string;
}

const PAGE_W = PageSizes.A4[0];
const PAGE_H = PageSizes.A4[1];
const ML = 50;
const MR = 50;
const CW = PAGE_W - ML - MR;

function fmtMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(cents / 100));
  } catch {
    return `${Math.round(cents / 100).toLocaleString()} ${currency}`;
  }
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export async function generateBookingConfirmationPdf(
  input: BookingConfirmationPdfInput,
): Promise<Uint8Array> {
  const brand = input.brandName?.trim() || "Tulala";
  const currency = input.currency || "USD";

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.043, 0.043, 0.051);
  const muted = rgb(0.44, 0.44, 0.47);
  const border = rgb(0.82, 0.82, 0.84);
  const brandGreen = rgb(0.059, 0.31, 0.243); // #0F4F3E

  let page = pdf.addPage(PageSizes.A4);
  let cursor = 48; // distance from the top

  const yFromTop = (c: number) => PAGE_H - c;

  function ensureSpace(needed: number) {
    if (cursor + needed > PAGE_H - 50) {
      page = pdf.addPage(PageSizes.A4);
      cursor = 48;
    }
  }

  function text(
    t: string,
    o: {
      x?: number;
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      align?: "left" | "right" | "center";
      maxWidth?: number;
    } = {},
  ) {
    const f = o.bold ? fontBold : font;
    const size = o.size ?? 10;
    const x = o.x ?? ML;
    const maxWidth = o.maxWidth ?? CW;
    let s = t;
    while (s.length > 1 && f.widthOfTextAtSize(s, size) > maxWidth) s = s.slice(0, -1);
    let drawX = x;
    if (o.align === "right") drawX = x + maxWidth - f.widthOfTextAtSize(s, size);
    else if (o.align === "center") drawX = x + (maxWidth - f.widthOfTextAtSize(s, size)) / 2;
    page.drawText(s, { x: drawX, y: yFromTop(cursor), size, font: f, color: o.color ?? ink });
  }

  function rule(color: ReturnType<typeof rgb> = border, thickness = 0.5) {
    page.drawLine({
      start: { x: ML, y: yFromTop(cursor) },
      end: { x: PAGE_W - MR, y: yFromTop(cursor) },
      thickness,
      color,
    });
  }

  // ── Header ──────────────────────────────────────────────────────
  text(brand, { size: 12, bold: true, color: brandGreen });
  cursor += 30;
  text("Booking Confirmation", { size: 22, bold: true });
  cursor += 14;
  text(`Confirmation ${input.confirmationNumber}  ·  Paid ${fmtDate(input.paidAtISO)}`, {
    size: 9,
    color: muted,
  });
  cursor += 18;
  rule(ink, 1);
  cursor += 22;

  // ── Parties ─────────────────────────────────────────────────────
  const halfW = CW / 2;
  text("BILLED TO", { size: 7.5, bold: true, color: muted, maxWidth: halfW - 10 });
  text("ARRANGED BY", { size: 7.5, bold: true, color: muted, x: ML + halfW, maxWidth: halfW });
  cursor += 14;
  text(input.clientName, { size: 11, bold: true, maxWidth: halfW - 10 });
  text(input.workspaceName, { size: 11, bold: true, x: ML + halfW, maxWidth: halfW });
  cursor += 16;
  if (input.eventLabel) {
    text(input.eventLabel, { size: 9, color: muted, maxWidth: halfW - 10 });
    cursor += 16;
  }
  cursor += 10;

  // ── Line items ──────────────────────────────────────────────────
  const colQty = ML + CW - 200;
  const colUnit = ML + CW - 130;
  const colAmt = ML + CW - 70;
  text("DESCRIPTION", { size: 7.5, bold: true, color: muted, maxWidth: colQty - ML - 8 });
  text("QTY", { size: 7.5, bold: true, color: muted, x: colQty, maxWidth: 60, align: "right" });
  text("UNIT", { size: 7.5, bold: true, color: muted, x: colUnit, maxWidth: 60, align: "right" });
  text("AMOUNT", { size: 7.5, bold: true, color: muted, x: colAmt, maxWidth: 70, align: "right" });
  cursor += 10;
  rule();
  cursor += 16;

  for (const li of input.lineItems) {
    ensureSpace(30);
    const desc = li.talentName ? `${li.label} — ${li.talentName}` : li.label;
    text(desc, { size: 10, maxWidth: colQty - ML - 8 });
    text(String(li.units), { size: 10, x: colQty, maxWidth: 60, align: "right" });
    text(fmtMoney(li.unitPriceCents, currency), { size: 10, x: colUnit, maxWidth: 60, align: "right" });
    text(fmtMoney(li.totalPriceCents, currency), { size: 10, x: colAmt, maxWidth: 70, align: "right" });
    cursor += 20;
  }
  cursor += 4;
  rule();
  cursor += 18;

  // ── Totals ──────────────────────────────────────────────────────
  function totalRow(label: string, value: string, bold = false, color = ink) {
    text(label, { size: bold ? 11 : 9.5, bold, color, x: colUnit - 60, maxWidth: 120, align: "right" });
    text(value, { size: bold ? 12 : 9.5, bold, color, x: colAmt, maxWidth: 70, align: "right" });
    cursor += bold ? 24 : 18;
  }
  totalRow("Subtotal", fmtMoney(input.subtotalCents, currency));
  totalRow("Service fee", fmtMoney(input.serviceFeeCents, currency));
  cursor += 2;
  rule();
  cursor += 16;
  totalRow("Total paid", fmtMoney(input.totalPaidCents, currency), true, brandGreen);

  cursor += 8;
  text("PAID", { size: 9, bold: true, color: brandGreen });
  cursor += 30;
  rule();
  cursor += 16;
  text(
    `This confirms payment for the booking above, arranged through ${brand}. Keep this document for your records.`,
    { size: 8, color: muted },
  );

  return await pdf.save();
}
