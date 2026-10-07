// ============================================================================
// deleted-account-prefixes.ts — TUL-231 (pure).
//
// When an account deletion COMPLETES, the talent profile row is anonymised
// (`display_name` = DELETED_USER_LABEL) and `deleted_at` is stamped with the
// executor's `now` (anonymize.ts, hideTalentProfiles). So `deleted_at` IS the
// completion time, and "older than the grace" is completion + grace.
//
// The reaper protects whole prefixes whose owner it cannot prove gone. For a
// provably deleted talent that reasoning no longer holds for the talent's OWN
// prefix, so this module says when the PREFIX protection may be lifted. It
// lifts nothing else: external references, live rows, grace and lineage are
// still enforced by the classifier.
//
// Path layout (first segment = talent_profiles.id):
//   media-originals  {talentId}/documents/…   released here
//   media-originals  {talentId}/originals/…   released here
// Every other protected prefix stays protected.
// ============================================================================

import { DELETED_USER_LABEL } from "@/lib/account/anonymize";
import { DEFAULT_GRACE_DAYS, matchProtectedRule } from "@/lib/media/reap-orphaned-media";

/** Protected-rule ids whose first path segment is the talent profile id. */
export const RELEASABLE_PREFIX_RULE_IDS: readonly string[] = ["talent-documents", "private-originals"];

export type DeletedTalentCandidate = {
  id: string;
  display_name: string | null;
  deleted_at: string | null;
};

/**
 * THE marker rule (one, strict): anonymised label AND a `deleted_at` that is
 * set, parseable and strictly older than the grace. Anything else stays
 * protected.
 */
export function eligibleDeletedTalentIds(
  rows: readonly DeletedTalentCandidate[],
  now: Date,
  graceDays: number = DEFAULT_GRACE_DAYS,
): Set<string> {
  const cutoffMs = now.getTime() - graceDays * 24 * 60 * 60 * 1000;
  const ids = new Set<string>();
  for (const r of rows) {
    if (!r.id || r.display_name !== DELETED_USER_LABEL || !r.deleted_at) continue;
    const t = Date.parse(r.deleted_at);
    if (Number.isFinite(t) && t < cutoffMs) ids.add(r.id);
  }
  return ids;
}

/** Does the PREFIX protection on this object no longer apply? */
export function isPrefixReleasedForDeletedTalent(
  eligibleTalentIds: ReadonlySet<string>,
  bucketId: string,
  storagePath: string,
): boolean {
  if (eligibleTalentIds.size === 0) return false;
  // The FIRST matching rule decides, so a path that another rule claims first
  // (e.g. `{id}/originals/reel/…`) stays protected.
  const rule = matchProtectedRule(bucketId, storagePath);
  if (!rule || !RELEASABLE_PREFIX_RULE_IDS.includes(rule.id)) return false;
  const talentId = storagePath.split("/", 1)[0];
  return eligibleTalentIds.has(talentId);
}
