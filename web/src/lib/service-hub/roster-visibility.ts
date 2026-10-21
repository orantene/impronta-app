import type { SupabaseClient } from "@supabase/supabase-js";

import { isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";

import { pickVisibleWithinCap } from "./hub-rules";

/**
 * TUL-1378: over its plan cap, which roster talents stay publicly visible. The OWNER picks
 * (`agency_talent_roster.keep_visible`, TUL-1693), then the longest-standing members. The rest are
 * hidden from the public directory, never removed (`pickVisibleWithinCap`).
 *
 * TUL-1693: the pick is its own column, never `agency_visibility = 'featured'` (featured is also a
 * theme badge). Until the keep_visible migration is applied, the read falls back to today's
 * behaviour, where 'featured' is the pick.
 *
 * Returns the visible ids, or null when no restriction applies (unlimited, within the cap, or the
 * read failed, in which case the directory keeps its existing position-based cap).
 */
export async function visibleRosterIdsWithinCap(
  supabase: Pick<SupabaseClient, "from">,
  tenantId: string,
  rosterIds: readonly string[],
  cap: number | null,
  env: Record<string, string | undefined> = process.env,
): Promise<string[] | null> {
  // OFF by default: this changes the live public directory for every over-cap workspace,
  // so until HUB_PLAN_CAP_PICKS_ENABLED=1 the directory keeps today's position-based cap.
  if (env.HUB_PLAN_CAP_PICKS_ENABLED !== "1") return null;
  if (cap == null || rosterIds.length <= cap) return null;
  const read = (withPick: boolean) =>
    supabase
      .from("agency_talent_roster")
      .select(`talent_profile_id, agency_visibility, ${withPick ? "keep_visible, " : ""}added_at`)
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("talent_profile_id", [...rosterIds]);
  let usePickColumn = true;
  let { data, error } = await read(true);
  if (error && isPostgrestMissingColumnError(error)) {
    // keep_visible not migrated yet (TUL-1693): today's behaviour, 'featured' is the pick.
    usePickColumn = false;
    ({ data, error } = await read(false));
  }
  if (error) {
    logServerError("serviceHub.rosterVisibility", error);
    return null;
  }
  const rows = (data ?? []) as unknown as Array<{ talent_profile_id: string; agency_visibility: string | null; keep_visible?: boolean | null; added_at: string | null }>;
  const byId = new Map(rows.map((r) => [r.talent_profile_id, r]));
  // Start from the roster ids we were given: an id the query did not return is still on the
  // roster. It competes as an unpinned person with an unknown join date (last in line), so it
  // can fill a free seat and is never silently dropped.
  const picked = pickVisibleWithinCap(
    [...new Set(rosterIds)].map((id) => {
      const r = byId.get(id);
      const pinned = usePickColumn ? r?.keep_visible === true : r?.agency_visibility === "featured";
      return { id, pinned, joinedAt: r?.added_at ?? null };
    }),
    cap,
  );
  return picked.visibleIds;
}
