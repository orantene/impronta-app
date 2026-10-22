import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { toBusinessCatalogServices } from "@/lib/offerings/business-catalog";
import { loadBusinessCatalogOfferings } from "@/lib/offerings/business-catalog.server";

import { loadRosterServicesWithHub } from "./hub-roster.server";
import { ownServicesToRequestItems } from "./requestable-services";
import type { RosterServiceItem } from "./roster-services";

/**
 * TUL-1415 / TUL-1587 · what a guest may ask a workspace for in the front-door chat: its roster
 * services (hub entries + accepted listings), and when it has none, its OWN guest-sellable
 * services (a restaurant's menu, a barber's cuts). Both reads are tenant-strict and the same sell
 * rule as the public catalog; the same list is used to build the request and to re-validate it.
 * Only workspace-owned rows (no talent owner) join, so no talent is named or sold by this path.
 */
export async function loadRequestableServices(admin: SupabaseClient, tenantId: string): Promise<RosterServiceItem[]> {
  const roster = await loadRosterServicesWithHub(admin, tenantId);
  if (roster.length > 0) return roster;
  const load = await loadBusinessCatalogOfferings(admin, { tenantId, hostKind: "agency", profileCode: null, locale: "en" });
  if (load.kind !== "ok") return [];
  const own = load.offerings.filter((o) => !o.talentProfileId);
  return ownServicesToRequestItems(toBusinessCatalogServices(own, "en"));
}
