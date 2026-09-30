import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadSiteRev } from "@/lib/talent-site/history/history.server";

/** A publish this recent, at the same draft rev, is a double submit. */
export const DUPLICATE_PUBLISH_WINDOW_MS = 120_000;

/**
 * Pure: is a publish at `currentRev` a repeat of the last publish? Same draft
 * rev means no edit landed since (every draft write bumps the rev), and the
 * window keeps an old, unrelated publish from ever swallowing a real one.
 */
export function isDuplicatePublish(
  last: { draftRev: number | null; at: string } | null,
  currentRev: number,
  now: number = Date.now(),
): boolean {
  if (!last || last.draftRev === null || last.draftRev !== currentRev) return false;
  const at = Date.parse(last.at);
  return Number.isFinite(at) && now - at >= 0 && now - at <= DUPLICATE_PUBLISH_WINDOW_MS;
}

/**
 * F104 - server-side idempotency for the builder publish: when the latest
 * `publish` history entry is at the current draft rev (and recent), return it
 * so the caller skips the second publish and the second history entry.
 */
export async function findDuplicatePublish(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<{ publishedAt: string; draftRev: number } | null> {
  const site = await loadSiteRev(admin, talentProfileId);
  if (!site) return null;
  const { data, error } = await admin
    .from("talent_site_history")
    .select("draft_rev, last_at")
    .eq("site_id", site.siteId)
    .eq("kind", "publish")
    .order("last_at", { ascending: false })
    .limit(1);
  if (error) return null;
  const row = ((data ?? []) as Array<{ draft_rev: number | null; last_at: string }>)[0];
  if (!row) return null;
  return isDuplicatePublish({ draftRev: row.draft_rev, at: row.last_at }, site.draftRev)
    ? { publishedAt: row.last_at, draftRev: site.draftRev }
    : null;
}
