/**
 * TUL-791 / TUL-794: ONE public price resolver for a catalog offering.
 *
 * The home card, the service page (facts line + related links) and the
 * JSON-LD Offer all read their price from here, so "Desde $500" on the card
 * can never be "550,00 MXN" on the page. The label is the same string the
 * services catalog row paints (`catalogRowPriceText`), and the money is the
 * public catalogue formatter (`formatMoney`).
 *
 * Rule: cheapest variant (or base) drives the figure; more than one variant,
 * or an explicit "from" display, reads "Desde / From"; quote-only reads
 * "A cotizar / Quote"; on-request visibility reads "Bajo consulta / On request".
 */

import type { TalentOffering } from "@/lib/talent/offerings-types";
import { offeringIsQuote } from "@/lib/talent/offerings-types";
import { catalogRowPriceText } from "@/lib/site-admin/builder-node/services-catalog-bar-price";
import {
  catalogRowMinCents,
  catalogRowShowsFrom,
} from "@/components/public-booking/catalog-booking-logic";

/** TUL-805: the one quote-only badge text ("A cotizar" / "Quote") every public surface paints. */
export function quoteOnlyLabel(locale: string): string {
  return locale.toLowerCase().startsWith("es") ? "A cotizar" : "Quote";
}

export type PublicPriceSource = Pick<
  TalentOffering,
  "visibility" | "priceDisplay" | "priceType" | "amountCents" | "currency" | "variants" | "attributes"
>;

export type PublicPriceMode = "on_request" | "quote" | "exact" | "from";

export type PublicPrice = {
  mode: PublicPriceMode;
  /** Figure to state: cheapest variant or base. null for quote / on request. */
  cents: number | null;
  currency: string;
  /** The exact string every public surface shows. */
  text: string;
};

/** Loose input so callers holding a partial shape (service page, JSON-LD) can resolve too. */
export type PublicPriceInput = {
  visibility?: string | null;
  priceDisplay?: string | null;
  priceType?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  variants?: PublicPriceSource["variants"];
  attributes?: PublicPriceSource["attributes"];
};

function normalise(o: PublicPriceInput): PublicPriceSource {
  return {
    visibility: (o.visibility ?? "public") as PublicPriceSource["visibility"],
    priceDisplay: (o.priceDisplay ?? "exact") as PublicPriceSource["priceDisplay"],
    priceType: (o.priceType ?? "flat_package") as PublicPriceSource["priceType"],
    amountCents: o.amountCents ?? null,
    currency: o.currency ?? "USD",
    variants: o.variants ?? [],
    attributes: o.attributes ?? {},
  };
}

export function resolvePublicPrice(o: PublicPriceInput, locale: string): PublicPrice {
  const src = normalise(o);
  const text = catalogRowPriceText(src, locale);
  if (src.visibility === "on_request") {
    return { mode: "on_request", cents: null, currency: src.currency, text };
  }
  const min = catalogRowMinCents(src);
  if (offeringIsQuote(src) || min == null) {
    return { mode: "quote", cents: null, currency: src.currency, text };
  }
  return {
    mode: catalogRowShowsFrom(src) ? "from" : "exact",
    cents: min,
    currency: src.currency,
    text,
  };
}

/**
 * The amount + display JSON-LD should state for this offering: the same
 * cheapest figure, "from" whenever the visible label says "Desde".
 */
export function publicPriceForJsonLd(o: PublicPriceInput): {
  amountCents: number | null;
  priceDisplay: "exact" | "from" | "quote";
} {
  const p = resolvePublicPrice(o, "en");
  if (p.mode === "exact") return { amountCents: p.cents, priceDisplay: "exact" };
  if (p.mode === "from") return { amountCents: p.cents, priceDisplay: "from" };
  return { amountCents: null, priceDisplay: "quote" };
}
