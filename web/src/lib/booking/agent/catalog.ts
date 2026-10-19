/**
 * TUL-21: the service list an outside AI assistant sees. Pure — the server
 * side loads the talent's public offerings and hands them in.
 *
 * Only what the public site already shows: published, public, not a product.
 * Prices are the storefront's own label so an assistant quotes the same text
 * a person reads on the page.
 */

import { buildOfferingContract, contractToApiService, type OfferingContract } from "@/lib/offerings/contract";
import type { TalentOffering } from "@/lib/talent/offerings-types";

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

export const AGENT_SERVICES_MAX = 40;

/** The contracts behind the list: public, not a product, capped. */
export function toAgentContracts(
  offerings: readonly TalentOffering[],
  locale: string,
  ctx: { providerName?: string | null; pageUrl?: (o: TalentOffering) => string | null } = {},
): OfferingContract[] {
  return offerings
    .filter((o) => o.visibility === "public" && o.kind !== "product")
    .slice(0, AGENT_SERVICES_MAX)
    .map((o) => buildOfferingContract(o, { locale, providerName: ctx.providerName, url: ctx.pageUrl?.(o) ?? null }));
}

export function toAgentServices(offerings: readonly TalentOffering[], locale: string): AgentService[] {
  // F2: each row is a projection of the offering contract, the same record the
  // page, JSON-LD, markdown and llms.txt read, so the API never states a price
  // or a description the page does not (D-10a: no figure for on request or quote).
  return toAgentContracts(offerings, locale).map(contractToApiService);
}
