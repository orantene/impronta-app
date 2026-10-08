// TUL-231 — IO: which talent profiles are completed, anonymised, expired
// deletions. A failed read returns ok:false and the caller releases NOTHING.

import type { SupabaseClient } from "@supabase/supabase-js";

import { DELETED_USER_LABEL } from "@/lib/account/anonymize";
import { DEFAULT_GRACE_DAYS } from "@/lib/media/reap-orphaned-media";
import { eligibleDeletedTalentIds, type DeletedTalentCandidate } from "@/lib/media/deleted-account-prefixes";

const PAGE_SIZE = 1000;
/** Bounded: at most this many pages per run. Stopping early only releases LESS. */
const MAX_PAGES = 10;

export type DeletedTalentIdsResult =
  | { ok: true; ids: Set<string>; truncated: boolean }
  | { ok: false; error: string };

export async function loadEligibleDeletedTalentIds(
  admin: SupabaseClient,
  now: Date,
  graceDays: number = DEFAULT_GRACE_DAYS,
): Promise<DeletedTalentIdsResult> {
  const cutoffIso = new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000).toISOString();
  const rows: DeletedTalentCandidate[] = [];
  let truncated = false;
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) {
      truncated = true;
      break;
    }
    const from = page * PAGE_SIZE;
    const { data, error } = await admin
      .from("talent_profiles")
      .select("id, display_name, deleted_at")
      .eq("display_name", DELETED_USER_LABEL)
      .not("deleted_at", "is", null)
      .lt("deleted_at", cutoffIso)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { ok: false, error: error.message };
    const batch = (data ?? []) as DeletedTalentCandidate[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  // The pure rule is the authority; the query above only narrows the read.
  return { ok: true, ids: eligibleDeletedTalentIds(rows, now, graceDays), truncated };
}
