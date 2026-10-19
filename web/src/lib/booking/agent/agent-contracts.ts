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

/** The public API rows (shape of `AgentService`), from the contracts. */
export function toAgentApiServices(offerings: readonly TalentOffering[], locale: string): AgentService[] {
  return toAgentContracts(offerings, locale).map(contractToApiService);
}
