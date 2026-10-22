/**
 * TUL-1591 (d) [MONEY]: which currency a hub listing is CHARGED in. Pure, no I/O.
 *
 * Rule (TUL-1365, TUL-1378): the service keeps the talent's currency, the hub only SHOWS
 * the workspace currency (with an approximate line), and the CHARGE is always in the
 * SELLER OF RECORD's currency. Who the seller of record is follows the workspace's model:
 *   - the workspace sells (coordinator agency, friends collective, team studio): the
 *     workspace talks to the client and takes the money;
 *   - the talent sells (open network, rental studio): the talent talks to the client
 *     directly.
 *
 * FAIL CLOSED. The seller's currency must be an explicit, valid ISO code; there is no
 * default, no "" and no fallback to the other party's currency. Every priced amount on
 * the listing (the listing's own currency and the service's currency) must already BE
 * that currency: nothing is converted here, so any mismatch refuses the charge. The fee
 * math is untouched; this only decides whether a charge may happen and in which code.
 *
 * Mirrors `chargeCurrency` in `hub-rules.ts` (#4178, null = refuse) and adds the
 * priced-amount check the checkout needs.
 */
import { normalizeCurrencyCode } from "@/lib/inquiry/offer-currency";

export type SellerOfRecord = "workspace" | "talent";

const WORKSPACE_SELLS: ReadonlySet<string> = new Set(["coordinator_agency", "friends_collective", "team_studio"]);
const TALENT_SELLS: ReadonlySet<string> = new Set(["open_network", "rental_studio"]);

/** The seller of record for a workspace model. null (refuse) for a missing or unknown model. */
export function sellerOfRecordForModel(model: unknown): SellerOfRecord | null {
  if (typeof model !== "string") return null;
  if (WORKSPACE_SELLS.has(model)) return "workspace";
  if (TALENT_SELLS.has(model)) return "talent";
  return null;
}

export type ListingChargeRefusal =
  | "model_unknown"
  | "seller_currency_missing"
  | "listing_currency_missing"
  | "service_currency_missing"
  | "currency_mismatch";

export type ListingChargeCurrency = { ok: true; currency: string; seller: SellerOfRecord } | { ok: false; reason: ListingChargeRefusal };

export function listingChargeCurrency(input: {
  workModel: unknown;
  workspaceCurrency: unknown;
  talentCurrency: unknown;
  listingCurrency: unknown;
  serviceCurrency: unknown;
}): ListingChargeCurrency {
  const seller = sellerOfRecordForModel(input.workModel);
  if (!seller) return { ok: false, reason: "model_unknown" };
  const currency = normalizeCurrencyCode(seller === "workspace" ? input.workspaceCurrency : input.talentCurrency);
  if (!currency) return { ok: false, reason: "seller_currency_missing" };
  const listing = normalizeCurrencyCode(input.listingCurrency);
  if (!listing) return { ok: false, reason: "listing_currency_missing" };
  const service = normalizeCurrencyCode(input.serviceCurrency);
  if (!service) return { ok: false, reason: "service_currency_missing" };
  if (listing !== currency || service !== currency) return { ok: false, reason: "currency_mismatch" };
  return { ok: true, currency, seller };
}

/** Buyer-facing refusal copy (nothing was charged). */
export function listingChargeRefusalMessage(reason: ListingChargeRefusal | "unreadable" | "order_currency", locale: string | null | undefined): string {
  const es = (locale ?? "").toLowerCase().startsWith("es");
  if (reason === "unreadable") {
    return es
      ? "No pudimos confirmar la moneda del cobro. No se cobró nada. Intenta de nuevo en un momento."
      : "We could not confirm the payment currency. Nothing was charged. Try again in a moment.";
  }
  return es
    ? "Este servicio no se puede cobrar en la moneda de quien lo vende. No se cobró nada. Escríbenos para reservarlo."
    : "This service cannot be charged in the seller's currency. Nothing was charged. Message us to book it.";
}
