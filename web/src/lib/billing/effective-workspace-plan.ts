/**
 * lib/billing/effective-workspace-plan.ts (TUL-835)
 *
 * Choke point for "which plan do this workspace's gates see right now".
 * `authorize()` (lib/access/has-capability.ts, step 7) passes the stored
 * `agency_plan_tier` through here, so a workspace subscription that stayed
 * past_due beyond the 7-day grace window resolves as `free`.
 *
 * Content is never deleted: only the returned key changes. Fails OPEN: any
 * lookup error keeps the stored plan. No `server-only` so it is unit-testable;
 * callers pass a service-role client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isDunningExpired } from "./dunning-grace";

type Db = Pick<SupabaseClient, "from">;

export async function resolveEffectiveWorkspacePlanKey(
  db: Db,
  tenantId: string,
  storedPlanKey: string,
  now: Date = new Date(),
): Promise<string> {
  try {
    const { data, error } = await db
      .from("workspace_subscriptions")
      .select("status, past_due_since")
      .eq("tenant_id", tenantId)
      .eq("status", "past_due")
      .maybeSingle();
    if (error || !data) return storedPlanKey;
    const row = data as { status: string; past_due_since: string | null };
    return isDunningExpired({ status: row.status, pastDueSince: row.past_due_since, now }) ? "free" : storedPlanKey;
  } catch {
    return storedPlanKey;
  }
}
