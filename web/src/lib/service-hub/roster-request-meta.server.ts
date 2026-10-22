import "server-only";

/**
 * TUL-1415 / TUL-1587 · server side of the front-door roster request: turns what the guest chat
 * proposed into the metadata stored on the message. The tenant is the inquiry's (host-resolved),
 * the lines are re-validated against the tenant-strict roster reader, and a hub never has a roster.
 * Fails closed to "plain message" (null) so a guest's text is never lost.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import { loadRosterServicesWithHub } from "./hub-roster.server";
import { rosterRequestMetadata, sanitizeRosterRequestWire } from "./roster-request-meta";

export async function resolveRosterRequestMetadata(
  admin: SupabaseClient,
  tenantId: string,
  raw: unknown,
): Promise<Record<string, unknown> | undefined> {
  if (raw == null) return undefined;
  try {
    const { data: agency, error } = await admin.from("agencies").select("kind").eq("id", tenantId).maybeSingle();
    if (error) throw error;
    if (!agency || (agency as { kind?: string | null }).kind === "hub") return undefined;
    const items = await loadRosterServicesWithHub(admin, tenantId);
    return rosterRequestMetadata(sanitizeRosterRequestWire(raw, items));
  } catch (err) {
    logServerError("roster-request-meta.resolve", err);
    return undefined;
  }
}
