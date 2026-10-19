import { addUtcDays, isValidIanaTimeZone, utcToZonedYmd, zonedLocalToUtc } from "@/lib/scheduling/tz";

/**
 * Sales board filters read from the URL: period, payment method and view.
 * Pure: the loaders apply them, the page only parses and links.
 */

export const SALES_PERIODS = ["all", "today", "7d", "30d", "month"] as const;
export type SalesPeriod = (typeof SALES_PERIODS)[number];

export function parseSalesPeriod(raw: string | undefined | null): SalesPeriod {
  return (SALES_PERIODS as readonly string[]).includes(raw ?? "") ? (raw as SalesPeriod) : "all";
}

export const SALES_METHODS = ["any", "cash", "card", "online", "other"] as const;
export type SalesMethod = (typeof SALES_METHODS)[number];

export function parseSalesMethod(raw: string | undefined | null): SalesMethod {
  return (SALES_METHODS as readonly string[]).includes(raw ?? "") ? (raw as SalesMethod) : "any";
}

export const SALES_VIEWS = ["activity", "items"] as const;
export type SalesView = (typeof SALES_VIEWS)[number];

export function parseSalesView(raw: string | undefined | null): SalesView {
  return raw === "items" ? "items" : "activity";
}

/** `from` inclusive, `to` exclusive, both ISO instants; `null` is unbounded. */
export type SalesRange = { from: string | null; to: string | null };

/**
 * The instants a period covers on the WORKSPACE's clock (local midnight, not
 * the server's). An unusable zone falls back to UTC so a bad setting widens
 * nothing and throws nothing.
 */
export function salesPeriodRange(period: SalesPeriod, now: Date, timeZone: string): SalesRange {
  if (period === "all") return { from: null, to: null };
  const zone = isValidIanaTimeZone(timeZone) ? timeZone : "UTC";
  const today = utcToZonedYmd(now, zone);
  if (!today) return { from: null, to: null };
  let startYmd = today;
  if (period === "7d") startYmd = addUtcDays(today, -6) ?? today;
  else if (period === "30d") startYmd = addUtcDays(today, -29) ?? today;
  else if (period === "month") startYmd = `${today.slice(0, 7)}-01`;
  const from = zonedLocalToUtc(startYmd, 0, zone, { gap: "next" });
  return { from: from ? from.toISOString() : null, to: null };
}

export function inSalesRange(iso: string, range: SalesRange): boolean {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return false;
  if (range.from && at < new Date(range.from).getTime()) return false;
  if (range.to && at >= new Date(range.to).getTime()) return false;
  return true;
}
