import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { mergeHubAndLoose } from "./hub-entry-items";
import { loadPublicHub } from "./public-hub.server";
import { loadWorkspaceRosterServices, type RosterServiceItem } from "./roster-services";

/**
 * TUL-1599: what a workspace's public surfaces list as "roster services": its hub entries
 * (request-only) followed by the loose accepted listings no shown entry contains. An unreadable
 * entries read changes nothing (covered set empty = today's list). Tenant-strict on both reads.
 */
export async function loadRosterServicesWithHub(admin: SupabaseClient, tenantId: string): Promise<RosterServiceItem[]> {
  const [loose, hub] = await Promise.all([loadWorkspaceRosterServices(admin, tenantId), loadPublicHub(admin, tenantId)]);
  return mergeHubAndLoose(hub, loose);
}
