import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * TUL-1940: pull `talent_discover_index` forward when a talent's listing
 * changes instead of waiting for the cron. Defence in depth only: readers
 * already live-gate against talent_profiles, so this just keeps the rich
 * fields (and facet counts) fresh.
 *
 * Safe path: service role calls the existing SECURITY DEFINER
 * `refresh_talent_discover_index()` (REFRESH ... CONCURRENTLY, granted to
 * service_role) after the response, best effort, coalesced per instance so a
 * burst of edits costs one refresh. Never throws; a failure just leaves the
 * cron to catch up.
 */
export const DISCOVER_REFRESH_COALESCE_MS = 15_000;

let lastRequestedAt = 0;

export function resetDiscoverRefreshCoalesceForTests(): void {
  lastRequestedAt = 0;
}

export async function runDiscoverIndexRefresh(): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return;
    const { error } = await admin.rpc("refresh_talent_discover_index");
    if (error) logServerError("directory/request-discover-index-refresh", error);
  } catch (e) {
    logServerError("directory/request-discover-index-refresh", e);
  }
}

export function requestDiscoverIndexRefresh(now: number = Date.now()): boolean {
  if (now - lastRequestedAt < DISCOVER_REFRESH_COALESCE_MS) return false;
  lastRequestedAt = now;
  try {
    after(runDiscoverIndexRefresh);
    return true;
  } catch {
    // Outside a request scope (scripts/tests): nothing to defer to; skip.
    return false;
  }
}
