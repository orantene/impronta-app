import { minorUnitDivisor } from "@/lib/orders/money-format";
import type { SalesItemRow } from "./by-item";

/** Excel needs a BOM to read UTF-8 accents (Spanish item names). */
export const CSV_BOM = "﻿";

/**
 * One CSV cell. Text starting with = + - @ (or tab / CR) is prefixed with an
 * apostrophe so a spreadsheet never runs it as a formula; then quoted when it
 * holds a comma, quote or newline. Numbers are written as numbers, unguarded.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Minor units as a plain decimal (no symbol, no grouping), by integer math. */
export function plainAmount(cents: number, currency: string): string {
  const divisor = minorUnitDivisor(currency || "USD");
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  if (divisor === 1) return `${sign}${abs}`;
  return `${sign}${Math.floor(abs / divisor)}.${String(abs % divisor).padStart(2, "0")}`;
}

/**
 * The sales-by-item export: BOM, CRLF rows. Amounts are plain decimals (an
 * amount column is text on purpose: it keeps the stored precision and a
 * negative net is not mistaken for a formula). `headers` come already
 * translated: Item, Quantity, Gross, Refunded, Net, Orders, Currency.
 */
export function salesByItemCsv(rows: readonly SalesItemRow[], headers: readonly string[]): string {
  const line = (cells: Array<string | number | null>) => `${cells.map(csvCell).join(",")}\r\n`;
  let out = CSV_BOM + line([...headers]);
  for (const r of rows) {
    out += [
      csvCell(r.title),
      csvCell(r.quantity),
      plainAmount(r.grossCents, r.currency),
      plainAmount(r.refundedCents, r.currency),
      plainAmount(r.netCents, r.currency),
      csvCell(r.orderCount),
      csvCell(r.currency),
    ].join(",") + "\r\n";
  }
  return out;
}
