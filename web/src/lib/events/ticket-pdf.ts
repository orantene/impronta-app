/**
 * The ticket PDF: receipt + ticket in one file, one page per admission.
 *
 * WHY A FILE AT ALL. The ticket e-mail embeds a hosted QR (`/api/tickets/
 * <token>/qr`), and a hosted image is exactly the thing a mail client may
 * refuse to load, a guest may open offline at a door with no signal, or a
 * printer at a hotel desk cannot reach. The attachment is the copy that
 * needs nothing: the QR is drawn as vector rectangles into the page, the
 * code is typed under it, the price paid and the receipt code sit on the
 * same sheet, so one PDF is the ticket AND the proof of purchase.
 *
 * ONE PAGE PER ADMISSION. A "Mesa para 10" order that minted two admissions
 * is a two-page file; each page carries its own QR and the shared receipt.
 * A5 portrait: phone-friendly when opened, and prints two-up on Letter/A4.
 *
 * PURE-ISH. No `server-only`, no database: the caller (ticket-delivery, the
 * download route) gathers the facts. The one I/O is the optional brand logo
 * fetch, injectable so a test never touches the network; a logo that is not
 * a PNG/JPG on the allow-listed host is skipped silently and the header
 * falls back to the account name in the accent colour.
 *
 * FONTS. Noto Sans (Latin + Greek + Cyrillic) is embedded when the subset
 * files are on disk (see `media-kit-font.ts`); otherwise WinAnsi Helvetica,
 * which covers every character the ES/EN copy uses. Text is sanitised
 * against the face's real coverage, so an unsupported glyph becomes a
 * placeholder rather than a throw or a blank box.
 */

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";

import type { TicketEmailAdmission, TicketEmailLocale, TicketIssuedInput } from "@/lib/email/ticket-issued";
import { encodeQr } from "@/lib/links/qr";
import { drawMatrix } from "@/lib/links/qr/draw-matrix";
import { isAllowedLogoUrl } from "@/lib/media/logo-url-allowlist";
import { loadMediaKitTypeface } from "@/lib/talent/media-kit-font";
import { toFontSafe, toWinAnsiSafe } from "@/lib/talent/media-kit-pdf";

export type TicketPdfLine = {
  label: string;
  qty: number;
  unitCents: number;
  totalCents: number;
};

/** How the money was taken, as the transaction recorded it. Labelled here. */
export type TicketPdfTender = {
  /** `booking_transactions.provider`: 'manual' | 'stripe' | ... ; null when no transaction (a comp). */
  provider: string | null;
  /** `booking_transactions.metadata.paid_via` for a manual provider: 'cash' | 'card'. */
  paidVia: string | null;
};

export type TicketPdfReceipt = {
  /** The typed receipt code (`orders.receipt_code`). */
  receiptCode: string | null;
  /** The order id, shown short as the reference. */
  orderRef: string | null;
  currency: string;
  lines: TicketPdfLine[];
  subtotalCents: number;
  discountCents: number;
  tipCents: number;
  totalCents: number;
  tender: TicketPdfTender;
  /** ISO instant of the payment, when known. */
  paidAt: string | null;
};

export type TicketPdfInput = Pick<
  TicketIssuedInput,
  "locale" | "brand" | "eventTitle" | "nightLabel" | "venueName" | "holderName" | "admissions"
> & {
  /** One line: "Calle 5 123, Cancún, QR 77500" or null. */
  venueAddress?: string | null;
  receipt: TicketPdfReceipt;
  /** Already-worded policy sentence; null hides the line. See `refundPolicySentence`. */
  refundPolicy?: string | null;
};

export type LogoFetcher = (url: string) => Promise<{ bytes: Uint8Array; kind: "png" | "jpg" } | null>;

const MM = 72 / 25.4;
const PAGE_W = 148 * MM;
const PAGE_H = 210 * MM;
const MARGIN = 12 * MM;
const HEADER_H = 22 * MM;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_FETCH_TIMEOUT_MS = 4000;

