/**
 * Talent income-summary PDF helpers (TUL-1243). Display only: no amount is
 * recomputed beyond summing rows the earnings loader already produced.
 *
 * Pure and client-safe so the year window and the language strings are unit
 * tested without PDF bytes.
 */

import type { TalentEarnings, TalentEarningsRow } from "@/lib/talent/earnings-types";

export type IncomeSummaryLocale = "en" | "es";

export function resolveIncomeSummaryLocale(raw: string | null | undefined): IncomeSummaryLocale {
  return (raw ?? "").trim().toLowerCase().startsWith("es") ? "es" : "en";
}

/** The year asked for, clamped to a sane range; falls back to `fallbackYear`. */
export function resolveIncomeSummaryYear(raw: string | null | undefined, fallbackYear: number): number {
  const n = Number(raw ?? fallbackYear);
  return Number.isFinite(n) && n >= 2020 && n <= 2100 ? Math.trunc(n) : fallbackYear;
}

/**
 * Which date puts a booking in a year. One basis per figure, stated on the PDF:
 *  - "worked": the year the job was WORKED (workDate). Drives the tiles and the booking table.
 *  - "paid": the year the money was PAID OUT (payoutDate). Drives the "paid out" line.
 * A row is on exactly one side of each basis: a December job paid in January is a worked-in-December
 * row and a paid-in-January row; it is never dropped from a basis and never counted twice within one.
 */
export type IncomeSummaryBasis = "worked" | "paid";

function rowInYear(r: TalentEarningsRow, year: number, basis: IncomeSummaryBasis): boolean {
  const date = basis === "paid" ? r.payoutDate : r.workDate;
  return (date ?? "").startsWith(`${year}-`);
}

/** The agency key: tenant id when the row carries it, else the display name (older rows). */
function agencyKey(r: { tenantId?: string | null; agencyName: string }): string {
  return r.tenantId ? `t:${r.tenantId}` : `n:${r.agencyName}`;
}

/**
 * Keeps only the rows on `basis` for `year` and re-sums the tiles and per-agency lines from them, so a
 * 2025 summary never carries 2026 data (the loader only has a lower bound). Row amounts are untouched.
 * Agencies are keyed by tenant id; the display label is carried separately.
 */
