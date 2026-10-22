/**
 * TUL-36 slice 2: the READ-ONLY quote tool. Pure core, no I/O, no money movement.
 *
 * The price is NEVER a model number. It is computed from catalog rows with the same
 * `pricePurchase` the checkout uses, so a quote can never differ from what checkout would
 * charge. The tool creates nothing: no order, no hold, no link.
 *
 * Rules:
 *  - a service is quotable only when `isSellable(row, "guest_request")` (published +
 *    approved + public or on_request) and, on an agency host, it belongs to THAT workspace;
 *    anything else answers like an unknown service (nothing about it is revealed);
 *  - `bookable` says whether a guest could actually buy it (`isSellable(row, "guest")`),
 *    so the assistant never offers to book a request-only service;
 *  - on_request, custom-priced, optioned (variants) or currency-less services give NO
 *    number: a person confirms the price;
 *  - units are clamped 1..20.
 */
import { isSellable } from "@/lib/offerings/sellable";
import type { Catalog } from "@/lib/orders/purchase-catalog";
import { pricePurchase } from "@/lib/orders/purchase-pricing";
import { formatMoney } from "@/lib/talent/offerings-money";

export const QUOTE_MAX_UNITS = 20;

export type QuoteInput = {
  offeringId: string;
  units?: number | null;
  /** Agency host: the host's tenant. null for talent-site / hub / platform (all public). */
  catalogTenantId: string | null;
  locale: string;
};

export type QuoteResult =
  | {
      kind: "quote";
      title: string;
      units: number;
      unitCents: number;
      totalCents: number;
      currency: string;
      priceLabel: string;
      /** a guest could buy it online (published + approved + public) */
      bookable: boolean;
    }
  | { kind: "needs_person"; title: string; reason: "price_on_request" | "options" | "not_fixed_price" | "no_currency" | "amount_out_of_range" }
  | { kind: "handoff"; reason: "unknown_service" | "unsure" };

export function clampQuoteUnits(units: number | null | undefined): number {
  if (typeof units !== "number" || !Number.isFinite(units)) return 1;
  return Math.min(QUOTE_MAX_UNITS, Math.max(1, Math.floor(units)));
}

export function quoteFromCatalog(catalog: Catalog, input: QuoteInput): QuoteResult {
  if (!catalog.ok) return { kind: "handoff", reason: "unsure" };
  const id = input.offeringId;
  const policy = catalog.policies.get(id);
  const raw = catalog.rawOfferings.get(id);
  const offering = catalog.offerings.get(id);
  if (!policy || !raw || !offering) return { kind: "handoff", reason: "unknown_service" };
  // Workspace scope: a service of another workspace is unknown here.
  if (input.catalogTenantId && policy.tenantId !== input.catalogTenantId) return { kind: "handoff", reason: "unknown_service" };
  const row = { status: policy.status, moderation_state: raw.moderationState, visibility: raw.visibility };
  if (!isSellable(row, "guest_request")) return { kind: "handoff", reason: "unknown_service" };

  const title = offering.label.trim() || "Service";
  if (raw.visibility === "on_request") return { kind: "needs_person", title, reason: "price_on_request" };
  if ([...catalog.variants.values()].some((v) => v.offeringId === id)) return { kind: "needs_person", title, reason: "options" };
  const currency = (offering.currency ?? "").trim().toUpperCase();
  if (!currency) return { kind: "needs_person", title, reason: "no_currency" };

  const units = clampQuoteUnits(input.units);
  const priced = pricePurchase([{ offeringId: id, units }], {
    offerings: catalog.offerings,
    variants: catalog.variants,
    addons: catalog.addons,
  });
  if (!priced.ok) {
    return { kind: "needs_person", title, reason: priced.reason === "amount_out_of_range" ? "amount_out_of_range" : "not_fixed_price" };
  }
  const line = priced.lines[0];
  if (!line || line.totalCents <= 0) return { kind: "needs_person", title, reason: "not_fixed_price" };
  return {
    kind: "quote",
    title,
    units,
    unitCents: line.unitCents,
    totalCents: line.totalCents,
    currency,
    priceLabel: formatMoney(line.totalCents, currency, input.locale),
    bookable: isSellable(row, "guest"),
  };
}

const isEs = (locale: string) => locale.toLowerCase().startsWith("es");

/**
 * Guest-facing text for a result. Deterministic: the number in the reply is the computed
 * one, never text the model wrote.
 */
export function quoteReplyText(result: QuoteResult, locale: string, units: number): string {
  const es = isEs(locale);
  if (result.kind === "quote") {
    const qty = units > 1 ? `${units} x ` : "";
    return es
      ? `${qty}${result.title}: ${result.priceLabel}.${result.bookable ? "" : " Una persona del equipo confirma la reserva."}`
      : `${qty}${result.title}: ${result.priceLabel}.${result.bookable ? "" : " A person on the team confirms the booking."}`;
  }
  if (result.kind === "needs_person") {
    return es
      ? `El precio de ${result.title} lo confirma una persona del equipo en este chat.`
      : `A person on the team will confirm the price of ${result.title} in this chat.`;
  }
  return es ? "Una persona del equipo lo toma desde aquí y te responde en este chat." : "A person on the team will take it from here and reply in this chat.";
}
