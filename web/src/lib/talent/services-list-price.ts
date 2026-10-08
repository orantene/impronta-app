import { formatDashboardMoney, formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { SERVICE_PRICING_SUFFIX } from "@/lib/talent/services-menu-types";

/**
 * The price cell on a Services list row. Three honest states, matching the
 * Services home design: a quoted item says Quoted, an item that simply has
 * no amount yet says No price yet (it needs attention), anything else shows
 * the amount.
 */
export type ListPriceState = "quote" | "unset" | "amount";

export function listPriceState(
  item: Pick<TalentOffering, "amountCents" | "priceDisplay">,
): ListPriceState {
  if (item.priceDisplay === "quote") return "quote";
  if (item.amountCents == null) return "unset";
  return "amount";
}

export function listPrice(
  item: Pick<TalentOffering, "amountCents" | "priceDisplay" | "currency">,
  quoted: string,
  noPrice?: string,
  locale: string = "en",
): string {
  const state = listPriceState(item);
  if (state === "quote") return quoted;
  if (state === "unset" || item.amountCents == null) return noPrice ?? quoted;
  // DS-17: the one dashboard money format ("$300 MXN"), whole units like before.
  return formatDashboardMoney(item.amountCents / 100, item.currency, locale, { wholeUnits: true });
}

/**
 * Dashboard-side offering price line (TUL-336 / DS-17 follow-up).
 * Same states as public `offeringPriceLabel`, but amounts use
 * `formatDashboardMoney` so Services / Agenda / catalog match Today + Money.
 * Public storefront keeps `offeringPriceLabel` → `formatOfferingPrice`.
 */
export function dashboardOfferingPriceLabel(
  o: Pick<TalentOffering, "priceType" | "priceDisplay" | "amountCents" | "currency" | "visibility">,
  locale: string,
): string {
  const es = locale === "es" || locale.toLowerCase().startsWith("es");
  if (o.visibility === "on_request") return es ? "Bajo consulta" : "On request";
  if (o.priceDisplay === "quote" || o.priceType === "custom" || o.amountCents == null) {
    return es ? "Cotización a pedido" : "Quote on request";
  }
  const price = formatDashboardMoneyCents(o.amountCents, o.currency, locale);
  const suffix = SERVICE_PRICING_SUFFIX[o.priceType];
  const core = suffix ? `${price} ${suffix}` : price;
  return o.priceDisplay === "from" ? (es ? `desde ${core}` : `from ${core}`) : core;
}