export function restrictEarningsToYear(
  earnings: TalentEarnings,
  year: number,
  basis: IncomeSummaryBasis = "worked",
): TalentEarnings {
  const rows: TalentEarningsRow[] = earnings.rows.filter((r) => rowInYear(r, year, basis));
  let gross = 0;
  let net = 0;
  let pending = 0;
  let pipeline = 0;
  const byAgency = new Map<string, { net: number; count: number; last: string | null }>();
  for (const r of rows) {
    gross += r.grossCents;
    net += r.netCents;
    if (r.status === "invoiced" || r.status === "pending") pending += r.netCents;
    else if (r.status === "confirmed") pipeline += r.netCents;
    const key = agencyKey(r);
    const a = byAgency.get(key) ?? { net: 0, count: 0, last: null };
    a.net += r.netCents;
    a.count += 1;
    if (!a.last || r.workDate > a.last) a.last = r.workDate;
    byAgency.set(key, a);
  }
  const perAgency = earnings.perAgency
    .map((p) => {
      const a = byAgency.get(`t:${p.tenantId}`) ?? byAgency.get(`n:${p.name}`);
      return a ? { ...p, ytdNetCents: a.net, bookingsCount: a.count, lastBookingAt: a.last } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((x, y) => y.ytdNetCents - x.ytdNetCents);
  return {
    totals: {
      ytdGrossCents: gross,
      ytdNetCents: net,
      pendingCents: pending,
      confirmedPipelineCents: pipeline,
      currency: earnings.totals.currency,
    },
    perAgency,
    rows,
  };
}

/** Net money PAID OUT in `year` (payout-date basis): paid rows only, each once. */
export function paidOutNetCents(earnings: TalentEarnings, year: number): number {
  return earnings.rows
    .filter((r) => r.status === "paid" && rowInYear(r, year, "paid"))
    .reduce((sum, r) => sum + r.netCents, 0);
}

export type IncomeSummaryStrings = {
  title: (year: number) => string;
  generated: string;
  net: string;
  gross: string;
  pending: string;
  pipeline: string;
  paidOut: (year: number) => string;
  basisNote: string;
  perAgency: string;
  bookingsHeading: string;
  noAgency: string;
  agency: string;
  bookings: string;
  lastBooking: string;
  date: string;
  client: string;
  status: string;
  noBookings: string;
  disclaimer: string;
  numberLocale: string;
  statusLabel: (s: string) => string;
};

const EN: IncomeSummaryStrings = {
  title: (y) => `Income Summary ${y}`,
  generated: "Generated",
  net: "Net",
  gross: "Gross",
  pending: "Pending",
  pipeline: "Pipeline",
  paidOut: (y) => `Paid out in ${y} (by payout date)`,
  basisNote: "Net, gross, pending and pipeline count bookings by the date the work was done.",
  perAgency: "PER AGENCY",
  bookingsHeading: "BOOKINGS",
  noAgency: "No agency earnings in this period.",
  agency: "Agency",
  bookings: "Bookings",
  lastBooking: "Last Booking",
  date: "Date",
  client: "Client",
  status: "Status",
  noBookings: "No bookings in this period.",
  disclaimer:
    "Tulala reports platform earnings only. Off-platform work declared in Tulala is not included. " +
    "Tax obligations depend on your jurisdiction. This document is informational, not a tax filing.",
  numberLocale: "en-US",
  statusLabel: (s) => s,
};

const ES_STATUS: Record<string, string> = {
  paid: "Pagado",
  pending: "Pendiente",
  invoiced: "Programado",
  confirmed: "Confirmado",
};

const ES: IncomeSummaryStrings = {
  title: (y) => `Resumen de ingresos ${y}`,
  generated: "Generado",
  net: "Neto",
  gross: "Bruto",
  pending: "Pendiente",
  pipeline: "Por cobrar",
  paidOut: (y) => `Pagado en ${y} (por fecha de pago)`,
  basisNote: "Neto, bruto, pendiente y por cobrar cuentan las reservas por la fecha en que se hizo el trabajo.",
  perAgency: "POR AGENCIA",
  bookingsHeading: "RESERVAS",
  noAgency: "Sin ingresos de agencias en este periodo.",
  agency: "Agencia",
  bookings: "Reservas",
  lastBooking: "Última reserva",
  date: "Fecha",
  client: "Cliente",
  status: "Estado",
  noBookings: "Sin reservas en este periodo.",
  disclaimer:
    "Tulala informa solo los ingresos de la plataforma. El trabajo fuera de la plataforma declarado en Tulala no se incluye. " +
    "Las obligaciones fiscales dependen de tu jurisdicción. Este documento es informativo, no una declaración de impuestos.",
  numberLocale: "es-MX",
  statusLabel: (s) => ES_STATUS[s] ?? s,
};

export function incomeSummaryStrings(locale: IncomeSummaryLocale): IncomeSummaryStrings {
  return locale === "es" ? ES : EN;
}

/** Whole-unit money in the document language. */
export function formatIncomeMoney(cents: number, currency: string, numberLocale: string): string {
  try {
    return new Intl.NumberFormat(numberLocale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(cents / 100));
  } catch {
    return `${Math.round(cents / 100).toLocaleString()} ${currency}`;
  }
}

/** Generated-on date in the document language (UTC day, no time-of-day noise). */
export function formatIncomeGeneratedDate(d: Date, numberLocale: string): string {
  return new Intl.DateTimeFormat(numberLocale, { dateStyle: "long", timeZone: "UTC" }).format(d);
}