const COPY = {
  es: {
    kicker: "Entrada y recibo",
    ticketOf: (i: number, n: number) => `Entrada ${i} de ${n}`,
    guest: "A nombre de",
    admits: (n: number) => (n > 1 ? `Admite ${n} personas` : "Admite 1 persona"),
    seat: "Lugar",
    venue: "Lugar",
    code: "Código",
    showAtDoor: "Muestra este código en la puerta, desde el teléfono o impreso.",
    link: "Tu entrada en línea",
    receipt: "Recibo",
    receiptCode: "Código de recibo",
    orderRef: "Referencia del pedido",
    paidWith: "Forma de pago",
    paidOn: "Pagado el",
    subtotal: "Subtotal",
    discount: "Descuento",
    tip: "Propina",
    total: "Total",
    qty: "Cant.",
    unit: "Precio",
    lineTotal: "Importe",
    more: (n: number) => `y ${n} línea${n > 1 ? "s" : ""} más en el recibo en línea`,
    tender: {
      cash: "Efectivo",
      card_manual: "Tarjeta en mostrador",
      stripe: "Tarjeta",
      manual_other: "Pago registrado por el local",
      comp: "Cortesía",
    } as Record<string, string>,
    refundsUntil: (h: number) => (h === 0 ? "Reembolsos hasta el inicio del evento." : `Reembolsos hasta ${h} horas antes de puertas.`),
    refundKey: {
      flexible: "Reembolso completo hasta 48 h antes del evento; después no hay reembolso.",
      strict: "Sin reembolso salvo cancelación del evento.",
      tiered: "Reembolso completo con 14 o más días de anticipación; 50% entre 7 y 14 días; sin reembolso con menos de 7 días.",
      manual: "Los reembolsos se revisan caso por caso; escribe al local.",
    } as Record<string, string>,
    refundUnknown: "Consulta la política de reembolsos con el local.",
    footer: (brand: string) => `Emitido por ${brand}.`,
  },
  en: {
    kicker: "Ticket and receipt",
    ticketOf: (i: number, n: number) => `Ticket ${i} of ${n}`,
    guest: "Issued to",
    admits: (n: number) => (n > 1 ? `Admits ${n} people` : "Admits 1 person"),
    seat: "Seat",
    venue: "Venue",
    code: "Code",
    showAtDoor: "Show this code at the door, from your phone or printed.",
    link: "Your ticket online",
    receipt: "Receipt",
    receiptCode: "Receipt code",
    orderRef: "Order reference",
    paidWith: "Payment method",
    paidOn: "Paid on",
    subtotal: "Subtotal",
    discount: "Discount",
    tip: "Tip",
    total: "Total",
    qty: "Qty",
    unit: "Price",
    lineTotal: "Amount",
    more: (n: number) => `and ${n} more line${n > 1 ? "s" : ""} on the online receipt`,
    tender: {
      cash: "Cash",
      card_manual: "Card at the counter",
      stripe: "Card",
      manual_other: "Recorded by the venue",
      comp: "Complimentary",
    } as Record<string, string>,
    refundsUntil: (h: number) => (h === 0 ? "Refunds until the event starts." : `Refunds until ${h} hours before doors.`),
    refundKey: {
      flexible: "Full refund up to 48 h before the event; none after.",
      strict: "No refunds unless the event is cancelled.",
      tiered: "Full refund 14 or more days out; 50% at 7 to 14 days; none under 7 days.",
      manual: "Refunds are reviewed case by case; write to the venue.",
    } as Record<string, string>,
    refundUnknown: "Ask the venue about its refund policy.",
    footer: (brand: string) => `Issued by ${brand}.`,
  },
} as const;

/**
 * The refund sentence, from the event's own cutoff when it has one, else the
 * workspace's commercial default, else an honest "ask the venue". Exported
 * so the delivery path and the download route word it identically.
 */
export function refundPolicySentence(
  locale: TicketEmailLocale,
  policy: { cutoffHours: number | null; workspaceKey: string | null },
): string {
  const c = COPY[locale];
  if (policy.cutoffHours !== null && Number.isFinite(policy.cutoffHours) && policy.cutoffHours >= 0) {
    return c.refundsUntil(Math.round(policy.cutoffHours));
  }
  if (policy.workspaceKey && c.refundKey[policy.workspaceKey]) return c.refundKey[policy.workspaceKey]!;
  return c.refundUnknown;
}

