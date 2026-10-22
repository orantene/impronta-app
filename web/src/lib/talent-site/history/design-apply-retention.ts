/**
 * TUL-527: retention for `design_apply` history snapshots.
 *
 * Every design switch stores the full PRIOR draft in `snapshot_ref`. Switching
 * A to B to C to D ... would grow that data without bound, so after each
 * design_apply write the site keeps only its newest N snapshot rows and the
 * server action clears the payload of the older ones: `snapshot_ref` is set to null
 * and `undoable` to false, so the timeline entry stays but its Undo is gone (the
 * timeline reads `undoable`; the undo action also refuses a row with no snapshot).
 * Scoped by site_id, talent_profile_id and kind (never a bare id write); every
 * query error is checked and logged. A failed
 * prune never fails the apply that already landed: it is retried on the next one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

/** How many design_apply snapshots one site keeps. */
export const DESIGN_APPLY_SNAPSHOT_KEEP = 10;

/** Max rows cleared in one prune (bounds the work if a site is far over the cap). */
const PRUNE_BATCH = 200;

export type PruneDesignApplyResult = { ok: true; cleared: number } | { ok: false };

export async function pruneDesignApplySnapshots(
  admin: SupabaseClient,
  input: { siteId: string; talentProfileId: string; keep?: number },
): Promise<PruneDesignApplyResult> {
  const keep = Math.max(1, Math.floor(input.keep ?? DESIGN_APPLY_SNAPSHOT_KEEP));
  const { data, error } = await admin
    .from("talent_site_history")
    .select("id")
    .eq("site_id", input.siteId)
    .eq("talent_profile_id", input.talentProfileId)
    .eq("kind", "design_apply")
    .not("snapshot_ref", "is", null)
    .order("at", { ascending: false })
    .order("id", { ascending: false })
    .range(keep, keep + PRUNE_BATCH - 1);
  if (error) {
    logServerError("talentSiteHistory.pruneDesignApply.select", error);
    return { ok: false };
  }
  const ids = ((data ?? []) as Array<{ id?: string }>)
    .map((r) => r.id)
    .filter((v): v is string => typeof v === "string");
  if (ids.length === 0) return { ok: true, cleared: 0 };
  const { error: delErr } = await admin
    .from("talent_site_history")
    .update({ snapshot_ref: null, undoable: false })
    .in("id", ids)
    .eq("site_id", input.siteId)
    .eq("talent_profile_id", input.talentProfileId)
    .eq("kind", "design_apply");
  if (delErr) {
    logServerError("talentSiteHistory.pruneDesignApply.clear", delErr);
    return { ok: false };
  }
  return { ok: true, cleared: ids.length };
}
