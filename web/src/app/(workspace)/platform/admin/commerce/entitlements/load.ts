import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  buildEntitlementMatrix,
  type EntitlementMatrix,
  type EntitlementRow,
} from "@/lib/access/entitlement-matrix";

/**
 * Read every stored packaging decision.
 *
 * Returns null on failure rather than an empty matrix. "The read broke" and
 * "nobody has packaged anything" look identical once you flatten them both to
 * zero rows, and this surface exists precisely to keep a decision
 * distinguishable from its absence.
 */
export async function loadEntitlementMatrix(): Promise<EntitlementMatrix | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("plan_capabilities")
      .select("plan_key, capability_key, included, note");
    if (error || !data) {
      logServerError("commerce.entitlements.load", error);
      return null;
    }
    const rows: EntitlementRow[] = (
      data as {
        plan_key: string;
        capability_key: string;
        included: boolean;
        note: string | null;
      }[]
    ).map((r) => ({
      planKey: r.plan_key,
      capabilityKey: r.capability_key,
      included: r.included,
      note: r.note,
    }));
    return buildEntitlementMatrix(rows);
  } catch (err) {
    logServerError("commerce.entitlements.load", err);
    return null;
  }
}
