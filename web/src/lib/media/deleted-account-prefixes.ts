// ============================================================================
// deleted-account-prefixes.ts — TUL-231 / TUL-393 (pure).
//
// When an account deletion COMPLETES, the talent profile row is anonymised
// (`display_name` = DELETED_USER_LABEL) and `deleted_at` is stamped with the
// executor's `now` (anonymize.ts, hideTalentProfiles). So `deleted_at` IS the
// completion time, and "older than the grace" is completion + grace.
//
// Solo-owned workspaces are suspended at the same moment
// (`agencies.status = suspended`, `suspended_reason = owner_account_deleted`,
// see deletion.ts). That stamp is what unlocks `{tenantId}/staging/…`.
//
// The reaper protects whole prefixes whose owner it cannot prove gone. For a
// provably deleted talent / suspended sole-owner workspace that reasoning no
// longer holds for the owner's OWN prefix, so this module says when the
// PREFIX protection may be lifted. It lifts nothing else: external references,
// live rows, grace and lineage are still enforced by the classifier.
//
// Path layout:
//   media-originals  {talentId}/documents/…   released (talent marker)
//   media-originals  {talentId}/originals/…   released (talent marker)
//   media-public     talent-site-logos/{talentId}/…   released (talent marker)
//   media-public     talent-portfolio/{talentId}/…    released (talent marker)
//   *                {tenantId}/staging/…     released (workspace suspend marker)
//                    (bare `staging/…` and the sibling `talent/…` prefix stay)
// Every other protected prefix stays protected.
//
// Row-less objects under a released prefix are accounted for by the proven
// deleted owner (ownerAccountsForObject). The global unaccounted opt-in is
// never required and must stay off.
// ============================================================================

import { DELETED_USER_LABEL } from "@/lib/account/anonymize";
import { DEFAULT_GRACE_DAYS, matchProtectedRule } from "@/lib/media/reap-orphaned-media";

/**
 * Same string as `OWNER_DELETED_SUSPEND_REASON` in deletion.ts. Duplicated
 * here so this pure module does not import the executor graph.
 */
export const OWNER_DELETED_SUSPEND_REASON = "owner_account_deleted";

/** Protected-rule ids whose first path segment is the talent profile id. */
export const RELEASABLE_PREFIX_RULE_IDS: readonly string[] = [
  "talent-documents",
  "private-originals",
  "talent-site-logos",
  "talent-portfolio",
  "staging-uploads",
];

/** Prefixes keyed by the talent id in the SECOND segment. */
const SECOND_SEGMENT_PREFIXES = ["talent-site-logos", "talent-portfolio"] as const;

/** The owner id an object path is keyed by, for the releasable rules only. */
function keyedOwnerId(ruleId: string, storagePath: string): string | null {
  const parts = storagePath.split("/");
  if (ruleId === "talent-site-logos" || ruleId === "talent-portfolio") {
    // The `talent-portfolio` rule also matches `talent/…`, which is not talent-keyed.
    return (SECOND_SEGMENT_PREFIXES as readonly string[]).includes(parts[0]) && parts.length > 2
      ? parts[1]
      : null;
  }
  if (ruleId === "staging-uploads") {
    // Production writes `${tenantId}/staging/…`. Bare `staging/…` is not keyed.
    return parts.length > 2 && parts[1] === "staging" ? parts[0] : null;
  }
  return parts[0] || null;
}

export type DeletedTalentCandidate = {
  id: string;
  display_name: string | null;
  deleted_at: string | null;
};

export type DeletedTenantCandidate = {
  id: string;
  status: string | null;
  suspended_reason: string | null;
  suspended_at: string | null;
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

/**
 * Workspace marker (TUL-393): suspended solely because the owner deleted their
 * account, and `suspended_at` is strictly older than the grace. Other suspend
 * reasons never unlock staging.
 */
export function eligibleDeletedTenantIds(
  rows: readonly DeletedTenantCandidate[],
  now: Date,
  graceDays: number = DEFAULT_GRACE_DAYS,
): Set<string> {
  const cutoffMs = now.getTime() - graceDays * 24 * 60 * 60 * 1000;
  const ids = new Set<string>();
  for (const r of rows) {
    if (
      !r.id ||
      r.status !== "suspended" ||
      r.suspended_reason !== OWNER_DELETED_SUSPEND_REASON ||
      !r.suspended_at
    ) {
      continue;
    }
    const t = Date.parse(r.suspended_at);
    if (Number.isFinite(t) && t < cutoffMs) ids.add(r.id);
  }
  return ids;
}

export type DeletedAccountEligibleIds = {
  talentIds: ReadonlySet<string>;
  tenantIds: ReadonlySet<string>;
};

/** Does the PREFIX protection on this object no longer apply? */
export function isPrefixReleasedForDeletedTalent(
  eligibleTalentIds: ReadonlySet<string>,
  bucketId: string,
  storagePath: string,
  eligibleTenantIds: ReadonlySet<string> = new Set(),
): boolean {
  return isPrefixReleasedForDeletedAccount(
    { talentIds: eligibleTalentIds, tenantIds: eligibleTenantIds },
    bucketId,
    storagePath,
  );
}

export function isPrefixReleasedForDeletedAccount(
  eligible: DeletedAccountEligibleIds,
  bucketId: string,
  storagePath: string,
): boolean {
  if (eligible.talentIds.size === 0 && eligible.tenantIds.size === 0) return false;
  // The FIRST matching rule decides, so a path that another rule claims first
  // (e.g. `{id}/originals/reel/…`) stays protected.
  const rule = matchProtectedRule(bucketId, storagePath);
  if (!rule || !RELEASABLE_PREFIX_RULE_IDS.includes(rule.id)) return false;
  const ownerId = keyedOwnerId(rule.id, storagePath);
  if (ownerId === null) return false;
  if (rule.id === "staging-uploads") return eligible.tenantIds.has(ownerId);
  return eligible.talentIds.has(ownerId);
}
