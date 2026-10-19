/**
 * TUL-21: the service list an outside AI assistant sees. Pure — the server
 * side loads the talent's public offerings and hands them in.
 *
 * Only what the public site already shows: published, public, not a product.
 * Prices are the storefront's own label so an assistant quotes the same text
 * a person reads on the page.
 */

import { offeringIsQuote, offeringPriceLabel, type TalentOffering } from "@/lib/talent/offerings-types";

export type AgentService = {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  /** The storefront label, e.g. "$550 MXN / session" or "Quote on request". */
  price: string;
  amount_cents: number | null;
  currency: string;
  /** False when the talent's switches leave this service no public route. */
  bookable: boolean;
};

const DESCRIPTION_MAX = 280;
export const AGENT_SERVICES_MAX = 40;

function shortDescription(raw: string | null): string | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > DESCRIPTION_MAX ? `${text.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…` : text;
}

export function toAgentServices(offerings: readonly TalentOffering[], locale: string): AgentService[] {
  return offerings
    .filter((o) => o.visibility === "public" && o.kind !== "product")
    .slice(0, AGENT_SERVICES_MAX)
    .map((o) => ({
      id: o.id,
      title: o.title,
      description: shortDescription(o.description),
      duration_minutes: typeof o.durationMinutes === "number" && o.durationMinutes > 0 ? o.durationMinutes : null,
      price: offeringPriceLabel(o, locale),
      // D-10a: a hidden price (quote / on request) must not leak as a raw figure either.
      amount_cents: o.visibility === "on_request" || offeringIsQuote(o) ? null : o.amountCents,
      currency: o.currency,
      bookable: o.publicCtaHidden !== true,
    }));
}
