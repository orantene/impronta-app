/**
 * F2: the AI-assistant service list as projections of the offering contract.
 * Pure. Same filter as the original list (public, not a product, capped), but
 * every row is built from the one contract record the page, JSON-LD, markdown
 * and llms.txt also read.
 */
import {
  buildOfferingContract,
  contractToApiService,
  type OfferingContract,
} from "@/lib/offerings/contract";
import type { TalentOffering } from "@/lib/talent/offerings-types";

import { AGENT_SERVICES_MAX, type AgentService } from "./catalog";

/**
 * The contracts behind the LISTINGS (llms.txt Services, markdown): public and
 * on_request services, not products, capped. D-10a: an on_request service is
 * listed with its price withheld (the contract carries no figure for it).
 * TODO(#4094): replace the inline visibility check with its single sellable rule once it lands.
 */
export function toAgentContracts(
  offerings: readonly TalentOffering[],
  locale: string,
  ctx: { providerName?: string | null; pageUrl?: (o: TalentOffering) => string | null } = {},
): OfferingContract[] {
  return offerings
    .filter((o) => (o.visibility === "public" || o.visibility === "on_request") && o.kind !== "product")
    .slice(0, AGENT_SERVICES_MAX)
    .map((o) => buildOfferingContract(o, { locale, providerName: ctx.providerName, url: ctx.pageUrl?.(o) ?? null }));
}

/** The public API rows (shape of `AgentService`), from the contracts. */
export function toAgentApiServices(offerings: readonly TalentOffering[], locale: string): AgentService[] {
  // The API list is the bookable one: an on_request service has no instant route, so it is a listing only.
  return toAgentContracts(offerings, locale)
    .filter((c) => c.guestSellable)
    .map(contractToApiService);
}