/** Human tender label from the transaction's provider + tender bag. */
export function tenderLabel(locale: TicketEmailLocale, tender: TicketPdfTender, totalCents: number): string {
  const c = COPY[locale];
  if (!tender.provider) return totalCents === 0 ? c.tender.comp! : c.tender.manual_other!;
  if (tender.provider === "manual") {
    if (tender.paidVia === "cash") return c.tender.cash!;
    if (tender.paidVia === "card") return c.tender.card_manual!;
    return c.tender.manual_other!;
  }
  if (tender.provider.startsWith("stripe")) return c.tender.stripe!;
  // Any other rail names itself (mercado_pago_point → "Mercado pago point").
  return tender.provider.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());
}

export function formatMoney(cents: number, currency: string, locale: TicketEmailLocale): string {
  const code = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", {
      style: "currency",
      currency: code,
      currencyDisplay: "code",
    })
      .format(cents / 100)
      .replace(/ /g, " ")
      .trim();
  } catch {
    return `${code} ${(cents / 100).toFixed(2)}`;
  }
}

function hexToRgb(hex: string | undefined, fallback: RGB): RGB {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return fallback;
  const v = parseInt(hex.slice(1), 16);
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

/** Fetch a PNG/JPG logo from the allow-listed storage host; null on anything else. */
export const defaultLogoFetcher: LogoFetcher = async (url) => {
  if (!isAllowedLogoUrl(url)) return null;
  let res: Response;
  try {
    res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(LOGO_FETCH_TIMEOUT_MS), cache: "no-store" });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  const kind = ct.includes("png") ? "png" : ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : null;
  if (!kind) return null;
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_LOGO_BYTES) return null;
  try {
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_LOGO_BYTES) return null;
    return { bytes: new Uint8Array(buf), kind };
  } catch {
    return null;
  }
};

type Faces = { regular: PDFFont; bold: PDFFont; mono: PDFFont; safe: (s: string) => string };

async function embedFaces(pdf: PDFDocument): Promise<Faces> {
  const mono = await pdf.embedFont(StandardFonts.Courier);
  let typeface: Awaited<ReturnType<typeof loadMediaKitTypeface>> = null;
  try {
    typeface = await loadMediaKitTypeface();
  } catch {
    typeface = null;
  }
  if (typeface) {
    try {
      pdf.registerFontkit(fontkit);
      const regular = await pdf.embedFont(typeface.regular, { subset: true });
      const bold = await pdf.embedFont(typeface.bold, { subset: true });
      const { coverage } = typeface;
      return { regular, bold, mono, safe: (s) => toFontSafe(s, coverage) };
    } catch {
      // fall through to Helvetica
    }
  }
  return {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono,
    safe: toWinAnsiSafe,
  };
}

/** Greedy word wrap; a single over-long word is broken by characters. */
function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const probe = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(probe, size) <= maxW) {
        line = probe;
        continue;
      }
      if (line) out.push(line);
      if (font.widthOfTextAtSize(word, size) <= maxW) {
        line = word;
        continue;
      }
      let chunk = "";
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxW) {
          out.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    }
    out.push(line);
  }
  return out.length > 0 ? out : [""];
}

