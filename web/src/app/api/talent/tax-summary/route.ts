// On-demand talent tax/income summary (PR-H, L47).
//
// Server route. Reads `loadTalentEarnings(talentProfileId, { sinceISO })`
// for the requested year and returns a printable PDF income summary.
// Platform-reported earnings only — off-platform self-declared earnings
// are intentionally excluded (legal-exposure reasoning in L47).

import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import {
  loadTalentEarningsByCurrency,
  primaryBundleOrEmpty,
} from "@/lib/talent/earnings-by-currency";

export const dynamic = "force-dynamic";

function fmt(cents: number, currency = "EUR"): string {
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

const PAGE_W = PageSizes.A4[0]; // 595.28
const PAGE_H = PageSizes.A4[1]; // 841.89
const ML = 50;  // margin left
const MR = 50;  // margin right
const CW = PAGE_W - ML - MR; // content width

// y coordinates are from bottom in pdf-lib; we track a cursor from the top.
function yFromTop(cursor: number): number {
  return PAGE_H - cursor;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const yearParam = Number(url.searchParams.get("year") ?? new Date().getUTCFullYear());
  const year = Number.isFinite(yearParam) && yearParam >= 2020 && yearParam <= 2100
    ? Math.trunc(yearParam)
    : new Date().getUTCFullYear();

  const guard = await requireTalentSelf();
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.error, code: guard.code },
      { status: guard.code === "not_authenticated" ? 401 : 404 },
    );
  }

  const sinceISO = `${year}-01-01T00:00:00.000Z`;
  // Use the multi-currency loader (it does NOT drop non-EUR rows the way the
  // legacy single-currency loader does) and report the talent's primary
  // currency bundle. A talent with bookings in several currencies gets their
  // primary one here; a per-currency tax PDF is a documented follow-up — but
  // critically, a MXN/ARS/USD talent no longer sees an empty (EUR-filtered) PDF.
  const earningsByCurrency = await loadTalentEarningsByCurrency(guard.talentProfile.id, {
    sinceISO,
  });
  const earnings = primaryBundleOrEmpty(earningsByCurrency);

  const talentName = guard.talentProfile.displayName ?? "Talent";
  const profileCode = guard.talentProfile.profileCode ?? "";
  const { totals } = earnings;
  const generatedAt = new Date().toUTCString();

  // ── Build PDF ──────────────────────────────────────────────────
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const black = rgb(0.043, 0.043, 0.051);   // #0B0B0D
  const muted = rgb(0.44, 0.44, 0.47);
  const border = rgb(0.82, 0.82, 0.84);
  const white = rgb(1, 1, 1);

  // We may need multiple pages; helper to add a fresh page.
  let page = pdfDoc.addPage(PageSizes.A4);
  let cursor = 48; // distance from top

  function ensureSpace(needed: number) {
    if (cursor + needed > PAGE_H - 40) {
      page = pdfDoc.addPage(PageSizes.A4);
      cursor = 48;
    }
  }

  function drawText(
    text: string,
    opts: {
      x?: number;
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      align?: "left" | "right" | "center";
      maxWidth?: number;
    } = {},
  ) {
    const f = opts.bold ? fontBold : font;
    const size = opts.size ?? 10;
    const color = opts.color ?? black;
    const x = opts.x ?? ML;
    const maxWidth = opts.maxWidth ?? CW;

    // Truncate text if it would overflow.
    let t = text;
    while (t.length > 1 && f.widthOfTextAtSize(t, size) > maxWidth) {
      t = t.slice(0, -1);
    }

    let drawX = x;
    if (opts.align === "right") {
      drawX = x + maxWidth - f.widthOfTextAtSize(t, size);
    } else if (opts.align === "center") {
      drawX = x + (maxWidth - f.widthOfTextAtSize(t, size)) / 2;
    }

    page.drawText(t, {
      x: drawX,
      y: yFromTop(cursor),
      size,
      font: f,
      color,
    });
  }

  function drawHRule(color: ReturnType<typeof rgb> = border, thickness = 0.5) {
    page.drawLine({
      start: { x: ML, y: yFromTop(cursor) },
      end: { x: PAGE_W - MR, y: yFromTop(cursor) },
      thickness,
      color,
    });
  }

  // ── Header ──────────────────────────────────────────────────────
  drawText(`Income Summary — ${year}`, { size: 18, bold: true });
  cursor += 24;
  const subtitle = profileCode
    ? `${talentName}  ·  ${profileCode}  ·  Generated ${generatedAt}`
    : `${talentName}  ·  Generated ${generatedAt}`;
  drawText(subtitle, { size: 9, color: muted });
  cursor += 16;
  drawHRule(black, 1);
  cursor += 18;

  // ── Totals strip ────────────────────────────────────────────────
  const tiles = [
    { label: "YTD Net", value: fmt(totals.ytdNetCents, totals.currency) },
    { label: "YTD Gross", value: fmt(totals.ytdGrossCents, totals.currency) },
    { label: "Pending", value: fmt(totals.pendingCents, totals.currency) },
    { label: "Pipeline", value: fmt(totals.confirmedPipelineCents, totals.currency) },
  ];
  const tileW = CW / 4 - 6;
  tiles.forEach((tile, i) => {
    const tx = ML + i * (tileW + 8);
    // Box
    page.drawRectangle({
      x: tx,
      y: yFromTop(cursor + 42),
      width: tileW,
      height: 42,
      color: rgb(0.97, 0.97, 0.98),
      borderColor: border,
      borderWidth: 0.5,
    });
    // Label
    page.drawText(tile.label.toUpperCase(), {
      x: tx + 8,
      y: yFromTop(cursor + 16),
      size: 7,
      font,
      color: muted,
    });
    // Value
    page.drawText(tile.value, {
      x: tx + 8,
      y: yFromTop(cursor + 34),
      size: 13,
      font: fontBold,
      color: black,
    });
  });
  cursor += 54;

  // ── Section: Per Agency ─────────────────────────────────────────
  cursor += 4;
  drawText("PER AGENCY", { size: 8, bold: true, color: muted });
  cursor += 14;
  drawHRule();
  cursor += 10;

  if (earnings.perAgency.length === 0) {
    drawText("No agency earnings in this period.", { size: 9, color: muted });
    cursor += 14;
  } else {
    // Table header
    const agencyCols = [
      { label: "Agency", x: ML, w: 200, align: "left" as const },
      { label: "Bookings", x: ML + 200, w: 70, align: "right" as const },
      { label: "Net", x: ML + 270, w: 100, align: "right" as const },
      { label: "Last Booking", x: ML + 370, w: CW - 370, align: "right" as const },
    ];
    agencyCols.forEach((col) => {
      page.drawText(col.label.toUpperCase(), {
        x: col.align === "right" ? col.x + col.w - font.widthOfTextAtSize(col.label.toUpperCase(), 7) : col.x,
        y: yFromTop(cursor),
        size: 7,
        font,
        color: muted,
      });
    });
    cursor += 12;
    drawHRule();
    cursor += 8;

    for (const agency of earnings.perAgency) {
      ensureSpace(18);
      const rowData = [
        { text: agency.name, col: agencyCols[0] },
        { text: String(agency.bookingsCount), col: agencyCols[1] },
        { text: fmt(agency.ytdNetCents, totals.currency), col: agencyCols[2] },
        { text: agency.lastBookingAt ?? "—", col: agencyCols[3] },
      ];
      rowData.forEach(({ text, col }) => {
        const textW = font.widthOfTextAtSize(text, 9);
        const drawX = col.align === "right"
          ? col.x + col.w - Math.min(textW, col.w)
          : col.x;
        let t = text;
        while (t.length > 1 && font.widthOfTextAtSize(t, 9) > col.w - 4) {
          t = t.slice(0, -1);
        }
        page.drawText(t, { x: drawX, y: yFromTop(cursor), size: 9, font, color: black });
      });
      cursor += 14;
    }
  }

  // ── Section: Bookings ───────────────────────────────────────────
  cursor += 8;
  ensureSpace(80);
  drawText("BOOKINGS", { size: 8, bold: true, color: muted });
  cursor += 14;
  drawHRule();
  cursor += 10;

  if (earnings.rows.length === 0) {
    drawText("No bookings in this period.", { size: 9, color: muted });
    cursor += 14;
  } else {
    const bookCols = [
      { label: "Date", x: ML, w: 72, align: "left" as const },
      { label: "Agency", x: ML + 72, w: 110, align: "left" as const },
      { label: "Client", x: ML + 182, w: 110, align: "left" as const },
      { label: "Gross", x: ML + 292, w: 70, align: "right" as const },
      { label: "Net", x: ML + 362, w: 70, align: "right" as const },
      { label: "Status", x: ML + 432, w: CW - 432, align: "right" as const },
    ];
    bookCols.forEach((col) => {
      page.drawText(col.label.toUpperCase(), {
        x: col.align === "right" ? col.x + col.w - font.widthOfTextAtSize(col.label.toUpperCase(), 7) : col.x,
        y: yFromTop(cursor),
        size: 7,
        font,
        color: muted,
      });
    });
    cursor += 12;
    drawHRule();
    cursor += 8;

    for (const row of earnings.rows) {
      ensureSpace(18);
      const rowData = [
        { text: row.workDate, col: bookCols[0] },
        { text: row.agencyName, col: bookCols[1] },
        { text: row.client, col: bookCols[2] },
        { text: fmt(row.grossCents, totals.currency), col: bookCols[3] },
        { text: fmt(row.netCents, totals.currency), col: bookCols[4] },
        { text: row.status, col: bookCols[5] },
      ];
      rowData.forEach(({ text, col }) => {
        let t = text;
        while (t.length > 1 && font.widthOfTextAtSize(t, 9) > col.w - 4) {
          t = t.slice(0, -1);
        }
        const textW = font.widthOfTextAtSize(t, 9);
        const drawX = col.align === "right" ? col.x + col.w - textW : col.x;
        page.drawText(t, { x: drawX, y: yFromTop(cursor), size: 9, font, color: black });
      });
      cursor += 14;
    }
  }

  // ── Disclaimer ──────────────────────────────────────────────────
  ensureSpace(40);
  cursor += 12;
  drawHRule();
  cursor += 10;
  const disclaimer =
    "Tulala reports platform earnings only. Off-platform work declared in Tulala is not included. " +
    "Tax obligations depend on your jurisdiction — this document is informational, not a tax filing.";
  // Word-wrap disclaimer
  const words = disclaimer.split(" ");
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, 8) > CW) {
      drawText(line, { size: 8, color: muted });
      cursor += 12;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    drawText(line, { size: 8, color: muted });
    cursor += 12;
  }

  // ── Serialize ────────────────────────────────────────────────────
  // pdf-lib returns Uint8Array<ArrayBufferLike>; Node.js Response expects
  // BodyInit (ArrayBuffer / BufferSource). Wrapping via Buffer satisfies
  // both the runtime and TS 5.7+ generic-Uint8Array constraint.
  const pdfBytes = Buffer.from(await pdfDoc.save());

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="income-summary-${year}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
