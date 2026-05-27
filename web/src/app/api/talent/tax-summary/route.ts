// On-demand talent tax/income summary (PR-H, L47).
//
// Server route. Reads `loadTalentEarnings(talentProfileId, { sinceISO })`
// for the requested year and returns a print-friendly HTML income
// summary the talent can save as PDF from the browser. Platform-
// reported earnings only — off-platform self-declared earnings are
// surfaced informationally elsewhere and intentionally never appear
// in this output (legal-exposure reasoning in L47).
//
// Native-PDF rendering (pdf-lib / @react-pdf/renderer) is a follow-up
// once a dependency is sanctioned; the HTML body is structured so a
// future PDF generator can consume the same `loadTalentEarnings`
// source without surface drift.

import { NextResponse } from "next/server";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { loadTalentEarnings } from "@/lib/talent/earnings";

export const dynamic = "force-dynamic";

function eur(cents: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("en-EU", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(cents / 100));
  } catch {
    return `${Math.round(cents / 100).toLocaleString()} ${currency}`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const earnings = await loadTalentEarnings(guard.talentProfile.id, { sinceISO });

  const talentName = escapeHtml(guard.talentProfile.displayName ?? "Talent");
  const profileCode = escapeHtml(guard.talentProfile.profileCode ?? "");
  const totals = earnings.totals;
  const generatedAt = new Date().toISOString();

  const perAgencyRows = earnings.perAgency
    .map((a) => `
      <tr>
        <td>${escapeHtml(a.name)}</td>
        <td class="num">${a.bookingsCount}</td>
        <td class="num">${eur(a.ytdNetCents)}</td>
        <td>${a.lastBookingAt ? escapeHtml(a.lastBookingAt) : "&mdash;"}</td>
      </tr>
    `)
    .join("");

  const bookingRows = earnings.rows
    .map((r) => `
      <tr>
        <td>${escapeHtml(r.workDate)}</td>
        <td>${escapeHtml(r.agencyName)}</td>
        <td>${escapeHtml(r.client)}</td>
        <td class="num">${eur(r.grossCents)}</td>
        <td class="num">${eur(r.netCents)}</td>
        <td>${escapeHtml(r.status)}</td>
      </tr>
    `)
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Income summary ${year} — ${talentName}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    @media print {
      .no-print { display: none !important; }
      body { color: #000; }
    }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: #0B0B0D;
      max-width: 880px;
      margin: 40px auto;
      padding: 24px;
      line-height: 1.45;
    }
    h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.2px; }
    h2 { font-size: 14px; margin: 28px 0 8px; letter-spacing: 0.2px; text-transform: uppercase; color: rgba(11,11,13,0.55); }
    .meta { font-size: 12px; color: rgba(11,11,13,0.55); margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin: 8px 0; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid rgba(24,24,27,0.10); }
    th { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.6px; color: rgba(11,11,13,0.55); }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
    .tile { border: 1px solid rgba(24,24,27,0.10); padding: 10px 12px; border-radius: 8px; }
    .tile .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: rgba(11,11,13,0.55); }
    .tile .value { font-size: 18px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
    .note { background: rgba(11,11,13,0.04); border-left: 3px solid rgba(11,11,13,0.20); padding: 10px 12px; font-size: 12px; color: rgba(11,11,13,0.65); border-radius: 4px; margin: 20px 0; }
    .print-btn { display: inline-block; padding: 8px 14px; background: #0B0B0D; color: #fff; border-radius: 7px; font-size: 13px; text-decoration: none; cursor: pointer; border: none; font-family: inherit; }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 18px;">
    <button class="print-btn" onclick="window.print()">Save as PDF / Print</button>
  </div>

  <h1>Income summary &mdash; ${year}</h1>
  <div class="meta">
    ${talentName}${profileCode ? ` &middot; <span style="font-family: monospace">${profileCode}</span>` : ""}
    &middot; Generated ${escapeHtml(generatedAt)}
  </div>

  <div class="totals">
    <div class="tile"><div class="label">YTD net</div><div class="value">${eur(totals.ytdNetCents, totals.currency)}</div></div>
    <div class="tile"><div class="label">YTD gross</div><div class="value">${eur(totals.ytdGrossCents, totals.currency)}</div></div>
    <div class="tile"><div class="label">Pending</div><div class="value">${eur(totals.pendingCents, totals.currency)}</div></div>
    <div class="tile"><div class="label">Confirmed pipeline</div><div class="value">${eur(totals.confirmedPipelineCents, totals.currency)}</div></div>
  </div>

  <h2>Per agency</h2>
  ${earnings.perAgency.length === 0
    ? '<p style="font-size: 12.5px; color: rgba(11,11,13,0.55)">No agency earnings in this period.</p>'
    : `<table>
        <thead><tr><th>Agency</th><th class="num">Bookings</th><th class="num">Net</th><th>Last booking</th></tr></thead>
        <tbody>${perAgencyRows}</tbody>
      </table>`
  }

  <h2>Bookings</h2>
  ${earnings.rows.length === 0
    ? '<p style="font-size: 12.5px; color: rgba(11,11,13,0.55)">No bookings in this period.</p>'
    : `<table>
        <thead><tr><th>Date</th><th>Agency</th><th>Client</th><th class="num">Gross</th><th class="num">Net</th><th>Status</th></tr></thead>
        <tbody>${bookingRows}</tbody>
      </table>`
  }

  <div class="note">
    Tulala reports your <strong>platform earnings only</strong>. Off-platform
    work you declared in Tulala is not included in this summary. Tax
    obligations on these amounts depend on your jurisdiction &mdash; this
    document is informational and does not constitute a tax filing.
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Talent-specific data; never cache.
      "cache-control": "private, no-store",
    },
  });
}
