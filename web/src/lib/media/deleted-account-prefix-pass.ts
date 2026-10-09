// TUL-231 / TUL-393 — wires the deleted-account prefix release into the reaper
// pass. Flag off (default) = DRY RUN: the returned plan is the NORMAL plan;
// the report only says what enforcing would release.
//
// Documents (no media_assets row) and staging objects under a proven-deleted
// owner are accounted for explicitly via ownerAccountsForObject — the global
// unaccounted opt-in is never used here.

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import {
  DEFAULT_GRACE_DAYS,
  classifyStorageObjects,
  type ClassifyInput,
  type ObjectVerdict,
  type ReapPlan,
} from "@/lib/media/reap-orphaned-media";
import { isPrefixReleasedForDeletedAccount } from "@/lib/media/deleted-account-prefixes";
import { loadEligibleDeletedAccountIds } from "@/lib/media/deleted-account-prefixes-io";

export type DeletedAccountPrefixReport = {
  enforce: boolean;
  /** false = the id lookup failed; nothing was released. */
  ok: boolean;
  error?: string;
  eligibleDeletedTalents: number;
  /** Solo-owned workspaces suspended because the owner deleted their account. */
  eligibleDeletedTenants: number;
  /** Objects (with a media_assets row) the release makes deletable that the normal plan keeps (pre-cap). */
  releasedCount: number;
  releasedBytes: number;
  /** Row-less objects that become deletable because the proven-deleted owner accounts for them (pre-cap). */
  ownerAccountedCount: number;
  ownerAccountedBytes: number;
  /** Of the above (released + owner-accounted), those under talent-site-logos/ or talent-portfolio/ (pre-cap). */
  siteAssetsCount: number;
  siteAssetsBytes: number;
  /** Of the above, those under `{tenantId}/staging/` (pre-cap). */
  stagingCount: number;
  stagingBytes: number;
  /** Objects under a released prefix still kept because they have no media_assets row. */
  stillUnaccountedCount: number;
  /** true = the release shaped the returned plan. */
  applied: boolean;
};

const EMPTY: DeletedAccountPrefixReport = {
  enforce: false,
  ok: true,
  eligibleDeletedTalents: 0,
  eligibleDeletedTenants: 0,
  releasedCount: 0,
  releasedBytes: 0,
  ownerAccountedCount: 0,
  ownerAccountedBytes: 0,
  siteAssetsCount: 0,
  siteAssetsBytes: 0,
  stagingCount: 0,
  stagingBytes: 0,
  stillUnaccountedCount: 0,
  applied: false,
};

function eligibleOf(plan: ReapPlan): ObjectVerdict[] {
  return [...plan.deletable, ...plan.kept.filter((k) => k.keepReason === "over_deletion_cap")];
}

function isStagingPath(storagePath: string): boolean {
  const parts = storagePath.split("/");
  return parts.length > 2 && parts[1] === "staging";
}

export async function planWithDeletedAccountPrefixes(args: {
  admin: SupabaseClient;
  input: ClassifyInput;
  enforce: boolean;
}): Promise<{ plan: ReapPlan; report: DeletedAccountPrefixReport }> {
  const { admin, input, enforce } = args;
  const normal = classifyStorageObjects(input);
  const lookup = await loadEligibleDeletedAccountIds(admin, input.now, input.graceDays ?? DEFAULT_GRACE_DAYS);
  if (!lookup.ok) {
    logServerError("media-reaper.deleted-account-prefix", lookup.error);
    return { plan: normal, report: { ...EMPTY, enforce, ok: false, error: lookup.error } };
  }
  if (lookup.talentIds.size === 0 && lookup.tenantIds.size === 0) {
    return { plan: normal, report: { ...EMPTY, enforce } };
  }

  const eligible = { talentIds: lookup.talentIds, tenantIds: lookup.tenantIds };
  const released = (bucketId: string, path: string) =>
    isPrefixReleasedForDeletedAccount(eligible, bucketId, path);
  const withRelease = classifyStorageObjects({
    ...input,
    releasedProtectedPrefix: released,
    // Explicit owner accounting for row-less documents / staging — never the
    // blanket unaccounted opt-in.
    ownerAccountsForObject: released,
  });
  const rowKeys = new Set(input.assets.map((a) => `${a.bucketId} ${a.storagePath}`));

  const before = new Set(eligibleOf(normal).map((v) => `${v.bucketId} ${v.storagePath}`));
  const added = eligibleOf(withRelease).filter((v) => !before.has(`${v.bucketId} ${v.storagePath}`));
  const isOwnerAccounted = (v: ObjectVerdict) =>
    !rowKeys.has(`${v.bucketId} ${v.storagePath}`);
  const ownerAccounted = added.filter(isOwnerAccounted);
  const releasedOnly = added.filter((v) => !isOwnerAccounted(v));
  const siteAssets = added.filter(
    (v) => v.storagePath.startsWith("talent-site-logos/") || v.storagePath.startsWith("talent-portfolio/"),
  );
  const staging = added.filter((v) => isStagingPath(v.storagePath));
  const stillUnaccounted = withRelease.kept.filter(
    (k) =>
      (k.keepReason === "unaccounted_no_asset_row" || k.keepReason === "unaccounted_within_grace") &&
      released(k.bucketId, k.storagePath),
  );

  return {
    plan: enforce ? withRelease : normal,
    report: {
      enforce,
      ok: true,
      eligibleDeletedTalents: lookup.talentIds.size,
      eligibleDeletedTenants: lookup.tenantIds.size,
      releasedCount: releasedOnly.length,
      releasedBytes: releasedOnly.reduce((n, v) => n + v.sizeBytes, 0),
      ownerAccountedCount: ownerAccounted.length,
      ownerAccountedBytes: ownerAccounted.reduce((n, v) => n + v.sizeBytes, 0),
      siteAssetsCount: siteAssets.length,
      siteAssetsBytes: siteAssets.reduce((n, v) => n + v.sizeBytes, 0),
      stagingCount: staging.length,
      stagingBytes: staging.reduce((n, v) => n + v.sizeBytes, 0),
      stillUnaccountedCount: stillUnaccounted.length,
      applied: enforce,
    },
  };
}
