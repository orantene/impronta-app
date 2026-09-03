/**
 * store.ts — reading and writing a venue's service windows and rules.
 *
 * All reservation persistence lives here, never in a "use server" file: the
 * tenant-scoping ratchet rejects a raw `.from()` there, and it is right to —
 * one module owning these tables means no caller can reach them another way.
 * Same rule Spaces & Seating follow for `lib/spaces/`.
 *
 * WHAT THIS MODULE DOES NOT DO
 * It does not read availability. Remaining units come from
 * `capacity_remaining_public`, called directly — it already returns the
 * tightest answer across the whole ancestor chain, so a table inside a
 * bought-out room reports zero without the caller knowing a tree exists.
 * Routing that through Spaces would make them a wrapper, and re-deriving the
 * ancestor rule here would be a second implementation of someone else's
 * invariant, free to drift from it.
 *
 * It also does not create a venue, a space or a group. Those are the Spaces &
 * Seating Manager's, and a `space_groups` row in `sell_mode='band'` is read
 * here only to learn which party sizes a venue can seat.
 */

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { parseServiceRules } from "./rules";
import { intOrNull, rowToException, rowToWindow } from "./rows";
import type { PartyBand } from "./availability";
import type { ServiceRules, ServiceWindow, ServiceWindowException } from "./types";

export type VenueServiceConfig = {
  rules: ServiceRules;
  windows: ServiceWindow[];
  exceptions: ServiceWindowException[];
  bands: PartyBand[];
};

/**
 * Everything the book and the public page need for one venue.
 *
 * A venue with no rules row is not an error: it is a venue that has not turned
 * reservations on, and `parseServiceRules({})` says exactly that with
 * `isActive: false`. The caller shows the setup prompt, not an error page.
 */
export async function loadVenueServiceConfig(
  tenantId: string,
  venueId: string,
  opts: { fromDate?: string; toDate?: string } = {},
): Promise<VenueServiceConfig | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;

  try {
    const [rulesRes, windowsRes, groupsRes] = await Promise.all([
      sb
        .from("venue_service_rules")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("venue_id", venueId)
        .maybeSingle(),
      sb
        .from("venue_service_windows")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("venue_id", venueId)
        .order("sort_order", { ascending: true }),
      sb
        .from("space_groups")
        .select("id, name, party_min, party_max, kind, sell_mode")
        .eq("tenant_id", tenantId)
        .eq("venue_id", venueId)
        .eq("kind", "party_band")
        .eq("sell_mode", "band"),
    ]);

    if (rulesRes.error) {
      logServerError("reservations.store.loadRules", rulesRes.error);
      return null;
    }
    if (windowsRes.error) {
      logServerError("reservations.store.loadWindows", windowsRes.error);
      return null;
    }
    if (groupsRes.error) {
      logServerError("reservations.store.loadGroups", groupsRes.error);
      return null;
    }

    let exceptions: ServiceWindowException[] = [];
    if (opts.fromDate && opts.toDate) {
      const exRes = await sb
        .from("venue_service_window_exceptions")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("venue_id", venueId)
        .gte("on_date", opts.fromDate)
        .lte("on_date", opts.toDate);
      if (exRes.error) {
        // An exception we cannot read is a closure we might miss, so this fails
        // the whole load rather than quietly returning a venue that looks open
        // on a day it is shut.
        logServerError("reservations.store.loadExceptions", exRes.error);
        return null;
      }
      exceptions = (exRes.data ?? [])
        .map(rowToException)
        .filter((e): e is ServiceWindowException => e !== null);
    }

    const bands: PartyBand[] = [];
    for (const g of groupsRes.data ?? []) {
      const poolId = await poolIdForGroup(sb, tenantId, g.id as string);
      // A band with no pool cannot be sold against. Skipping it is correct and
      // visible in the editor; inventing a pool id would offer a table that no
      // reserve could ever claim.
      if (poolId === null) continue;
      bands.push({
        groupId: g.id as string,
        poolId,
        name: (g.name as string) ?? "",
        partyMin: intOrNull(g.party_min) ?? 1,
        partyMax: intOrNull(g.party_max) ?? 1,
      });
    }

    return {
      rules: parseServiceRules(rulesRes.data, venueId),
      windows: (windowsRes.data ?? [])
        .map(rowToWindow)
        .filter((w): w is ServiceWindow => w !== null),
      exceptions,
      bands,
    };
  } catch (err) {
    logServerError("reservations.store.loadVenueServiceConfig", err);
    return null;
  }
}

/** The capacity pool bound to a band group, or null when it has none. */
async function poolIdForGroup(
  sb: ReturnType<typeof createServiceRoleClient>,
  tenantId: string,
  groupId: string,
): Promise<string | null> {
  if (!sb) return null;
  const { data, error } = await sb
    .from("capacity_pools")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("subject_kind", "space_group")
    .eq("subject_id", groupId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    logServerError("reservations.store.poolIdForGroup", error);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}