function truncate(text: string, font: PDFFont, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

type Ctx = {
  page: PDFPage;
  faces: Faces;
  ink: RGB;
  muted: RGB;
  rule: RGB;
  accent: RGB;
  accentOn: RGB;
};

function text(ctx: Ctx, s: string, x: number, y: number, size: number, opts: { font?: PDFFont; color?: RGB } = {}): void {
  const font = opts.font ?? ctx.faces.regular;
  const safe = font === ctx.faces.mono ? toWinAnsiSafe(s) : ctx.faces.safe(s);
  ctx.page.drawText(safe, { x, y, size, font, color: opts.color ?? ctx.ink });
}

function textRight(ctx: Ctx, s: string, rightX: number, y: number, size: number, opts: { font?: PDFFont; color?: RGB } = {}): void {
  const font = opts.font ?? ctx.faces.regular;
  const safe = ctx.faces.safe(s);
  ctx.page.drawText(safe, { x: rightX - font.widthOfTextAtSize(safe, size), y, size, font, color: opts.color ?? ctx.ink });
}

function textCenter(ctx: Ctx, s: string, y: number, size: number, opts: { font?: PDFFont; color?: RGB } = {}): void {
  const font = opts.font ?? ctx.faces.regular;
  const safe = font === ctx.faces.mono ? toWinAnsiSafe(s) : ctx.faces.safe(s);
  ctx.page.drawText(safe, { x: (PAGE_W - font.widthOfTextAtSize(safe, size)) / 2, y, size, font, color: opts.color ?? ctx.ink });
}

function drawPage(
  pdf: PDFDocument,
  faces: Faces,
  input: TicketPdfInput,
  adm: TicketEmailAdmission,
  index: number,
  logo: PDFImage | null,
): void {
  const c = COPY[input.locale];
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const ink = rgb(0.06, 0.09, 0.08);
  const muted = rgb(0.42, 0.46, 0.44);
  const rule = rgb(0.85, 0.86, 0.85);
  const accent = hexToRgb(input.brand.accent, rgb(0.07, 0.07, 0.07));
  const accentOn = hexToRgb(input.brand.accentOn, rgb(1, 1, 1));
  const ctx: Ctx = { page, faces, ink, muted, rule, accent, accentOn };
  const contentW = PAGE_W - MARGIN * 2;
  const n = input.admissions.length;

  // ── Header band ──────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: accent });
  const headerMidY = PAGE_H - HEADER_H / 2;
  if (logo) {
    const maxH = HEADER_H * 0.5;
    const maxW = contentW * 0.5;
    const scale = Math.min(maxH / logo.height, maxW / logo.width);
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, { x: MARGIN, y: headerMidY - h / 2, width: w, height: h });
  } else {
    const name = truncate(input.brand.accountName.toUpperCase(), faces.bold, 13, contentW * 0.55);
    text(ctx, name, MARGIN, headerMidY - 4.5, 13, { font: faces.bold, color: accentOn });
  }
  textRight(ctx, c.kicker.toUpperCase(), PAGE_W - MARGIN, headerMidY + 2, 7.5, { font: faces.bold, color: accentOn });
  textRight(ctx, c.ticketOf(index + 1, n), PAGE_W - MARGIN, headerMidY - 8, 8, { color: accentOn });

  let y = PAGE_H - HEADER_H - 10 * MM;

  // ── Event ────────────────────────────────────────────────────────────
  const titleLines = wrap(input.eventTitle || "", faces.bold, 19, contentW).slice(0, 2);
  for (const l of titleLines) {
    text(ctx, l, MARGIN, y, 19, { font: faces.bold });
    y -= 22;
  }
  y -= 2;
  for (const l of wrap(input.nightLabel, faces.regular, 10.5, contentW).slice(0, 2)) {
    text(ctx, l, MARGIN, y, 10.5);
    y -= 13;
  }
  const venueLine = [input.venueName, input.venueAddress].filter((s): s is string => Boolean(s && s.trim())).join(" · ");
  if (venueLine) {
    for (const l of wrap(venueLine, faces.regular, 9, contentW).slice(0, 2)) {
      text(ctx, l, MARGIN, y, 9, { color: muted });
      y -= 11.5;
    }
  }

  // ── Guest + tier ─────────────────────────────────────────────────────
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.6, color: rule });
  y -= 14;
  const colW = contentW / 2;
  text(ctx, c.guest.toUpperCase(), MARGIN, y, 6.5, { font: faces.bold, color: muted });
  text(ctx, (adm.tierLabel || input.eventTitle).toUpperCase(), MARGIN + colW, y, 6.5, { font: faces.bold, color: muted });
  y -= 13;
  text(ctx, truncate(input.holderName?.trim() || "—", faces.bold, 12, colW - 8), MARGIN, y, 12, { font: faces.bold });
  text(ctx, truncate(c.admits(adm.partySize), faces.bold, 12, colW), MARGIN + colW, y, 12, { font: faces.bold });
  if (adm.seatLabel) {
    y -= 12;
    text(ctx, truncate(`${c.seat}: ${adm.seatLabel}`, faces.regular, 9.5, colW), MARGIN + colW, y, 9.5, { color: muted });
  }

  // ── QR ───────────────────────────────────────────────────────────────
  y -= 7 * MM;
  const side = 48 * MM;
  const qrX = (PAGE_W - side) / 2;
  const qrY = y - side;
  page.drawRectangle({ x: qrX - 3, y: qrY - 3, width: side + 6, height: side + 6, borderColor: rule, borderWidth: 0.6, color: rgb(1, 1, 1) });
  const { matrix } = encodeQr(adm.code, { ecc: "Q" });
  drawMatrix(page, matrix, qrX, qrY, side, ink);
  y = qrY - 12;
  textCenter(ctx, c.code.toUpperCase(), y, 6.5, { font: faces.bold, color: muted });
  y -= 10;
  for (const l of wrap(adm.code, faces.mono, 7.5, contentW).slice(0, 3)) {
    textCenter(ctx, l, y, 7.5, { font: faces.mono });
    y -= 9;
  }
  y -= 2;
  textCenter(ctx, c.showAtDoor, y, 8, { color: muted });
  y -= 11;
  textCenter(ctx, `${c.link}:`, y, 7, { color: muted });
  y -= 9;
  for (const l of wrap(adm.ticketUrl, faces.regular, 7, contentW).slice(0, 2)) {
    textCenter(ctx, l, y, 7, { color: accent });
    y -= 9;
  }

  // ── Receipt ──────────────────────────────────────────────────────────
  y -= 5 * MM;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.6, color: rule });
  y -= 13;
  const r = input.receipt;
  text(ctx, c.receipt.toUpperCase(), MARGIN, y, 6.5, { font: faces.bold, color: muted });
  const codeBits = [
    r.receiptCode ? `${c.receiptCode}: ${r.receiptCode}` : null,
    r.orderRef ? `${c.orderRef}: ${r.orderRef.slice(0, 8).toUpperCase()}` : null,
  ].filter(Boolean) as string[];
  textRight(ctx, codeBits.join("   "), PAGE_W - MARGIN, y, 7, { color: muted });
  y -= 13;

  // Right-aligned money columns: amount at the margin, unit price 30 mm in,
  // quantity 52 mm in. "MXN 15,000.00" at 9 pt is ~21 mm, so nothing meets.
  const rightX = PAGE_W - MARGIN;
  const colTotal = rightX;
  const colUnit = rightX - 30 * MM;
  const colQty = rightX - 60 * MM;
  const labelW = colQty - 6 * MM - MARGIN;
  const bodySize = 9;
  const MAX_LINES = 6;
  const shown = r.lines.slice(0, MAX_LINES);
  for (const line of shown) {
    text(ctx, truncate(line.label, faces.regular, bodySize, labelW), MARGIN, y, bodySize);
    textRight(ctx, `×${line.qty}`, colQty, y, bodySize, { color: muted });
    textRight(ctx, formatMoney(line.unitCents, r.currency, input.locale), colUnit, y, bodySize, { color: muted });
    textRight(ctx, formatMoney(line.totalCents, r.currency, input.locale), colTotal, y, bodySize);
    y -= 12;
  }
  if (r.lines.length > MAX_LINES) {
    text(ctx, c.more(r.lines.length - MAX_LINES), MARGIN, y, 8, { color: muted });
    y -= 12;
  }
  const extras: Array<[string, number]> = [];
  if (r.discountCents > 0) extras.push([c.discount, -r.discountCents]);
  if (r.tipCents > 0) extras.push([c.tip, r.tipCents]);
  if (extras.length > 0) {
    textRight(ctx, c.subtotal, colUnit, y, bodySize, { color: muted });
    textRight(ctx, formatMoney(r.subtotalCents, r.currency, input.locale), colTotal, y, bodySize, { color: muted });
    y -= 12;
    for (const [label, cents] of extras) {
      textRight(ctx, label, colUnit, y, bodySize, { color: muted });
      textRight(ctx, formatMoney(cents, r.currency, input.locale), colTotal, y, bodySize, { color: muted });
      y -= 12;
    }
  }
  y -= 2;
  page.drawLine({ start: { x: colQty - 6 * MM, y: y + 9 }, end: { x: rightX, y: y + 9 }, thickness: 0.6, color: rule });
  textRight(ctx, c.total, colQty, y - 2, 11, { font: faces.bold });
  textRight(ctx, formatMoney(r.totalCents, r.currency, input.locale), colTotal, y - 2, 11, { font: faces.bold });
  y -= 18;
  const tender = tenderLabel(input.locale, r.tender, r.totalCents);
  const paidOn = r.paidAt ? formatPaidOn(r.paidAt, input.locale) : null;
  text(ctx, `${c.paidWith}: ${tender}${paidOn ? `   ·   ${c.paidOn} ${paidOn}` : ""}`, MARGIN, y, 8, { color: muted });
  y -= 12;
  if (input.refundPolicy) {
    for (const l of wrap(input.refundPolicy, faces.regular, 8, contentW).slice(0, 3)) {
      text(ctx, l, MARGIN, y, 8, { color: muted });
      y -= 10.5;
    }
  }

  // ── Footer ───────────────────────────────────────────────────────────
  const footY = 7 * MM;
  text(ctx, `${c.footer(input.brand.accountName)} ${input.brand.footerDomain}`, MARGIN, footY, 7, { color: muted });
  textRight(ctx, `${index + 1} / ${n}`, PAGE_W - MARGIN, footY, 7, { color: muted });
}

function formatPaidOn(iso: string, locale: TicketEmailLocale): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale === "es" ? "es" : "en", { dateStyle: "medium", timeZone: "UTC" }).format(d);
  } catch {
    return null;
  }
}

/** Render the ticket PDF. One page per admission; never fewer than one page. */
export async function renderTicketPdf(
  input: TicketPdfInput,
  opts: { fetchLogo?: LogoFetcher | null } = {},
): Promise<Uint8Array> {
  if (input.admissions.length === 0) throw new Error("ticket-pdf: no admissions to render");
  const pdf = await PDFDocument.create();
  const faces = await embedFaces(pdf);

  let logo: PDFImage | null = null;
  const fetchLogo = opts.fetchLogo === undefined ? defaultLogoFetcher : opts.fetchLogo;
  if (input.brand.logoUrl && fetchLogo) {
    try {
      const fetched = await fetchLogo(input.brand.logoUrl);
      if (fetched) logo = fetched.kind === "png" ? await pdf.embedPng(fetched.bytes) : await pdf.embedJpg(fetched.bytes);
    } catch {
      logo = null;
    }
  }

  const title = input.locale === "es" ? `Entrada · ${input.eventTitle}` : `Ticket · ${input.eventTitle}`;
  pdf.setTitle(toWinAnsiSafe(title));
  pdf.setAuthor(toWinAnsiSafe(input.brand.accountName));
  pdf.setProducer(toWinAnsiSafe(input.brand.accountName));
  pdf.setCreator(toWinAnsiSafe(input.brand.accountName));
  pdf.setSubject(toWinAnsiSafe(input.receipt.receiptCode ? `${COPY[input.locale].receiptCode} ${input.receipt.receiptCode}` : title));

  input.admissions.forEach((adm, i) => drawPage(pdf, faces, input, adm, i, logo));
  return pdf.save();
}

/** `entrada-<receipt>.pdf` / `ticket-<receipt>.pdf`; a safe fallback when there is no receipt code. */
export function ticketPdfFilename(locale: TicketEmailLocale, receiptCode: string | null, fallback: string): string {
  const stem = (receiptCode || fallback).replace(/[^A-Za-z0-9_-]+/g, "").slice(0, 40) || "ticket";
  return `${locale === "es" ? "entrada" : "ticket"}-${stem}.pdf`;
}
